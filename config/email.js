const nodemailer = require('nodemailer');

const createTransporter = () => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('Email configuration missing. Email features will not work.');
    return null;
  }

  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const sendWelcomeEmail = async (email, name) => {
  const transporter = createTransporter();
  
  if (!transporter) {
    console.log('Email transporter not configured, skipping welcome email');
    return;
  }

  const mailOptions = {
    from: `"Blog Platform" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Welcome to Our Blog Platform! 🎉',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px;">
        <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4f46e5; margin: 0; font-size: 28px;">🎊 Welcome ${name}! 🎊</h1>
          </div>
          
          <div style="color: #374151; line-height: 1.6;">
            <p style="font-size: 18px; margin-bottom: 20px;">
              Thank you for joining our amazing blog community!
            </p>
            
            <p style="margin-bottom: 20px;">
              Your registration has been completed successfully! 🎉
            </p>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #1f2937; margin-top: 0;">What you can do now:</h3>
              <ul style="color: #4b5563; padding-left: 20px;">
                <li>✍️ Create and publish amazing blog posts</li>
                <li>💬 Comment on other posts and engage with the community</li>
                <li>❤️ Like and interact with content you love</li>
                <li>📊 Access your personal dashboard with analytics</li>
                <li>🌙 Toggle between dark and light themes</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" 
                 style="background: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Start Blogging Now! 🚀
              </a>
            </div>
            
            <p style="margin-bottom: 10px;">Happy blogging! 📝</p>
            <p style="color: #6b7280;">The Blog Platform Team</p>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 20px;">
          <p style="color: rgba(255,255,255,0.8); font-size: 12px;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${email}`);
  } catch (error) {
    console.error('❌ Error sending welcome email:', error.message);
  }
};

module.exports = { sendWelcomeEmail, createTransporter };
