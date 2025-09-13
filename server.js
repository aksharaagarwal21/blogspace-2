const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');

require('dotenv').config();

// Import passport configuration
require('./config/passport');

const app = express();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later! 🚦'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Compression
app.use(compression());

// CORS configuration
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001'
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: '🚀 BlogSpace API is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: '🚀 BlogSpace API is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`🔧 ${req.method} ${req.originalUrl} - Body:`, req.body);
  next();
});

// API Routes with error handling
try {
  console.log('📝 Loading routes...');
  
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ Auth routes loaded');
  
  app.use('/api/blogs', require('./routes/blogs'));
  console.log('✅ Blog routes loaded');
  
  app.use('/api/comments', require('./routes/comments'));
  console.log('✅ Comment routes loaded');
  
  app.use('/api/users', require('./routes/users'));
  console.log('✅ User routes loaded');
  
  app.use('/api/dashboard', require('./routes/dashboard'));
  console.log('✅ Dashboard routes loaded');
  
  app.use('/api', require('./routes/contact'));
  console.log('✅ Contact routes loaded');
  
} catch (error) {
  console.error('❌ Error loading routes:', error);
}

// Test route for blogs
app.get('/api/test-blogs', (req, res) => {
  res.json({
    success: true,
    message: 'Blog routes are working!',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔥 Error:', err.stack);
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: errors
    });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
  
  // MongoDB duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} already exists`
    });
  }
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.log('❌ 404 - Route not found:', req.originalUrl);
  res.status(404).json({
    success: false,
    message: `🔍 Route ${req.originalUrl} not found`,
    method: req.method,
    availableEndpoints: {
      health: 'GET /api/health',
      auth: 'POST /api/auth/login, /api/auth/register, /api/auth/google',
      blogs: 'GET /api/blogs, POST /api/blogs, PUT /api/blogs/:id',
      comments: 'GET /api/comments/:blogId, POST /api/comments/:blogId',
      dashboard: 'GET /api/dashboard/analytics',
      users: 'GET /api/users/profile, PUT /api/users/profile',
      contact: 'POST /api/contact',
      test: 'GET /api/test-blogs'
    }
  });
});

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/blogspace');
    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    console.log('⚠️  Continuing without database connection...');
    // Don't exit in development
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

// Connect to database
connectDB();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM signal received: closing HTTP server');
  mongoose.connection.close();
  process.exit(0);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('🚀 Server Status:');
  console.log(`   ✅ Running on port ${PORT}`);
  console.log(`   🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`   📱 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`   🧪 Test Blogs: http://localhost:${PORT}/api/test-blogs`);
  console.log(`   📝 Blog API: http://localhost:${PORT}/api/blogs`);
  console.log('   🎯 Ready to accept requests!');
});

module.exports = app;








