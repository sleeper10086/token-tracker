require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./src/db');
const { proxyHandler } = require('./src/proxy');
const authRoutes = require('./src/routes/auth');
const providerRoutes = require('./src/routes/providers');
const dashboardRoutes = require('./src/routes/dashboard');
const snapshots = require('./src/snapshots');

const app = express();
const PORT = process.env.PORT || 3000;

// 轻量 cookie 解析（无需额外依赖）
app.use((req, res, next) => {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach(pair => {
    const i = pair.indexOf('=');
    if (i > -1) cookies[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  req.cookies = cookies;
  next();
});

app.use('/api', express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 中转代理：接收原始 body，原样转发给供应商
app.all('/p/:token/*', express.raw({ type: () => true, limit: '25mb' }), proxyHandler);

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`讲解石追踪器 已启动: http://localhost:${PORT}`);
  snapshots.start();
});
