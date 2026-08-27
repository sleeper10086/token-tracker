# 部署上线（让别人也能访问）

本地跑起来后，要让**朋友用别的电脑/手机也能打开**，需要把项目放到一台 24 小时在线的服务器上。

## 路线建议

- **先免费试用**：确认界面和数据都满意
- **要长期分享给朋友时**，再上约 **$5/月（约 35 元）** 的"不睡觉"方案（免费档会闲置休眠，中转不稳定）

## 方案 A：Railway（推荐，最省心，约 $5/月）

1. 注册一个 **GitHub** 账号，把本项目代码传上去（我可以帮你操作）
2. 注册 **Railway**（可直接用 GitHub 登录）
3. `New Project` → `Deploy from GitHub repo` → 选这个仓库
4. 添加一个 **Volume**（持久磁盘），挂载到 `/app/data` —— 这步很关键，API Key 和用量记录都存在这里，不挂会丢
5. 部署完成后，Railway 会给你一个网址（形如 `xxxx.up.railway.app`），朋友用它访问

## 方案 B：自购一台小服务器（VPS，约 $4–6/月）

完全可控、最稳，适合长期用。需要配域名 + HTTPS，我可以带你走一遍：

```bash
# 在服务器上（已装 Docker）：
docker build -t jjs-tracker .
docker run -d -p 3000:3000 -v jjs-data:/app/data --restart unless-stopped jjs-tracker
```

再用 Caddy 挂个域名 + 自动 HTTPS：

```
你的域名 {
    reverse_proxy localhost:3000
}
```

## 上线后必做两件事

1. **备份 `data/secret.key`** —— 它是解密所有已存 API Key 的唯一钥匙，丢了谁都解不开
2. 让朋友**各自注册账号**（系统已内置账号隔离，互相看不到对方的数据）

中转地址就是 `https://你的域名/p/端点token`，把 API 调用指过去即可自动记账。
