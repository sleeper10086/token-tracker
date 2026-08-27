/* 讲解石追踪器 前端逻辑 */
const $ = (sel) => document.querySelector(sel);

let mode = 'login'; // login | register
let providerTypes = [];
let dashData = null;
const charts = {}; // 保存图表实例，刷新时销毁

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error((data && data.error) || ('请求失败 ' + res.status));
  return data;
}

/* ---------- 数字格式化 ---------- */
function fmt(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
function fmtMoney(n) {
  if (n == null || isNaN(n)) return '$0.00';
  return '$' + Number(n).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}
function fmtPct(n) {
  return (Number(n) * 100).toFixed(1) + '%';
}

/* ---------- 认证 ---------- */
function showAuth() {
  $('#auth-view').classList.remove('hidden');
  $('#dash-view').classList.add('hidden');
}
function showDash() {
  $('#auth-view').classList.add('hidden');
  $('#dash-view').classList.remove('hidden');
}

function setMode(m) {
  mode = m;
  $('#tab-login').classList.toggle('active', m === 'login');
  $('#tab-register').classList.toggle('active', m === 'register');
  $('#auth-submit').textContent = m === 'login' ? '登录' : '注册';
  $('#auth-msg').textContent = '';
  $('#auth-msg').className = 'msg';
}

async function handleAuth(e) {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const msg = $('#auth-msg');
  msg.className = 'msg';
  try {
    await api('/api/auth/' + mode, { method: 'POST', body: { email, password } });
    location.reload();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
  }
}

/* ---------- 仪表盘 ---------- */
async function loadDashboard() {
  try {
    dashData = await api('/api/dashboard');
    renderCards();
    renderCompare();
    renderBill();
  } catch (err) {
    if (err.message.includes('未登录')) { showAuth(); return; }
    console.error(err);
  }
}

function renderCards() {
  const wrap = $('#cards');
  wrap.innerHTML = '';
  Object.values(charts).forEach(c => { try { c.destroy(); } catch (_) {} });
  for (const k in charts) delete charts[k];

  if (!dashData.providers.length) {
    wrap.innerHTML = '<div class="empty" style="grid-column:1/-1">还没有供应商。点右下角「+」添加第一个。</div>';
    return;
  }

  dashData.providers.forEach(p => {
    const el = document.createElement('div');
    el.className = 'card';

    const b = balanceHTML(p);

    el.innerHTML = `
      <div class="card-head">
        <div class="card-title"><span class="color-dot" style="background:${p.color}"></span>${esc(p.name)}</div>
        <div style="display:flex;gap:8px">
          <a class="btn ghost" style="text-decoration:none;font-size:13px;padding:7px 12px" href="${esc(p.rechargeUrl)}" target="_blank" rel="noopener">去官网充值 ↗</a>
          <button class="btn ghost" style="font-size:13px;padding:7px 12px" data-act="del">删除</button>
        </div>
      </div>
      <div class="card-metrics">
        <div class="metric"><div class="k">余额 / 用量</div><div class="v">${b.main}</div><div class="s">${esc(b.sub)}</div></div>
        <div class="metric"><div class="k">本月花费(估)</div><div class="v">${fmtMoney(p.totals.costUsd)}</div><div class="s">token ${fmt(p.totals.tokens)} · 请求 ${fmt(p.totals.requests)}</div></div>
      </div>
      ${p.snapshotCount === 0 ? `<div class="status-ok">⏳ 已开始记录余额，用量曲线会随时间自动积累（每 15 分钟记一次）</div>` : ''}
      ${p.statusError ? `<div class="status-error">⚠ 状态获取失败：${esc(p.statusError)}</div>` : ''}
      <div class="mini-charts">
        <div class="mini"><div class="cap">token 用量</div><canvas id="c-token-${p.id}"></canvas></div>
        <div class="mini"><div class="cap">请求次数</div><canvas id="c-req-${p.id}"></canvas></div>
      </div>
      <div class="card-foot">
        <span>中转地址</span>
        <span class="endpoint" title="${esc(origin + '/p/' + p.endpoint_token)}">${esc(origin + '/p/' + p.endpoint_token)}</span>
        <button class="copy-btn" data-copy="${esc(origin + '/p/' + p.endpoint_token)}">复制</button>
      </div>
    `;
    wrap.appendChild(el);

    drawMini('c-token-' + p.id, p.daily, 'tokens', p.color);
    drawMini('c-req-' + p.id, p.daily, 'requests', p.color);

    el.querySelector('[data-act="del"]').addEventListener('click', () => removeProvider(p));
    el.querySelector('[data-copy]').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      navigator.clipboard.writeText(btn.getAttribute('data-copy')).then(() => {
        btn.textContent = '已复制';
        setTimeout(() => (btn.textContent = '复制'), 1500);
      });
    });
  });
}

function balanceHTML(p) {
  if (p.statusError) return { main: '—', sub: '状态获取失败：' + p.statusError };
  const s = p.status;
  if (!s) return { main: '—', sub: '获取中…' };
  if (p.slug === 'deepseek') {
    if (s.balance != null) return { main: '¥ ' + fmt(s.balance), sub: (s.currency || '') + ' · 官方余额' };
    return { main: '—', sub: '无余额数据' };
  }
  if (p.slug === 'tavily') {
    const used = s.creditsUsed != null ? fmt(s.creditsUsed) : '?';
    const limit = (s.creditsLimit == null || s.creditsLimit === 0) ? '∞' : fmt(s.creditsLimit);
    return { main: used + ' / ' + limit, sub: 'credits 已用 / 限额' + (s.plan ? ' · ' + s.plan : '') };
  }
  return { main: '—', sub: '' };
}

function drawMini(canvasId, daily, field, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  const labels = daily.map(d => d.day.slice(5));
  const data = daily.map(d => d[field] || 0);
  charts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: color, backgroundColor: color + '22', fill: true, tension: .35, pointRadius: 0, borderWidth: 1.6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false }, y: { display: false, beginAtZero: true }
      },
      animation: false
    }
  });
}

function renderCompare() {
  const canvas = document.getElementById('compare-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (charts.compare) charts.compare.destroy();
  const labels = dashData.providers[0] ? dashData.providers[0].daily.map(d => d.day.slice(5)) : [];
  const datasets = dashData.providers.map(p => ({
    label: p.name,
    data: p.daily.map(d => Math.round(d.costUsd * 10000) / 10000),
    backgroundColor: p.color,
    borderRadius: 3
  }));
  charts.compare = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { callback: (v) => '$' + v } }
      }
    }
  });
}

function renderBill() {
  const empty = $('#bill-empty');
  const content = $('#bill-content');
  const tbody = $('#bill-tbody');
  if (!dashData.monthly.length || dashData.totalCost <= 0) {
    empty.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  content.classList.remove('hidden');

  if (charts.bill) charts.bill.destroy();
  charts.bill = new Chart(document.getElementById('bill-pie'), {
    type: 'doughnut',
    data: {
      labels: dashData.monthly.map(m => m.name),
      datasets: [{ data: dashData.monthly.map(m => Math.max(0, Math.round(m.costUsd * 10000) / 10000)), backgroundColor: dashData.monthly.map(m => m.color), borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right' } }
    }
  });

  tbody.innerHTML = '';
  dashData.monthly.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><span class="color-dot" style="background:${m.color};display:inline-block"></span> ${esc(m.name)}</td>
      <td>${fmtMoney(m.costUsd)}</td><td>${fmt(m.tokens)}</td><td>${fmt(m.requests)}</td><td>${fmtPct(m.share)}</td>`;
    tbody.appendChild(tr);
  });
}

/* ---------- 添加 / 删除供应商 ---------- */
async function openModal() {
  try {
    providerTypes = await api('/api/providers/types');
  } catch (_) { providerTypes = []; }
  const sel = $('#m-slug');
  sel.innerHTML = providerTypes.map(t => `<option value="${t.slug}">${t.name}</option>`).join('');
  $('#m-label').value = '';
  $('#m-key').value = '';
  $('#m-msg').textContent = '';
  $('#m-msg').className = 'msg';
  updateHint();
  $('#modal').classList.remove('hidden');
}

function updateHint() {
  const t = providerTypes.find(t => t.slug === $('#m-slug').value);
  $('#m-hint').textContent = t ? ('Key 格式示例：' + t.keyHint) : '';
}

async function saveProvider() {
  const body = { slug: $('#m-slug').value, label: $('#m-label').value, apiKey: $('#m-key').value };
  const msg = $('#m-msg');
  msg.className = 'msg';
  try {
    await api('/api/providers', { method: 'POST', body });
    $('#modal').classList.add('hidden');
    loadDashboard();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
  }
}

async function removeProvider(p) {
  if (!confirm('确定删除「' + p.name + '」及其用量记录吗？')) return;
  try {
    await api('/api/providers/' + p.id, { method: 'DELETE' });
    loadDashboard();
  } catch (err) { alert(err.message); }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 初始化 ---------- */
async function init() {
  // 绑定事件
  $('#tab-login').addEventListener('click', () => setMode('login'));
  $('#tab-register').addEventListener('click', () => setMode('register'));
  $('#auth-form').addEventListener('submit', handleAuth);
  $('#btn-logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); location.reload(); });
  $('#btn-add').addEventListener('click', openModal);
  $('#m-cancel').addEventListener('click', () => $('#modal').classList.add('hidden'));
  $('#m-save').addEventListener('click', saveProvider);
  $('#m-slug').addEventListener('change', updateHint);
  $('#btn-bill').addEventListener('click', () => $('#bill-section').scrollIntoView({ behavior: 'smooth' }));

  // 检查登录状态
  try {
    const me = await api('/api/auth/me');
    $('#user-email').textContent = me.email;
    showDash();
    loadDashboard();
  } catch (_) {
    showAuth();
  }
}

document.addEventListener('DOMContentLoaded', init);
