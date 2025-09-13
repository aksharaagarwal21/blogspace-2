const express = require('express');
const User = require('../models/User');
const Blog = require('../models/Blog');
const Comment = require('../models/Comment');
const { auth } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found! 🔍'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching profile'
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', [
  auth,
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters'),
  body('avatar')
    .optional()
    .isURL()
    .withMessage('Avatar must be a valid URL')
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

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found! 🔍'
      });
    }

    const allowedUpdates = ['name', 'bio', 'avatar'];
    const updates = {};

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    Object.assign(user, updates);
    await user.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      success: true,
      message: 'Profile updated successfully! ✨',
      data: userResponse
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile'
    });
  }
});

// @route   GET /api/users/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found! 🔍'
      });
    }

    // Get real-time stats
    const [totalBlogs, totalViews, totalLikes, totalComments] = await Promise.all([
      Blog.countDocuments({ author: req.user.userId, isActive: true }),
      Blog.aggregate([
        { $match: { author: user._id, isActive: true } },
        { $group: { _id: null, totalViews: { $sum: '$views' } } }
      ]),
      Blog.aggregate([
        { $match: { author: user._id, isActive: true } },
        { $group: { _id: null, totalLikes: { $sum: '$likesCount' } } }
      ]),
      Comment.countDocuments({ 
        blog: { $in: await Blog.find({ author: req.user.userId, isActive: true }).distinct('_id') },
        isActive: true 
      })
    ]);

    const stats = {
      totalBlogs,
      totalViews: totalViews[0]?.totalViews || 0,
      totalLikes: totalLikes[0]?.totalLikes || 0,
      totalComments
    };

    // Update user stats in database
    user.stats = stats;
    await user.save();

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user statistics'
    });
  }
});

// @route   GET /api/users/:id/public
// @desc    Get public user profile
// @access  Public
router.get('/:id/public', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name avatar bio stats createdAt')
      .lean();

    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found! 🔍'
      });
    }

    // Get user's published blogs
    const blogs = await Blog.find({
      author: req.params.id,
      status: 'published',
      isActive: true
    })
      .select('title excerpt category createdAt views likesCount commentsCount')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      data: {
        user,
        recentBlogs: blogs
      }
    });

  } catch (error) {
    console.error('Get public profile error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'User not found! 🔍'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while fetching public profile'
    });
  }
});

// @route   DELETE /api/users/account
// @desc    Delete user account (soft delete)
// @access  Private
router.delete('/account', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found! 🔍'
      });
    }

    // Soft delete user
    user.isActive = false;
    await user.save();

    // Soft delete all user's blogs
    await Blog.updateMany(
      { author: req.user.userId },
      { isActive: false }
    );

    // Soft delete all user's comments
    await Comment.updateMany(
      { author: req.user.userId },
      { isActive: false }
    );

    res.json({
      success: true,
      message: 'Account deleted successfully! We\'re sorry to see you go. 👋'
    });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting account'
    });
  }
});

module.exports = router;
