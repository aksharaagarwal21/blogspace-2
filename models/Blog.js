const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    minlength: [5, 'Title must be at least 5 characters'],
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    minlength: [50, 'Content must be at least 50 characters']
  },
  excerpt: {
    type: String,
    maxlength: [300, 'Excerpt cannot exceed 300 characters'],
    default: ''
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Author is required']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['Technology', 'Lifestyle', 'Travel', 'Food', 'Business', 'Health', 'Education', 'Entertainment', 'Other']
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  featuredImage: {
    type: String,
    default: null,
    validate: {
      validator: function(v) {
        // Allow empty strings and null values
        return !v || v === '' || /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(v);
      },
      message: 'Featured image must be a valid image URL'
    }
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  views: {
    type: Number,
    default: 0
  },
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  likesCount: {
    type: Number,
    default: 0
  },
  comments: [{
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [1000, 'Comment cannot exceed 1000 characters']
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  commentsCount: {
    type: Number,
    default: 0
  },
  readingTime: {
    type: Number, // in minutes
    default: 1
  },
  publishedAt: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
blogSchema.index({ author: 1, status: 1 });
blogSchema.index({ category: 1, status: 1 });
blogSchema.index({ tags: 1 });
blogSchema.index({ createdAt: -1 });
blogSchema.index({ views: -1 });
blogSchema.index({ likesCount: -1 });
blogSchema.index({ isActive: 1 });

// Text index for search
blogSchema.index({
  title: 'text',
  content: 'text',
  tags: 'text'
}, {
  weights: {
    title: 10,
    tags: 5,
    content: 1
  }
});

// Pre-save middleware
blogSchema.pre('save', function(next) {
  try {
    // Set excerpt if not provided
    if (!this.excerpt && this.content) {
      this.excerpt = this.content.substring(0, 150) + (this.content.length > 150 ? '...' : '');
    }
    
    // Update published date when status changes to published
    if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
      this.publishedAt = new Date();
    }
    
    // Update reading time
    if (this.isModified('content') && this.content) {
      const wordsPerMinute = 200;
      const wordCount = this.content.split(/\s+/).filter(word => word.length > 0).length;
      this.readingTime = Math.ceil(wordCount / wordsPerMinute) || 1;
    }
    
    // Update likes count
    this.likesCount = this.likes ? this.likes.length : 0;
    
    // Update comments count
    this.commentsCount = this.comments ? this.comments.length : 0;
    
    // Clean up featuredImage if it's empty
    if (this.featuredImage === '') {
      this.featuredImage = null;
    }
    
    next();
  } catch (error) {
    console.error('❌ Blog pre-save error:', error);
    next(error);
  }
});

// Instance methods
blogSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save({ validateBeforeSave: false });
};

blogSchema.methods.toggleLike = function(userId) {
  const existingLike = this.likes.find(like => like.user.toString() === userId.toString());
  
  if (existingLike) {
    // Unlike
    this.likes = this.likes.filter(like => like.user.toString() !== userId.toString());
  } else {
    // Like
    this.likes.push({ user: userId });
  }
  
  this.likesCount = this.likes.length;
  return this.save();
};

blogSchema.methods.addComment = function(userId, content) {
  const newComment = {
    content: content.trim(),
    author: userId,
    createdAt: new Date()
  };
  
  this.comments.push(newComment);
  this.commentsCount = this.comments.length;
  
  return this.save();
};

// Static methods
blogSchema.statics.findPublished = function() {
  return this.find({ status: 'published', isActive: true });
};

blogSchema.statics.findByCategory = function(category) {
  return this.find({ category, status: 'published', isActive: true });
};

blogSchema.statics.search = function(query) {
  return this.find(
    { $text: { $search: query }, status: 'published', isActive: true },
    { score: { $meta: 'textScore' } }
  ).sort({ score: { $meta: 'textScore' } });
};

module.exports = mongoose.model('Blog', blogSchema);






