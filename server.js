const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3000);
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';
const ROOM_NAME = process.env.ROOM_NAME || 'friends-screen-room';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD;
const BROADCASTER_PASSWORD = process.env.BROADCASTER_PASSWORD;
const TOKEN_TTL_MINUTES = Number(process.env.TOKEN_TTL_MINUTES || 120);
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !VIEWER_PASSWORD || !BROADCASTER_PASSWORD) {
  console.warn('Missing required environment variables. Copy .env.example to .env and fill the values.');
}

const failedAttempts = new Map();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendText(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
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
  return req.socket.remoteAddress || 'unknown';
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
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: LIVEKIT_API_KEY,
    sub: identity,
    name,
    nbf: now - 5,
    exp: now + TOKEN_TTL_MINUTES * 60,
    video: {
      room: ROOM_NAME,
      roomJoin: true,
      canSubscribe: true,
      canPublish,
      canPublishData: true,
    },
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', LIVEKIT_API_SECRET).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

async function handleToken(req, res) {
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
  const canBroadcast = timingSafeEqualText(password, BROADCASTER_PASSWORD);
  const canView = canBroadcast || timingSafeEqualText(password, VIEWER_PASSWORD);

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

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'display-capture=(self), microphone=(self)',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' https://cdn.jsdelivr.net",
      "style-src 'self'",
      "connect-src 'self' ws: wss: https:",
      "media-src 'self' blob:",
      "img-src 'self' data:",
    ].join('; '),
  };
}

function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const decoded = decodeURIComponent(requested);
  const filePath = path.normalize(path.join(PUBLIC_DIR, decoded));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  const finalPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(PUBLIC_DIR, 'index.html');

  const ext = path.extname(finalPath).toLowerCase();
  const headers = {
    ...securityHeaders(),
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
  };
  res.writeHead(200, headers);
  fs.createReadStream(finalPath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/config') {
    sendJson(res, 200, { livekitUrl: LIVEKIT_URL, roomName: ROOM_NAME });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/token') {
    await handleToken(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method Not Allowed');
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Screen live web is running on http://localhost:${PORT}`);
});
