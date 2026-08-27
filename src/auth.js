const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SESSION_DAYS = 30;

function randomToken() { return crypto.randomBytes(24).toString('hex'); }
function hashPassword(pw) { return bcrypt.hashSync(pw, 10); }
function verifyPassword(pw, hash) { return bcrypt.compareSync(pw, hash); }

function createSession(userId) {
  const token = randomToken();
  const expires = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  return { token, expires };
}

function getUserByToken(token) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s) return null;
  if (s.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(s.user_id);
}

function requireAuth(req, res, next) {
  const token = (req.cookies && req.cookies.sid) || null;
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: '未登录' });
  req.user = user;
  next();
}

function setSessionCookie(res, token, expires) {
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', maxAge: expires - Date.now(), path: '/' });
}

module.exports = {
  randomToken, hashPassword, verifyPassword,
  createSession, getUserByToken, requireAuth, setSessionCookie
};
