const Blog = require('../models/Blog');
const Comment = require('../models/Comment');
const User = require('../models/User');

// @desc    Get dashboard analytics
// @route   GET /api/dashboard/analytics
// @access  Private
exports.getDashboardAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's blogs statistics
    const userBlogs = await Blog.find({ author: userId });
    const totalBlogs = userBlogs.length;
    
    // Calculate total views, likes, and comments for user's blogs
    const totalViews = userBlogs.reduce((sum, blog) => sum + blog.views, 0);
    const totalLikes = userBlogs.reduce((sum, blog) => sum + blog.likesCount, 0);
    const totalComments = userBlogs.reduce((sum, blog) => sum + blog.commentsCount, 0);

    // Get recent blogs (last 5)
    const recentBlogs = await Blog.find({ author: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title createdAt status views likesCount commentsCount');

    // Get popular blogs (top 5 by views)
    const popularBlogs = await Blog.find({ author: userId })
      .sort({ views: -1, likesCount: -1 })
      .limit(5)
      .select('title views likesCount commentsCount createdAt');

    // Get monthly blog creation stats (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyStats = await Blog.aggregate([
      {
        $match: {
          author: userId,
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          views: { $sum: '$views' },
          likes: { $sum: '$likesCount' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Get blog status distribution
    const statusStats = await Blog.aggregate([
      { $match: { author: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get category distribution
    const categoryStats = await Blog.aggregate([
      { $match: { author: userId } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          views: { $sum: '$views' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get recent comments on user's blogs
    const recentComments = await Comment.find({
      blog: { $in: userBlogs.map(blog => blog._id) }
    })
      .populate('author', 'name avatar')
      .populate('blog', 'title')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      data: {
        overview: {
          totalBlogs,
          totalViews,
          totalLikes,
          totalComments
        },
        recentBlogs,
        popularBlogs,
        monthlyStats,
        statusStats,
        categoryStats,
        recentComments
      }
    });

  } catch (error) {
    console.error('Get dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching analytics'
    });
  }
};

// @desc    Get blog performance details
// @route   GET /api/dashboard/blog/:id/performance
// @access  Private
exports.getBlogPerformance = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const blog = await Blog.findOne({ _id: id, author: userId })
      .populate('comments', 'createdAt author')
      .populate('author', 'name');

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found or not authorized'
      });
    }

    // Get daily views for the last 30 days (simulated data - in real app, track this)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get comments over time
    const commentsByDay = await Comment.aggregate([
      {
        $match: {
          blog: blog._id,
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        blog: {
          id: blog._id,
          title: blog.title,
          createdAt: blog.createdAt,
          views: blog.views,
          likesCount: blog.likesCount,
          commentsCount: blog.commentsCount,
          status: blog.status
        },
        commentsByDay,
        engagement: {
          avgCommentsPerDay: commentsByDay.length > 0 
            ? commentsByDay.reduce((sum, day) => sum + day.count, 0) / commentsByDay.length 
            : 0,
          likesToViewsRatio: blog.views > 0 ? (blog.likesCount / blog.views * 100).toFixed(2) : 0,
          commentsToViewsRatio: blog.views > 0 ? (blog.commentsCount / blog.views * 100).toFixed(2) : 0
        }
      }
    });

  } catch (error) {
    console.error('Get blog performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching blog performance'
    });
  }
};

// @desc    Get overall platform stats (admin only)
// @route   GET /api/dashboard/platform-stats
// @access  Private (Admin)
exports.getPlatformStats = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const totalUsers = await User.countDocuments({ isActive: true });
    const totalBlogs = await Blog.countDocuments({ status: 'published' });
    const totalComments = await Comment.countDocuments();

    // Get new users this month
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const newUsersThisMonth = await User.countDocuments({
      createdAt: { $gte: startOfMonth },
      isActive: true
    });

    // Get most active users
    const activeUsers = await User.find({ isActive: true })
      .sort({ totalBlogsCreated: -1, totalLikes: -1 })
      .limit(10)
      .select('name email totalBlogsCreated totalLikes createdAt');

    // Get recent activity
    const recentBlogs = await Blog.find({ status: 'published' })
      .populate('author', 'name')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title author createdAt views likesCount');

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalBlogs,
          totalComments,
          newUsersThisMonth
        },
        activeUsers,
        recentBlogs
      }
    });

  } catch (error) {
    console.error('Get platform stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching platform stats'
    });
  }
};

