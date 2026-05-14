const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// SIGNUP CONTROLLER
// POST /api/auth/signup
// Body: { full_name, email, password }
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// GET /api/auth/me
const me = async (req, res) => {
  try {
    const [[user]] = await pool.execute(
      `SELECT id, full_name, email FROM users WHERE id = ?`,
      [req.userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    console.error('auth/me:', err);
    res.status(500).json({ error: 'Could not load user.' });
  }
};
const signup = async (req, res) => {
  try {
    const { full_name, email, password } = req.body;
    
    if (!full_name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    if (existingUsers.length > 0) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      [full_name.trim(), email.toLowerCase().trim(), passwordHash]
    );

    const token = jwt.sign(
      { userId: result.insertId, email: email.toLowerCase() },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to FinSphere.',
      token,
      user: { id: result.insertId, full_name: full_name.trim(), email: email.toLowerCase().trim() }
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// LOGIN CONTROLLER
// POST /api/auth/login
// Body: { email, password }
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const [users] = await pool.execute(
      'SELECT id, full_name, email, password_hash FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = users[0];
    const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordCorrect) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful! Welcome back.',
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// FORGOT PASSWORD — Step 1: Send Reset Email
// POST /api/auth/forgot-password
// Body: { email }
// FIX: Now returns emailFound flag so frontend can show correct UI
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const [users] = await pool.execute(
      'SELECT id, full_name FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    // FIX: Return emailFound: false if email not in DB so frontend shows proper error
    if (users.length === 0) {
      return res.status(200).json({
        success: false,
        emailFound: false,
        message: 'This email is not registered.'
      });
    }

    const user = users[0];

    // Generate secure random token (32 bytes = 64 hex chars)
    const resetToken = crypto.randomBytes(32).toString('hex');
    // Token expires in 30 minutes
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // Delete any existing tokens for this user, then insert fresh one
    await pool.execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);
    await pool.execute(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, resetToken, expiresAt]
    );

    const resetURL = `${process.env.FRONTEND_URL}/reset-password.html?token=${resetToken}`;

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // FIX: Email HTML was broken (border-r\nadius split across lines). Fixed below.
    const mailOptions = {
      from: `"FinSphere" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Reset Your FinSphere Password',
      html: `
        <div style="font-family:Arial,sans-serif;background:#0f172a;color:#f0f6ff;padding:30px;border-radius:12px;">
          <h2 style="color:#38bdf8;">FinSphere — Password Reset</h2>
          <p>Hello ${user.full_name},</p>
          <p>You requested to reset your password. Click the button below:</p>
          <a href="${resetURL}"
             style="display:inline-block;background:linear-gradient(135deg,#38bdf8,#818cf8);color:#0f172a;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;margin:16px 0;">
            Reset My Password
          </a>
          <p style="color:#64748b;font-size:13px;">
            This link expires in <strong style="color:#fbbf24;">30 minutes</strong>.<br/>
            If you did not request this, ignore this email.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    // FIX: Return emailFound: true so the frontend shows the success panel
    return res.status(200).json({
      success: true,
      emailFound: true,
      message: 'Reset link sent to your email.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// RESET PASSWORD — Step 2: Validate token & save new password
// POST /api/auth/reset-password
// Body: { token, newPassword }
// FIX: Properly updates password_hash in DB and marks token used
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    // Find a valid (unused, not expired) token
    const [tokens] = await pool.execute(
      `SELECT prt.user_id, prt.expires_at
       FROM password_reset_tokens prt
       WHERE prt.token = ?
         AND prt.used = FALSE
         AND prt.expires_at > NOW()`,
      [token]
    );

    if (tokens.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Reset link is invalid or has expired.'
      });
    }

    const { user_id } = tokens[0];

    // FIX: Hash the new password and UPDATE the users table
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await pool.execute(
      'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
      [passwordHash, user_id]
    );

    // Mark token as used so it cannot be reused
    await pool.execute(
      'UPDATE password_reset_tokens SET used = TRUE WHERE token = ?',
      [token]
    );

    return res.status(200).json({
      success: true,
      message: 'Password reset successful! You can now login with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■ Export all controllers ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
module.exports = { me , signup, login, forgotPassword, resetPassword };
