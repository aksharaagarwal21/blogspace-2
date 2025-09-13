const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user already exists with this Google ID
    let user = await User.findOne({ 
      provider: 'google', 
      providerId: profile.id 
    });
    
    if (user) {
      // Update last login
      await user.updateLastLogin();
      return done(null, user);
    }
    
    // Check if user exists with same email
    user = await User.findOne({ email: profile.emails[0].value });
    
    if (user) {
      // Link Google account to existing user
      user.provider = 'google';
      user.providerId = profile.id;
      if (!user.avatar && profile.photos[0]) {
        user.avatar = profile.photos[0].value;
      }
      await user.save();
      await user.updateLastLogin();
      return done(null, user);
    }
    
    // Create new user
    user = new User({
      name: profile.displayName,
      email: profile.emails[0].value,
      avatar: profile.photos[0]?.value || null,
      provider: 'google',
      providerId: profile.id,
      isEmailVerified: true
    });
    
    await user.save();
    await user.updateLastLogin();
    
    done(null, user);
  } catch (error) {
    console.error('Google OAuth Error:', error);
    done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;



