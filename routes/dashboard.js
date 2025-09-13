const express = require('express');
const Blog = require('../models/Blog');
const Comment = require('../models/Comment');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/dashboard/analytics
// @desc    Get dashboard analytics for current user
// @access  Private
router.get('/analytics', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get user's blogs
    const userBlogs = await Blog.find({ 
      author: userId, 
      isActive: true 
    }).select('_id').lean();
    
    const userBlogIds = userBlogs.map(blog => blog._id);

    // Overview statistics
    const [totalBlogs, totalViews, totalLikes, totalComments] = await Promise.all([
      Blog.countDocuments({ author: userId, isActive: true }),
      Blog.aggregate([
        { $match: { author: userId, isActive: true } },
        { $group: { _id: null, total: { $sum: '$views' } } }
      ]),
      Blog.aggregate([
        { $match: { author: userId, isActive: true } },
        { $group: { _id: null, total: { $sum: '$likesCount' } } }
      ]),
      Comment.countDocuments({ 
        blog: { $in: userBlogIds },
        isActive: true 
      })
    ]);

    const overview = {
      totalBlogs,
      totalViews: totalViews[0]?.total || 0,
      totalLikes: totalLikes[0]?.total || 0,
      totalComments
    };

    // Recent blogs (last 5)
    const recentBlogs = await Blog.find({
      author: userId,
      isActive: true
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title status createdAt views likesCount commentsCount')
      .lean();

    // Popular blogs (top 5 by views)
    const popularBlogs = await Blog.find({
      author: userId,
      isActive: true,
      status: 'published'
    })
      .sort({ views: -1, likesCount: -1 })
      .limit(5)
      .select('title views likesCount commentsCount createdAt')
      .lean();

    // Category statistics
    const categoryStats = await Blog.aggregate([
      { 
        $match: { 
          author: userId, 
          isActive: true 
        } 
      },
      { 
        $group: { 
          _id: '$category', 
          count: { $sum: 1 },
          totalViews: { $sum: '$views' },
          totalLikes: { $sum: '$likesCount' }
        } 
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Recent comments on user's blogs
    const recentComments = await Comment.find({
      blog: { $in: userBlogIds },
      isActive: true
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('author', 'name avatar')
      .populate('blog', 'title')
      .select('content createdAt')
      .lean();

    // Monthly analytics (last 12 months)
    const monthlyStats = await Blog.aggregate([
      {
        $match: {
          author: userId,
          isActive: true,
          createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          blogs: { $sum: 1 },
          views: { $sum: '$views' },
          likes: { $sum: '$likesCount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Growth metrics (comparing last 30 days vs previous 30 days)
    const last30DaysBlogs = await Blog.countDocuments({
      author: userId,
      isActive: true,
      createdAt: { $gte: thirtyDaysAgo }
    });

    const previous30DaysBlogs = await Blog.countDocuments({
      author: userId,
      isActive: true,
      createdAt: { 
        $gte: new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000),
        $lt: thirtyDaysAgo
      }
    });

    const blogGrowth = previous30DaysBlogs > 0 
      ? ((last30DaysBlogs - previous30DaysBlogs) / previous30DaysBlogs * 100).toFixed(1)
      : last30DaysBlogs > 0 ? 100 : 0;

    // Top performing tags
    const topTags = await Blog.aggregate([
      { 
        $match: { 
          author: userId, 
          isActive: true,
          tags: { $exists: true, $ne: [] }
        } 
      },
      { $unwind: '$tags' },
      { 
        $group: { 
          _id: '$tags', 
          count: { $sum: 1 },
          avgViews: { $avg: '$views' },
          avgLikes: { $avg: '$likesCount' }
        } 
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Engagement metrics
    const engagementStats = await Blog.aggregate([
      { 
        $match: { 
          author: userId, 
          isActive: true,
          status: 'published'
        } 
      },
      {
        $group: {
          _id: null,
          avgViews: { $avg: '$views' },
          avgLikes: { $avg: '$likesCount' },
          avgComments: { $avg: '$commentsCount' },
          totalEngagement: { 
            $sum: { 
              $add: ['$views', '$likesCount', '$commentsCount'] 
            } 
          }
        }
      }
    ]);

    const analytics = {
      overview,
      recentBlogs,
      popularBlogs,
      categoryStats,
      recentComments,
      monthlyStats,
      topTags,
      engagement: engagementStats[0] || {
        avgViews: 0,
        avgLikes: 0,
        avgComments: 0,
        totalEngagement: 0
      },
      growth: {
        blogGrowth: parseFloat(blogGrowth),
        last30DaysBlogs,
        previous30DaysBlogs
      }
    };

    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('Dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard analytics'
    });
  }
});

// @route   GET /api/dashboard/recent-activity
// @desc    Get recent activity for dashboard
// @access  Private
router.get('/recent-activity', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 20;

    // Get user's blog IDs
    const userBlogs = await Blog.find({ 
      author: userId, 
      isActive: true 
    }).select('_id title').lean();
    
    const userBlogIds = userBlogs.map(blog => blog._id);
    const blogTitleMap = userBlogs.reduce((acc, blog) => {
      acc[blog._id.toString()] = blog.title;
      return acc;
    }, {});

    // Get recent comments on user's blogs
    const recentComments = await Comment.find({
      blog: { $in: userBlogIds },
      isActive: true
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', 'name avatar')
      .populate('blog', 'title')
      .lean();

    // Get recent likes on user's blogs (from blog.likes array)
    const recentLikes = await Blog.aggregate([
      { 
        $match: { 
          author: userId, 
          isActive: true,
          'likes.0': { $exists: true }
        } 
      },
      { $unwind: '$likes' },
      { $sort: { 'likes.createdAt': -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: 'likes.user',
          foreignField: '_id',
          as: 'liker'
        }
      },
      {
        $project: {
          title: 1,
          'liker.name': 1,
          'liker.avatar': 1,
          createdAt: '$likes.createdAt',
          type: 'like'
        }
      }
    ]);

    // Combine and sort activities
    const activities = [];

    // Add comments
    recentComments.forEach(comment => {
      activities.push({
        type: 'comment',
        user: comment.author,
        blog: comment.blog,
        content: comment.content,
        createdAt: comment.createdAt
      });
    });

    // Add likes
    recentLikes.forEach(like => {
      activities.push({
        type: 'like',
        user: like.liker[0],
        blog: { title: like.title, _id: like._id },
        createdAt: like.createdAt
      });
    });

    // Sort by creation date
    activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      data: activities.slice(0, limit)
    });

  } catch (error) {
    console.error('Recent activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching recent activity'
    });
  }
});

// @route   GET /api/dashboard/summary
// @desc    Get dashboard summary stats
// @access  Private
router.get('/summary', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));

    // Get basic counts
    const [
      totalBlogs,
      publishedBlogs,
      draftBlogs,
      thisMonthBlogs,
      thisWeekBlogs
    ] = await Promise.all([
      Blog.countDocuments({ author: userId, isActive: true }),
      Blog.countDocuments({ author: userId, isActive: true, status: 'published' }),
      Blog.countDocuments({ author: userId, isActive: true, status: 'draft' }),
      Blog.countDocuments({ 
        author: userId, 
        isActive: true, 
        createdAt: { $gte: startOfMonth } 
      }),
      Blog.countDocuments({ 
        author: userId, 
        isActive: true, 
        createdAt: { $gte: startOfWeek } 
      })
    ]);

    // Get total engagement
    const engagement = await Blog.aggregate([
      { $match: { author: userId, isActive: true } },
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$views' },
          totalLikes: { $sum: '$likesCount' },
          totalComments: { $sum: '$commentsCount' }
        }
      }
    ]);

    const summary = {
      blogs: {
        total: totalBlogs,
        published: publishedBlogs,
        drafts: draftBlogs,
        thisMonth: thisMonthBlogs,
        thisWeek: thisWeekBlogs
      },
      engagement: engagement[0] || {
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0
      }
    };

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard summary'
    });
  }
});

module.exports = router;



