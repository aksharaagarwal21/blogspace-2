const Blog = require('../models/Blog');
const User = require('../models/User');
const Comment = require('../models/Comment');
const { validationResult } = require('express-validator');

// @desc    Get all blogs (public)
// @route   GET /api/blogs
// @access  Public
exports.getAllBlogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      tags,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      author
    } = req.query;

    // Build filter query
    let filter = { 
      status: 'published', 
      isPublic: true 
    };

    // Add category filter
    if (category && category !== 'all') {
      filter.category = category;
    }

    // Add tags filter
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim());
      filter.tags = { $in: tagArray };
    }

    // Add author filter
    if (author) {
      filter.author = author;
    }

    // Add search filter
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const blogs = await Blog.find(filter)
      .populate('author', 'name avatar bio')
      .select('-content') // Exclude full content for list view
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Blog.countDocuments(filter);

    res.json({
      success: true,
      data: {
        blogs,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalBlogs: total,
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get all blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching blogs'
    });
  }
};

// @desc    Get single blog by ID
// @route   GET /api/blogs/:id
// @access  Public
exports.getBlogById = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id)
      .populate('author', 'name avatar bio totalBlogsCreated')
      .populate({
        path: 'comments',
        populate: {
          path: 'author',
          select: 'name avatar'
        },
        options: { sort: { createdAt: -1 } }
      });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    // Check if blog is accessible
    if (blog.status !== 'published' || !blog.isPublic) {
      return res.status(403).json({
        success: false,
        message: 'Blog not accessible'
      });
    }

    // Increment view count (async, don't wait)
    blog.incrementViews().catch(console.error);

    // Check if user has liked this blog
    let isLiked = false;
    if (req.user) {
      isLiked = blog.likes.some(like => 
        like.user.toString() === req.user.id.toString()
      );
    }

    // Transform response
    const blogResponse = {
      ...blog.toObject(),
      isLiked,
      likesCount: blog.likesCount,
      commentsCount: blog.commentsCount
    };

    res.json({
      success: true,
      data: blogResponse
    });

  } catch (error) {
    console.error('Get blog by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching blog'
    });
  }
};

// @desc    Create new blog
// @route   POST /api/blogs
// @access  Private
exports.createBlog = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      title,
      content,
      excerpt,
      tags,
      category,
      featuredImage,
      status = 'published'
    } = req.body;

    // Create blog
    const blog = new Blog({
      title: title.trim(),
      content,
      excerpt: excerpt ? excerpt.trim() : undefined,
      author: req.user.id,
      tags: tags ? tags.map(tag => tag.toLowerCase().trim()) : [],
      category: category || 'Other',
      featuredImage,
      status
    });

    await blog.save();

    // Update user's blog count
    await User.findByIdAndUpdate(req.user.id, {
      $push: { blogs: blog._id },
      $inc: { totalBlogsCreated: 1 }
    });

    // Populate author info
    await blog.populate('author', 'name avatar');

    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      data: blog
    });

  } catch (error) {
    console.error('Create blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating blog'
    });
  }
};

// @desc    Update blog
// @route   PUT /api/blogs/:id
// @access  Private
exports.updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      excerpt,
      tags,
      category,
      featuredImage,
      status
    } = req.body;

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    // Check ownership
    if (blog.author.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this blog'
      });
    }

    // Update fields
    if (title) blog.title = title.trim();
    if (content) blog.content = content;
    if (excerpt !== undefined) blog.excerpt = excerpt.trim();
    if (tags) blog.tags = tags.map(tag => tag.toLowerCase().trim());
    if (category) blog.category = category;
    if (featuredImage !== undefined) blog.featuredImage = featuredImage;
    if (status) blog.status = status;

    await blog.save();
    await blog.populate('author', 'name avatar');

    res.json({
      success: true,
      message: 'Blog updated successfully',
      data: blog
    });

  } catch (error) {
    console.error('Update blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating blog'
    });
  }
};

// @desc    Delete blog
// @route   DELETE /api/blogs/:id
// @access  Private
exports.deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    // Check ownership or admin role
    if (blog.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this blog'
      });
    }

    // Delete associated comments
    await Comment.deleteMany({ blog: id });

    // Remove blog from user's blogs array
    await User.findByIdAndUpdate(blog.author, {
      $pull: { blogs: id },
      $inc: { totalBlogsCreated: -1 }
    });

    // Delete the blog
    await Blog.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Blog deleted successfully'
    });

  } catch (error) {
    console.error('Delete blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting blog'
    });
  }
};

// @desc    Toggle like on blog
// @route   POST /api/blogs/:id/like
// @access  Private
exports.toggleLike = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    const isLiked = blog.toggleLike(req.user.id);
    await blog.save();

    // Update author's total likes
    const likesChange = isLiked ? 1 : -1;
    await User.findByIdAndUpdate(blog.author, {
      $inc: { totalLikes: likesChange }
    });

    res.json({
      success: true,
      message: isLiked ? 'Blog liked' : 'Blog unliked',
      data: {
        isLiked,
        likesCount: blog.likesCount
      }
    });

  } catch (error) {
    console.error('Toggle like error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error toggling like'
    });
  }
};

// @desc    Get user's own blogs
// @route   GET /api/blogs/user/me
// @access  Private
exports.getMyBlogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    let filter = { author: req.user.id };
    if (status && status !== 'all') {
      filter.status = status;
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const blogs = await Blog.find(filter)
      .select('-content') // Exclude content for list view
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Blog.countDocuments(filter);

    res.json({
      success: true,
      data: {
        blogs,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalBlogs: total
        }
      }
    });

  } catch (error) {
    console.error('Get my blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching your blogs'
    });
  }
};

// @desc    Get popular blogs
// @route   GET /api/blogs/popular
// @access  Public
exports.getPopularBlogs = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const blogs = await Blog.getPopular(limit);

    res.json({
      success: true,
      data: blogs
    });

  } catch (error) {
    console.error('Get popular blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching popular blogs'
    });
  }
};



