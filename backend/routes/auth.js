const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Account = require('../models/Account');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
}

function signToken(account) {
  return jwt.sign({ sub: String(account._id), username: account.username }, getJwtSecret(), { expiresIn: '7d' });
}

router.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Username must be at least 3 characters' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const u = username.trim();
    const existing = await Account.findOne({ username: u });
    if (existing) return res.status(409).json({ success: false, error: 'Username already taken' });

    const passwordHash = await bcrypt.hash(password, 10);
    const account = await Account.create({ username: u, passwordHash });
    const token = signToken(account);
    res.status(201).json({ success: true, token, user: { id: String(account._id), username: account.username } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || 'Signup failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }
    const account = await Account.findOne({ username: username.trim() });
    if (!account) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, account.passwordHash);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = signToken(account);
    res.json({ success: true, token, user: { id: String(account._id), username: account.username } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || 'Login failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ success: true, user: { id: req.user.sub, username: req.user.username } });
});

module.exports = router;

