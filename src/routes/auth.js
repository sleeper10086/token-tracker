const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, createSession, setSessionCookie, requireAuth } = require('../auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: '请输入有效的邮箱' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: '该邮箱已注册' });
  const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hashPassword(password));
  const s = createSession(info.lastInsertRowid);
  setSessionCookie(res, s.token, s.expires);
  res.json({ ok: true, email });
});

router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: '邮箱或密码错误' });
  const s = createSession(user.id);
  setSessionCookie(res, s.token, s.expires);
  res.json({ ok: true, email });
});

router.post('/logout', (req, res) => {
  const token = req.cookies && req.cookies.sid;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ email: req.user.email });
});

module.exports = router;
