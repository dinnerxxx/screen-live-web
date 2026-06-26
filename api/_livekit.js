const crypto = require('node:crypto');

const failedAttempts = new Map();

function getConfig() {
  return {
    livekitUrl: process.env.LIVEKIT_URL || 'ws://localhost:7880',
    roomName: process.env.ROOM_NAME || 'friends-screen-room',
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
    viewerPassword: process.env.VIEWER_PASSWORD,
    broadcasterPassword: process.env.BROADCASTER_PASSWORD,
    tokenTtlMinutes: Number(process.env.TOKEN_TTL_MINUTES || 120),
  };
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 32768) {
        reject(new Error('请求内容过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_error) {
        reject(new Error('JSON 格式错误'));
      }
    });
    req.on('error', reject);
  });
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function getClientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(req) {
  const key = getClientKey(req);
  const now = Date.now();
  const record = failedAttempts.get(key);
  if (!record) return false;
  if (now > record.resetAt) {
    failedAttempts.delete(key);
    return false;
  }
  return record.count >= 10;
}

function recordFailure(req) {
  const key = getClientKey(req);
  const now = Date.now();
  const record = failedAttempts.get(key) || { count: 0, resetAt: now + 10 * 60 * 1000 };
  record.count += 1;
  failedAttempts.set(key, record);
}

function cleanIdentity(displayName) {
  const base = String(displayName || '').trim().slice(0, 24);
  const safe = base.replace(/[^\p{L}\p{N}_ -]/gu, '') || 'friend';
  return `${safe}-${crypto.randomBytes(3).toString('hex')}`;
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function signLiveKitToken({ identity, name, canPublish }) {
  const config = getConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: config.apiKey,
    sub: identity,
    name,
    nbf: now - 5,
    exp: now + config.tokenTtlMinutes * 60,
    video: {
      room: config.roomName,
      roomJoin: true,
      canSubscribe: true,
      canPublish,
      canPublishData: true,
    },
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', config.apiSecret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

async function handleConfig(_req, res) {
  const config = getConfig();
  sendJson(res, 200, {
    livekitUrl: config.livekitUrl,
    roomName: config.roomName,
  });
}

async function handleToken(req, res) {
  const config = getConfig();
  if (!config.apiKey || !config.apiSecret || !config.viewerPassword || !config.broadcasterPassword) {
    sendJson(res, 500, { error: '服务端环境变量未配置完整。' });
    return;
  }

  if (isRateLimited(req)) {
    sendJson(res, 429, { error: '尝试次数太多，请稍后再试。' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const { password, displayName, role } = body;
  const wantsBroadcaster = role === 'broadcaster';
  const canBroadcast = timingSafeEqualText(password, config.broadcasterPassword);
  const canView = canBroadcast || timingSafeEqualText(password, config.viewerPassword);

  if (!canView) {
    recordFailure(req);
    sendJson(res, 403, { error: '密码错误。' });
    return;
  }

  const identity = cleanIdentity(displayName);
  const name = identity.split('-').slice(0, -1).join('-') || identity;
  const isBroadcaster = wantsBroadcaster && canBroadcast;
  const token = signLiveKitToken({ identity, name, canPublish: isBroadcaster });

  sendJson(res, 200, {
    token,
    identity,
    role: isBroadcaster ? 'broadcaster' : 'viewer',
  });
}

module.exports = {
  getConfig,
  handleConfig,
  handleToken,
  sendJson,
};
