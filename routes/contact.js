const express = require('express');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Create nodemailer transporter
const createTransporter = () => {
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }
  return null;
};

// @route   POST /api/contact
// @desc    Send contact form message
// @access  Public
router.post('/', [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email'),
  body('subject')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Subject must be between 5 and 100 characters'),
  body('message')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Message must be between 10 and 1000 characters')
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

    const { name, email, subject, message } = req.body;

    // Create transporter
    const transporter = createTransporter();
    
    if (!transporter) {
      // If email is not configured, just log the message
      console.log('📧 Contact form submission (email not configured):');
      console.log(`Name: ${name}`);
      console.log(`Email: ${email}`);
      console.log(`Subject: ${subject}`);
      console.log(`Message: ${message}`);
      
      return res.json({
        success: true,
        message: 'Thank you for your message! We\'ll get back to you soon. 📧'
      });
    }

    // Email to admin
    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Send to yourself
      subject: `BlogSpace Contact: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ec4899;">📧 New Contact Form Submission</h2>
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Subject:</strong> ${subject}</p>
          </div>
          <div style="background: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h3>Message:</h3>
            <p style="line-height: 1.6;">${message.replace(/\n/g, '<br>')}</p>
          </div>
          <div style="margin-top: 20px; padding: 15px; background: #fdf2f8; border-radius: 8px;">
            <p style="margin: 0; font-size: 14px; color: #be185d;">
              ✨ Sent from BlogSpace Contact Form
            </p>
          </div>
        </div>
      `
    };

    // Auto-reply to user
    const userMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Thank you for contacting BlogSpace! 🌟',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; padding: 20px;">
            <h1 style="color: #ec4899;">✨ BlogSpace</h1>
          </div>
          <div style="background: linear-gradient(135deg, #fdf2f8, #f0f9ff); padding: 30px; border-radius: 12px;">
            <h2 style="color: #1f2937;">Hi ${name}! 👋</h2>
            <p style="line-height: 1.6; color: #4b5563;">
              Thank you for reaching out to us! We've received your message about "<strong>${subject}</strong>" 
              and we really appreciate you taking the time to contact us.
            </p>
            <p style="line-height: 1.6; color: #4b5563;">
              Our team will review your message and get back to you within 24-48 hours. 
              In the meantime, feel free to explore our platform and discover amazing stories from writers around the world!
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}" 
                 style="background: linear-gradient(135deg, #ec4899, #8b5cf6); 
                        color: white; 
                        padding: 12px 24px; 
                        text-decoration: none; 
                        border-radius: 8px; 
                        font-weight: 600;">
                🚀 Visit BlogSpace
              </a>
            </div>
            <p style="line-height: 1.6; color: #6b7280; font-size: 14px;">
              Best regards,<br>
              The BlogSpace Team 💫
            </p>
          </div>
          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p>This is an automated response. Please do not reply to this email.</p>
          </div>
        </div>
      `
    };

    // Send emails
    await Promise.all([
      transporter.sendMail(adminMailOptions),
      transporter.sendMail(userMailOptions)
    ]);

    res.json({
      success: true,
      message: 'Thank you for your message! We\'ll get back to you soon. 📧'
    });

  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message. Please try again later.'
    });
  }
});

// @route   POST /api/contact/newsletter
// @desc    Subscribe to newsletter
// @access  Public
router.post('/newsletter', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
        errors: errors.array()
      });
    }

    const { email } = req.body;

    // Here you would typically save to a newsletter database
    // For now, we'll just log it
    console.log(`📧 Newsletter subscription: ${email}`);

    const transporter = createTransporter();
    
    if (transporter) {
      // Send welcome email
      const welcomeMailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Welcome to BlogSpace Newsletter! 🌟',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="text-align: center; padding: 20px;">
              <h1 style="color: #ec4899;">✨ Welcome to BlogSpace!</h1>
            </div>
            <div style="background: linear-gradient(135deg, #fdf2f8, #f0f9ff); padding: 30px; border-radius: 12px;">
              <h2 style="color: #1f2937;">Thank you for subscribing! 🎉</h2>
              <p style="line-height: 1.6; color: #4b5563;">
                You're now part of our amazing community of writers and readers! 
                You'll receive weekly updates featuring:
              </p>
              <ul style="color: #4b5563; line-height: 1.8;">
                <li>📚 Latest blog posts from our talented writers</li>
                <li>🌟 Featured stories and trending topics</li>
                <li>💡 Writing tips and inspiration</li>
                <li>🎯 Platform updates and new features</li>
              </ul>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL}" 
                   style="background: linear-gradient(135deg, #ec4899, #8b5cf6); 
                          color: white; 
                          padding: 12px 24px; 
                          text-decoration: none; 
                          border-radius: 8px; 
                          font-weight: 600;">
                  🚀 Start Exploring
                </a>
              </div>
              <p style="line-height: 1.6; color: #6b7280; font-size: 14px;">
                Happy reading!<br>
                The BlogSpace Team 💫
              </p>
            </div>
          </div>
        `
      };

      await transporter.sendMail(welcomeMailOptions);
    }

    res.json({
      success: true,
      message: 'Successfully subscribed to newsletter! Check your email for confirmation. 📧'
    });

  } catch (error) {
    console.error('Newsletter subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to subscribe. Please try again later.'
    });
  }
});

module.exports = router;
