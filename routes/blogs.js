const express = require('express');
const Blog = require('../models/Blog');
const User = require('../models/User');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Simple validation helpers
const validateBlogCreate = (req, res, next) => {
  const { title, content, category } = req.body;
  const errors = [];

  if (!title || title.trim().length < 5 || title.trim().length > 100) {
    errors.push({ field: 'title', message: 'Title must be between 5 and 100 characters' });
  }

  if (!content || content.trim().length < 50) {
    errors.push({ field: 'content', message: 'Content must be at least 50 characters' });
  }

  const validCategories = ['Technology', 'Lifestyle', 'Travel', 'Food', 'Business', 'Health', 'Education', 'Entertainment', 'Other'];
  if (!category || !validCategories.includes(category)) {
    errors.push({ field: 'category', message: 'Please select a valid category' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

// @route   GET /api/blogs/my-blogs
// @desc    Get current user's blogs
// @access  Private
router.get('/my-blogs', auth, async (req, res) => {
  try {
    console.log('🔧 Fetching my-blogs for user:', req.user.userId);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const blogs = await Blog.find({ 
      author: req.user.userId,
      isActive: true
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name email avatar')
      .lean();

    console.log('✅ Found blogs:', blogs.length);

    // Add computed fields
    const blogsWithStats = blogs.map(blog => ({
      ...blog,
      views: blog.views || 0,
      likesCount: blog.likesCount || 0,
      commentsCount: blog.commentsCount || 0
    }));

    const totalBlogs = await Blog.countDocuments({ 
      author: req.user.userId,
      isActive: true
    });

    res.json({
      success: true,
      data: blogsWithStats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalBlogs / limit),
        totalBlogs,
        hasNext: page < Math.ceil(totalBlogs / limit),
        hasPrev: page > 1
      },
      message: `Found ${blogsWithStats.length} blogs`
    });

  } catch (error) {
    console.error('❌ Get my blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching your blogs'
    });
  }
});

// @route   GET /api/blogs/categories
// @desc    Get all blog categories with counts
// @access  Public
router.get('/categories', async (req, res) => {
  try {
    const categories = await Blog.aggregate([
      { $match: { status: 'published', isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching categories'
    });
  }
});

// @route   GET /api/blogs
// @desc    Get all blogs with filtering, searching, and pagination
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { category, search, author, tag, sort = 'newest' } = req.query;

    // Build query
    let query = { status: 'published', isActive: true };

    if (category) {
      query.category = category;
    }

    if (author) {
      query.author = author;
    }

    if (tag) {
      query.tags = { $in: [tag.toLowerCase()] };
    }

    // Build sort
    let sortQuery = {};
    switch (sort) {
      case 'oldest':
        sortQuery = { createdAt: 1 };
        break;
      case 'popular':
        sortQuery = { views: -1, likesCount: -1 };
        break;
      case 'liked':
        sortQuery = { likesCount: -1 };
        break;
      default:
        sortQuery = { createdAt: -1 };
    }

    let blogsQuery;
    if (search) {
      blogsQuery = Blog.find({
        ...query,
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } },
          { tags: { $in: [new RegExp(search, 'i')] } }
        ]
      }).sort(sortQuery);
    } else {
      blogsQuery = Blog.find(query).sort(sortQuery);
    }

    const blogs = await blogsQuery
      .skip(skip)
      .limit(limit)
      .populate('author', 'name avatar bio')
      .lean();

    // Add user-specific data (likes)
    if (req.user) {
      blogs.forEach(blog => {
        blog.isLiked = blog.likes?.some(like => like.user.toString() === req.user.userId.toString()) || false;
      });
    }

    // Get total count for pagination
    const totalBlogs = search 
      ? await Blog.countDocuments({
          ...query,
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { content: { $regex: search, $options: 'i' } },
            { tags: { $in: [new RegExp(search, 'i')] } }
          ]
        })
      : await Blog.countDocuments(query);

    const totalPages = Math.ceil(totalBlogs / limit);

    res.json({
      success: true,
      data: {
        blogs,
        pagination: {
          currentPage: page,
          totalPages,
          totalBlogs,
          hasNext: page < totalPages,
          hasPrev: page > 1,
          limit
        }
      }
    });

  } catch (error) {
    console.error('Get blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching blogs'
    });
  }
});

// @route   POST /api/blogs
// @desc    Create new blog
// @access  Private
router.post('/', auth, validateBlogCreate, async (req, res) => {
  try {
    const { title, content, excerpt, category, tags, featuredImage, status } = req.body;

    console.log('🔧 Creating blog with data:', {
      title: title?.substring(0, 50) + '...',
      contentLength: content?.length,
      category,
      status: status || 'draft',
      author: req.user.userId
    });

    const blog = new Blog({
      title: title.trim(),
      content: content.trim(),
      excerpt: excerpt?.trim() || content.substring(0, 200) + '...',
      category,
      tags: Array.isArray(tags) ? tags.map(tag => tag.toLowerCase().trim()) : [],
      featuredImage,
      status: status || 'draft',
      author: req.user.userId,
      views: 0,
      likes: [],
      comments: [],
      isActive: true
    });

    await blog.save();
    await blog.populate('author', 'name avatar');

    console.log('✅ Blog created successfully:', blog._id);

    // Update user stats (optional, only if User model has stats)
    try {
      await User.findByIdAndUpdate(req.user.userId, {
        $inc: { 'stats.totalBlogs': 1 }
      });
    } catch (statError) {
      console.log('⚠️ User stats update skipped (no stats field)');
    }

    res.status(201).json({
      success: true,
      message: `Blog ${status === 'published' ? 'published' : 'saved as draft'} successfully! ✨`,
      data: blog
    });

  } catch (error) {
    console.error('❌ Create blog error:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while creating blog'
    });
  }
});

// @route   GET /api/blogs/:id
// @desc    Get single blog
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    console.log('🔧 Fetching blog:', req.params.id);

    const blog = await Blog.findById(req.params.id)
      .populate('author', 'name avatar bio')
      .populate('comments.author', 'name avatar');

    if (!blog || !blog.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Increment view count (only if not the author viewing)
    if (!req.user || req.user.userId !== blog.author._id.toString()) {
      blog.views = (blog.views || 0) + 1;
      await blog.save();
    }

    // Add user-specific data
    let isLiked = false;
    let isAuthor = false;
    
    if (req.user) {
      isLiked = blog.likes?.some(like => like.user.toString() === req.user.userId.toString()) || false;
      isAuthor = blog.author._id.toString() === req.user.userId.toString();
    }

    const blogData = {
      ...blog.toJSON(),
      likesCount: blog.likesCount || 0,
      commentsCount: blog.commentsCount || 0,
      isLiked,
      isAuthor
    };

    console.log('✅ Blog fetched successfully with', blog.comments?.length || 0, 'comments');

    res.json({
      success: true,
      data: blogData
    });

  } catch (error) {
    console.error('❌ Get blog error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid blog ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching blog'
    });
  }
});

// @route   PUT /api/blogs/:id
// @desc    Update blog
// @access  Private
router.put('/:id', auth, validateBlogCreate, async (req, res) => {
  try {
    console.log('🔧 Updating blog:', req.params.id);

    const blog = await Blog.findById(req.params.id);

    if (!blog || !blog.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Check if user owns the blog
    if (blog.author.toString() !== req.user.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this blog'
      });
    }

    const { title, content, excerpt, category, tags, featuredImage, status } = req.body;

    blog.title = title?.trim() || blog.title;
    blog.content = content?.trim() || blog.content;
    blog.excerpt = excerpt?.trim() || blog.excerpt;
    blog.category = category || blog.category;
    blog.tags = Array.isArray(tags) ? tags.map(tag => tag.toLowerCase().trim()) : blog.tags;
    blog.featuredImage = featuredImage !== undefined ? featuredImage : blog.featuredImage;
    blog.status = status || blog.status;
    blog.updatedAt = Date.now();

    await blog.save();
    await blog.populate('author', 'name avatar');

    console.log('✅ Blog updated successfully');

    res.json({
      success: true,
      message: `Blog ${blog.status === 'published' ? 'published' : 'updated'} successfully! ✨`,
      data: blog
    });

  } catch (error) {
    console.error('❌ Update blog error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid blog ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating blog'
    });
  }
});

// @route   DELETE /api/blogs/:id
// @desc    Delete blog (soft delete)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    console.log('🔧 Deleting blog:', req.params.id);

    const blog = await Blog.findById(req.params.id);

    if (!blog || !blog.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Check if user owns the blog
    if (blog.author.toString() !== req.user.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this blog'
      });
    }

    // Soft delete - mark as inactive
    blog.isActive = false;
    blog.deletedAt = Date.now();
    await blog.save();

    console.log('✅ Blog deleted successfully');

    // Update user stats (optional)
    try {
      await User.findByIdAndUpdate(req.user.userId, {
        $inc: { 'stats.totalBlogs': -1 }
      });
    } catch (statError) {
      console.log('⚠️ User stats update skipped');
    }

    res.json({
      success: true,
      message: 'Blog deleted successfully! 🗑️'
    });

  } catch (error) {
    console.error('❌ Delete blog error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid blog ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while deleting blog'
    });
  }
});

// @route   POST /api/blogs/:id/like
// @desc    Like/Unlike blog
// @access  Private
router.post('/:id/like', auth, async (req, res) => {
  try {
    console.log('🔧 Toggling like for blog:', req.params.id);

    const blog = await Blog.findById(req.params.id);

    if (!blog || !blog.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    const userId = req.user.userId;
    const likeIndex = blog.likes.findIndex(like => like.user.toString() === userId.toString());

    if (likeIndex === -1) {
      // Add like
      blog.likes.push({ user: userId, createdAt: new Date() });
      await blog.save();

      console.log('✅ Blog liked');

      res.json({
        success: true,
        message: 'Blog liked! ❤️',
        isLiked: true,
        likesCount: blog.likesCount
      });
    } else {
      // Remove like
      blog.likes.splice(likeIndex, 1);
      await blog.save();

      console.log('✅ Blog unliked');

      res.json({
        success: true,
        message: 'Blog unliked!',
        isLiked: false,
        likesCount: blog.likesCount
      });
    }

  } catch (error) {
    console.error('❌ Like blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while liking blog'
    });
  }
});

// @route   POST /api/blogs/:id/comment
// @desc    Add comment to blog
// @access  Private
router.post('/:id/comment', auth, async (req, res) => {
  try {
    console.log('🔧 Adding comment to blog:', req.params.id);

    const { content } = req.body;

    if (!content || content.trim().length < 1) {
      return res.status(400).json({
        success: false,
        message: 'Comment content is required'
      });
    }

    if (content.trim().length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Comment cannot exceed 1000 characters'
      });
    }

    const blog = await Blog.findById(req.params.id);

    if (!blog || !blog.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Create new comment object
    const newComment = {
      content: content.trim(),
      author: req.user.userId,
      createdAt: new Date()
    };

    // Add comment to blog
    blog.comments.push(newComment);
    await blog.save();

    // Populate the newly added comment's author data
    await blog.populate('comments.author', 'name avatar');

    // Get the newly added comment (last one in the array)
    const addedComment = blog.comments[blog.comments.length - 1];

    console.log('✅ Comment added successfully');

    res.status(201).json({
      success: true,
      message: 'Comment added successfully! 💬',
      data: addedComment
    });

  } catch (error) {
    console.error('❌ Add comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding comment'
    });
  }
});

module.exports = router;








