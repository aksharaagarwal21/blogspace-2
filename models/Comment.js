const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    trim: true,
    minlength: [1, 'Comment must be at least 1 character'],
    maxlength: [1000, 'Comment cannot exceed 1000 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Comment author is required']
  },
  blog: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Blog',
    required: [true, 'Blog reference is required']
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  replies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
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
  isActive: {
    type: Boolean,
    default: true
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
commentSchema.index({ blog: 1, createdAt: -1 });
commentSchema.index({ author: 1 });
commentSchema.index({ parentComment: 1 });

// Pre-save middleware
commentSchema.pre('save', function(next) {
  if (this.isModified('content') && !this.isNew) {
    this.isEdited = true;
    this.editedAt = new Date();
  }
  
  this.likesCount = this.likes ? this.likes.length : 0;
  next();
});

// Post-save middleware to update blog comments count
commentSchema.post('save', async function(doc) {
  try {
    const Blog = mongoose.model('Blog');
    const commentsCount = await mongoose.model('Comment').countDocuments({ 
      blog: doc.blog, 
      isActive: true 
    });
    
    await Blog.findByIdAndUpdate(doc.blog, { commentsCount });
  } catch (error) {
    console.error('Error updating blog comments count:', error);
  }
});

// Post-remove middleware
commentSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    try {
      const Blog = mongoose.model('Blog');
      const commentsCount = await mongoose.model('Comment').countDocuments({ 
        blog: doc.blog, 
        isActive: true 
      });
      
      await Blog.findByIdAndUpdate(doc.blog, { commentsCount });
      
      // Also remove any replies
      await mongoose.model('Comment').deleteMany({ parentComment: doc._id });
    } catch (error) {
      console.error('Error in post-remove middleware:', error);
    }
  }
});

// Instance methods
commentSchema.methods.toggleLike = function(userId) {
  const existingLike = this.likes.find(like => like.user.toString() === userId.toString());
  
  if (existingLike) {
    this.likes = this.likes.filter(like => like.user.toString() !== userId.toString());
  } else {
    this.likes.push({ user: userId });
  }
  
  this.likesCount = this.likes.length;
  return this.save();
};

// Static methods
commentSchema.statics.findByBlog = function(blogId) {
  return this.find({ blog: blogId, isActive: true, parentComment: null })
    .populate('author', 'name avatar')
    .populate({
      path: 'replies',
      populate: {
        path: 'author',
        select: 'name avatar'
      }
    })
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('Comment', commentSchema);



