const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'your-fallback-secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// Validation helpers
const validateRegister = (req, res, next) => {
  const { name, email, password } = req.body;
  const errors = [];

  console.log('🔍 Validating registration:', { name, email, passwordLength: password?.length });

  if (!name || name.trim().length < 2 || name.trim().length > 50) {
    errors.push({ field: 'name', message: 'Name must be between 2 and 50 characters' });
  }

  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    errors.push({ field: 'email', message: 'Please enter a valid email' });
  }

  if (!password || password.length < 6) {
    errors.push({ field: 'password', message: 'Password must be at least 6 characters' });
  }

  if (errors.length > 0) {
    console.log('❌ Validation errors:', errors);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  console.log('✅ Validation passed');
  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    errors.push({ field: 'email', message: 'Please enter a valid email' });
  }

  if (!password) {
    errors.push({ field: 'password', message: 'Password is required' });
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

// @route   POST /api/auth/register
router.post('/register', validateRegister, async (req, res) => {
  try {
    const { name, email, password, bio } = req.body;

    console.log('📝 Registration attempt:', { 
      name: name?.trim(), 
      email: email?.toLowerCase(), 
      bio: bio || 'No bio provided',
      passwordProvided: !!password
    });

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log('❌ User already exists:', email.toLowerCase());
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email! 📧'
      });
    }

    console.log('✅ Email is available, creating user...');

    // Create new user
    const userData = {
      name: name.trim(),
      email: email.toLowerCase(),
      password: password,
      bio: bio || '',
      provider: 'local'
    };

    console.log('🔧 Creating user with data:', { ...userData, password: '[HIDDEN]' });

    const user = new User(userData);
    
    console.log('💾 Saving user to database...');
    await user.save();
    
    console.log('✅ User saved successfully:', user.email);
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);
    console.log('🔑 Token generated for user:', user._id);

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    console.log('✅ Registration successful for:', user.email);

    res.status(201).json({
      success: true,
      message: 'User registered successfully! 🎉',
      data: {
        user: userResponse,
        token
      }
    });

  } catch (error) {
    console.error('❌ Registration error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack
    });

    // Handle specific MongoDB errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists! Please use a different email.'
      });
    }

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
      message: 'Server error during registration. Please try again.'
    });
  }
});

// @route   POST /api/auth/login  
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Login attempt for:', email.toLowerCase());

    // Find user and include password
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user) {
      console.log('❌ User not found:', email.toLowerCase());
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials! 🔑'
      });
    }

    console.log('👤 User found:', {
      email: user.email,
      provider: user.provider,
      hasPassword: !!user.password,
      isActive: user.isActive
    });

    if (!user.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Account is deactivated. Please contact support! 🚫'
      });
    }

    if (user.provider === 'google' && !user.password) {
      return res.status(400).json({
        success: false,
        message: 'Please login with Google account! 🌈'
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials! 🔑'
      });
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log('🔍 Password comparison result:', isPasswordValid);

    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials! 🔑'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    console.log('✅ Login successful for:', user.email);

    res.json({
      success: true,
      message: 'Login successful! 🎉',
      data: {
        user: userResponse,
        token
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// Google OAuth routes
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_failed` }),
  async (req, res) => {
    try {
      const token = generateToken(req.user._id);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${token}`);
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_failed`);
    }
  }
);

router.get('/verify', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    res.json({
      success: true,
      message: 'Token is valid',
      data: { user: user.toObject() }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during token verification'
    });
  }
});

router.post('/logout', auth, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully! 👋'
  });
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;







