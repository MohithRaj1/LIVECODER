const jwt = require('jsonwebtoken');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) return res.status(401).json({ success: false, error: 'Missing auth token' });

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = payload; // { sub, username }
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid auth token' });
  }
}

function verifySocketToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

module.exports = { requireAuth, verifySocketToken };

