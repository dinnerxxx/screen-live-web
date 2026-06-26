# scshare

这是一个带密码保护的网页屏幕直播项目：浏览器进房间，主播点击开始直播，朋友实时观看并聊天。媒体传输使用 LiveKit，网页和 token 服务使用 Node.js 标准库实现，后端没有第三方 npm 依赖。

## 本地启动网页服务

1. 安装 Node.js 20 或更高版本。
2. 在项目目录执行：

```bash
cd /d E:\screen-live-web
copy .env.example .env
node server.js
```

3. 打开 `http://localhost:3000`。

注意：真正的屏幕共享上线必须使用 HTTPS 域名；`localhost` 是浏览器允许的开发例外。

## 最快上线：Vercel + LiveKit Cloud

这个项目已经支持 Vercel 部署：

- 静态页面在 `public/`
- Vercel API 在 `api/config.js` 和 `api/token.js`
- Vercel 配置在 `vercel.json`

最快流程：

1. 在 LiveKit Cloud 创建项目，复制 `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`。
2. 把本项目推送到 GitHub。
3. 在 Vercel 新建项目，导入这个 GitHub 仓库。
4. 在 Vercel Project Settings -> Environment Variables 添加：

```text
LIVEKIT_URL=wss://你的-livekit-cloud-地址
LIVEKIT_API_KEY=你的-key
LIVEKIT_API_SECRET=你的-secret
ROOM_NAME=friends-screen-room
VIEWER_PASSWORD=观众密码
BROADCASTER_PASSWORD=主播密码
TOKEN_TTL_MINUTES=120
```

5. 点击 Deploy。完成后访问 Vercel 给你的 HTTPS 地址。

Vercel 只负责网页和 token API；真正的音视频直播由 LiveKit Cloud 承担。

## 启动 LiveKit

### Windows 本地测试

本项目已经按 LiveKit 开发模式配置好：

- `LIVEKIT_URL=ws://localhost:7880`
- `LIVEKIT_API_KEY=devkey`
- `LIVEKIT_API_SECRET=secret`

第一次使用先运行：

```powershell
cd /d E:\screen-live-web
powershell -ExecutionPolicy Bypass -File .\setup-livekit-windows.ps1
```

之后打开两个终端：

```bat
start-livekit-dev.bat
```

```bat
start-web.bat
```

再访问 `http://localhost:3000`。本机测试时，浏览器允许 `localhost` 使用屏幕共享。

### Linux / 服务器自部署

自部署时先复制配置：

```bash
copy livekit\livekit.yaml.example livekit\livekit.yaml
```

把 `livekit\livekit.yaml` 里的 key/secret 改成和 `.env` 中一致，然后在 Linux 服务器上运行：

```bash
docker compose -f docker-compose.livekit.yml up -d
```

开发测试也可以直接使用 LiveKit Cloud，只需要把 `.env` 里的 `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET` 换成云端项目的值。

## 密码和权限

`.env` 里有两个密码：

- `VIEWER_PASSWORD`：观众进入，只能观看和聊天。
- `BROADCASTER_PASSWORD`：主播进入，可以观看、聊天、发布屏幕和麦克风。

进入页面时勾选“我要发起屏幕直播”，并输入主播密码，才会拿到发布权限。

## 生产部署要点

- 网页必须通过 HTTPS 访问，否则普通域名下无法调用屏幕共享。
- 推荐把网页/API 和 LiveKit 分成两个域名，例如 `live.example.com` 和 `lk.example.com`。
- 服务器防火墙要放行 LiveKit 的 WebRTC 端口，常见为 `7880/tcp`、`7881/tcp`、`50000-60000/udp`，TURN 需要额外配置。
- Windows + Chrome/Edge 对系统音频支持最好；不同系统和浏览器对“分享系统声音”的支持不完全一致。

公网部署的完整模板和步骤见 `deploy/PUBLIC_DEPLOYMENT.md`。
