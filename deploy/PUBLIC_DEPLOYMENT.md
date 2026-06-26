# 公网部署步骤

## 1. 准备服务器

推荐 Ubuntu 22.04 / 24.04，最低 2 核 4GB。带宽建议 10Mbps 起步；观众越多，服务器上行带宽需求越高。

安装 Docker：

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

重新登录 SSH 后确认：

```bash
docker --version
docker compose version
```

## 2. 配置 DNS

创建 3 条 A 记录，全部指向服务器公网 IP：

```text
live.example.com  -> 你的服务器 IP
lk.example.com    -> 你的服务器 IP
turn.example.com  -> 你的服务器 IP
```

`live` 是网页/API，`lk` 是 LiveKit WebSocket，`turn` 是 TURN/TLS 证书域名。

## 3. 放行防火墙端口

云厂商安全组和服务器防火墙都要放行：

```text
80/tcp
443/tcp
443/udp
5349/tcp
7881/tcp
50000-60000/udp
```

如果你用 `ufw`：

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw allow 5349/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 50000:60000/udp
sudo ufw enable
```

## 4. 上传项目

把整个 `E:\screen-live-web` 上传到服务器，例如：

```bash
scp -r E:\screen-live-web user@server-ip:/opt/screen-live-web
```

在服务器上：

```bash
cd /opt/screen-live-web
cp deploy/.env.production.example .env.production
nano .env.production
```

把域名、密码、`LIVEKIT_API_SECRET` 都改掉。生成 secret：

```bash
openssl rand -hex 32
```

`.env.production` 中 `LIVEKIT_URL` 必须和你的 LiveKit 域名一致：

```text
LIVEKIT_URL=wss://lk.example.com
```

## 5. 启动

```bash
chmod +x deploy/deploy-ubuntu.sh
./deploy/deploy-ubuntu.sh
```

查看日志：

```bash
docker compose -f deploy/docker-compose.production.yml logs -f
```

## 6. 测试

打开：

```text
https://live.example.com
```

主播使用主播密码进入并勾选“我要发起屏幕直播”。朋友使用观众密码进入观看。

## 常见问题

- 页面能打开但直播连不上：优先检查 `50000-60000/udp` 和云安全组。
- HTTPS 证书申请失败：检查 DNS 是否已解析到服务器，以及 80/443 是否被占用。
- 有些朋友看不到声音：浏览器和系统对系统音频支持不同，Windows + Chrome/Edge 最稳。
- 公司/校园网连不上：通常需要 TURN 生效，检查 `turn.example.com` 证书和 `5349/tcp`。
