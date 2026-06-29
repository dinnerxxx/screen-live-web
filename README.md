# scshare

这是一个带密码保护的网页屏幕直播项目：朋友进入网页后先输入昵称和密码，再进入直播间观看屏幕直播和讨论区。

当前版本使用腾讯云 TRTC 承载实时音视频，服务端只负责密码校验和 UserSig 签发。SDKSecretKey 只允许放在服务端环境变量里，不能写入前端代码。

## 本地启动

1. 安装 Node.js 20 或更高版本。
2. 复制并填写环境变量：

```bash
copy .env.example .env
```

3. 在 `.env` 中填入腾讯云 TRTC 参数：

```text
TRTC_SDK_APP_ID=你的 SDKAppID
TRTC_SDK_SECRET_KEY=你的 SDKSecretKey
TRTC_ROOM_ID=scshare-room
VIEWER_PASSWORD=观众密码
BROADCASTER_PASSWORD=主播密码
TOKEN_TTL_MINUTES=120
```

4. 启动：

```bash
node server.js
```

5. 打开 `http://localhost:3000`。

注意：正式给朋友使用时必须通过 HTTPS 域名访问，否则普通域名下浏览器无法调用屏幕共享。

## EdgeOne Pages 部署环境变量

在 EdgeOne Pages 项目里配置这些环境变量：

```text
TRTC_SDK_APP_ID=你的 SDKAppID
TRTC_SDK_SECRET_KEY=你的 SDKSecretKey
TRTC_ROOM_ID=scshare-room
VIEWER_PASSWORD=观众密码
BROADCASTER_PASSWORD=主播密码
TOKEN_TTL_MINUTES=120
```

`TRTC_SDK_APP_ID` 会返回给浏览器，`TRTC_SDK_SECRET_KEY` 只在服务端函数中用于生成 UserSig。

## 权限

- 观众密码：可以进入房间观看。
- 主播密码：勾选“我要发起屏幕直播”后可以发布屏幕直播。

讨论区当前使用 TRTC 自定义消息。TRTC 对自定义消息能力有角色限制，如果需要所有观众稳定发言，建议下一步接入腾讯云 Chat 或单独的后端 WebSocket 消息服务。
