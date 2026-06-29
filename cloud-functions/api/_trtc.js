import crypto from 'node:crypto';
import TLSSigAPIv2 from 'tls-sig-api-v2';

const failedAttempts = new Map();

function getConfig() {
  return {
    sdkAppId: Number(process.env.TRTC_SDK_APP_ID || 0),
    sdkSecretKey: process.env.TRTC_SDK_SECRET_KEY,
    roomId: process.env.TRTC_ROOM_ID || 'scshare-room',
    viewerPassword: process.env.VIEWER_PASSWORD,
    broadcasterPassword: process.env.BROADCASTER_PASSWORD,
    tokenTtlMinutes: Number(process.env.TOKEN_TTL_MINUTES || 120),
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function getClientKey(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

function isRateLimited(request) {
  const key = getClientKey(request);
  const now = Date.now();
  const record = failedAttempts.get(key);
  if (!record) return false;
  if (now > record.resetAt) {
    failedAttempts.delete(key);
    return false;
  }
  return record.count >= 10;
}

function recordFailure(request) {
  const key = getClientKey(request);
  const now = Date.now();
  const record = failedAttempts.get(key) || { count: 0, resetAt: now + 10 * 60 * 1000 };
  record.count += 1;
  failedAttempts.set(key, record);
}

function cleanDisplayName(displayName) {
  const base = String(displayName || '').trim().slice(0, 24);
  return base.replace(/[^\p{L}\p{N}_ -]/gu, '') || '访客';
}

function createUserId() {
  return `u_${crypto.randomBytes(8).toString('hex')}`;
}

function createUserSig(userId) {
  const config = getConfig();
  const api = new TLSSigAPIv2.Api(config.sdkAppId, config.sdkSecretKey);
  return api.genSig(userId, config.tokenTtlMinutes * 60);
}

export function handleConfig() {
  const config = getConfig();
  return json({
    sdkAppId: config.sdkAppId || null,
    roomId: config.roomId,
  });
}

export async function handleToken(request) {
  const config = getConfig();
  if (!config.sdkAppId || !config.sdkSecretKey || !config.viewerPassword || !config.broadcasterPassword) {
    return json({ error: '服务端环境变量未配置完整。' }, 500);
  }

  if (isRateLimited(request)) {
    return json({ error: '尝试次数太多，请稍后再试。' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch (_error) {
    return json({ error: 'JSON 格式错误' }, 400);
  }

  const { password, displayName, role } = body;
  const wantsBroadcaster = role === 'broadcaster';
  const canBroadcast = timingSafeEqualText(password, config.broadcasterPassword);
  const canView = canBroadcast || timingSafeEqualText(password, config.viewerPassword);

  if (!canView) {
    recordFailure(request);
    return json({ error: '密码错误。' }, 403);
  }

  const userId = createUserId();
  const name = cleanDisplayName(displayName);
  const isBroadcaster = wantsBroadcaster && canBroadcast;
  const userSig = createUserSig(userId);

  return json({
    userSig,
    userId,
    identity: userId,
    name,
    role: isBroadcaster ? 'broadcaster' : 'viewer',
  });
}

export function methodNotAllowed() {
  return json({ error: 'Method Not Allowed' }, 405);
}
