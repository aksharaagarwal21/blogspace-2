const express = require('express');
const Comment = require('../models/Comment');
const Blog = require('../models/Blog');
const User = require('../models/User');
const { auth, optionalAuth } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// @route   GET /api/comments/:blogId
// @desc    Get all comments for a blog
// @access  Public
router.get('/:blogId', optionalAuth, async (req, res) => {
  try {
    const { blogId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Check if blog exists
    const blog = await Blog.findById(blogId);
    if (!blog || !blog.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found! 🔍'
      });
    }

    const comments = await Comment.find({
      blog: blogId,
      isActive: true,
      parentComment: null // Only top-level comments
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name avatar')
      .populate({
        path: 'replies',
        populate: {
          path: 'author',
          select: 'name avatar'
        },
        match: { isActive: true }
      })
      .lean();

    // Add user-specific data
    if (req.user) {
      const addUserData = (comment) => {
        comment.isLiked = comment.likes?.some(like => like.user.toString() === req.user.userId.toString()) || false;
        if (comment.replies) {
          comment.replies.forEach(addUserData);
        }
      };
      comments.forEach(addUserData);
    }

    const totalComments = await Comment.countDocuments({
      blog: blogId,
      isActive: true
    });

    res.json({
      success: true,
      data: comments,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalComments / limit),
        totalComments,
        hasNext: page < Math.ceil(totalComments / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get comments error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found! 🔍'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while fetching comments'
    });
  }
});

// @route   POST /api/comments/:blogId
// @desc    Add comment to blog
// @access  Private
router.post('/:blogId', [
  auth,
  body('content')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Comment must be between 1 and 1000 characters'),
  body('parentComment')
    .optional()
    .isMongoId()
    .withMessage('Parent comment must be a valid ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { blogId } = req.params;
    const { content, parentComment } = req.body;

    // Check if blog exists and is published
    const blog = await Blog.findById(blogId);
    if (!blog || !blog.isActive || blog.status !== 'published') {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found! 🔍'
      });
    }

    // If it's a reply, check if parent comment exists
    if (parentComment) {
      const parent = await Comment.findById(parentComment);
      if (!parent || !parent.isActive || parent.blog.toString() !== blogId) {
        return res.status(404).json({
          success: false,
          message: 'Parent comment not found! 🔍'
        });
      }
    }

    const comment = new Comment({
      content,
      author: req.user.userId,
      blog: blogId,
      parentComment: parentComment || null
    });

    await comment.save();
    await comment.populate('author', 'name avatar');

    // If it's a reply, add to parent's replies
    if (parentComment) {
      await Comment.findByIdAndUpdate(parentComment, {
        $push: { replies: comment._id }
      });
    }

    // Update blog's comment count
    const commentsCount = await Comment.countDocuments({
      blog: blogId,
      isActive: true
    });
    
    await Blog.findByIdAndUpdate(blogId, { commentsCount });

    // Update user stats
    await User.findByIdAndUpdate(blog.author, {
      $inc: { 'stats.totalComments': 1 }
    });

    res.status(201).json({
      success: true,
      message: 'Comment added successfully! 💬',
      data: comment
    });

  } catch (error) {
    console.error('Add comment error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found! 🔍'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while adding comment'
    });
  }
});

// @route   PUT /api/comments/:id
// @desc    Update comment
// @access  Private
router.put('/:id', [
  auth,
  body('content')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Comment must be between 1 and 1000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const comment = await Comment.findById(req.params.id)
      .populate('author', 'name avatar');

    if (!comment || !comment.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found! 🔍'
      });
    }

    // Check if user owns the comment
    if (comment.author._id.toString() !== req.user.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this comment! 🚫'
      });
    }

    comment.content = req.body.content;
    await comment.save();

    res.json({
      success: true,
      message: 'Comment updated successfully! ✨',
      data: comment
    });

  } catch (error) {
    console.error('Update comment error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'Comment not found! 🔍'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while updating comment'
    });
  }
});

// @route   DELETE /api/comments/:id
// @desc    Delete comment (soft delete)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment || !comment.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found! 🔍'
      });
    }

    // Check if user owns the comment
    if (comment.author.toString() !== req.user.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this comment! 🚫'
      });
    }

    // Soft delete
    comment.isActive = false;
    await comment.save();

    // Update blog's comment count
    const commentsCount = await Comment.countDocuments({
      blog: comment.blog,
      isActive: true
    });
    
    await Blog.findByIdAndUpdate(comment.blog, { commentsCount });

    // Update user stats
    const blog = await Blog.findById(comment.blog);
    if (blog) {
      await User.findByIdAndUpdate(blog.author, {
        $inc: { 'stats.totalComments': -1 }
      });
    }

    res.json({
      success: true,
      message: 'Comment deleted successfully! 🗑️'
    });

  } catch (error) {
    console.error('Delete comment error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'Comment not found! 🔍'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while deleting comment'
    });
  }
});

// @route   POST /api/comments/:id/like
// @desc    Toggle like on comment
// @access  Private
router.post('/:id/like', auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment || !comment.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found! 🔍'
      });
    }

    const userId = req.user.userId;
    const existingLike = comment.likes.find(like => like.user.toString() === userId.toString());

    if (existingLike) {
      // Unlike
      comment.likes = comment.likes.filter(like => like.user.toString() !== userId.toString());
    } else {
      // Like
      comment.likes.push({ user: userId });
    }

    comment.likesCount = comment.likes.length;
    await comment.save();

    res.json({
      success: true,
      message: existingLike ? 'Like removed from comment! 🤍' : 'Comment liked! ❤️',
      data: {
        likesCount: comment.likesCount,
        isLiked: !existingLike
      }
    });

  } catch (error) {
    console.error('Toggle comment like error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'Comment not found! 🔍'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while toggling comment like'
    });
  }
});

module.exports = router;


