import TRTC from 'https://cdn.jsdelivr.net/npm/trtc-sdk-v5/+esm';

const STREAM_TYPE_MAIN = TRTC.TYPE?.STREAM_TYPE_MAIN || 'main';
const STREAM_TYPE_SUB = TRTC.TYPE?.STREAM_TYPE_SUB || 'sub';
const ROLE_ANCHOR = TRTC.TYPE?.ROLE_ANCHOR || 'anchor';
const ROLE_AUDIENCE = TRTC.TYPE?.ROLE_AUDIENCE || 'audience';
const SCENE_LIVE = TRTC.TYPE?.SCENE_LIVE || 'live';

const state = {
  trtc: null,
  config: null,
  role: 'viewer',
  userId: '',
  displayName: '',
  localSharing: false,
  videoTiles: new Map(),
  remoteUsers: new Set(),
  shareStartedAt: 0,
  shareTimerId: 0,
};

const loginPanel = document.getElementById('loginPanel');
const roomPanel = document.getElementById('roomPanel');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');
const displayNameInput = document.getElementById('displayNameInput');
const passwordInput = document.getElementById('passwordInput');
const broadcasterInput = document.getElementById('broadcasterInput');
const roomNameText = document.getElementById('roomNameText');
const currentUserText = document.getElementById('currentUserText');
const currentRoleText = document.getElementById('currentRoleText');
const onlineCount = document.getElementById('onlineCount');
const connectionState = document.getElementById('connectionState');
const liveStateText = document.getElementById('liveStateText');
const shareTimerText = document.getElementById('shareTimerText');
const stageHintText = document.getElementById('stageHintText');
const stageFullscreenBtn = document.getElementById('stageFullscreenBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const startShareBtn = document.getElementById('startShareBtn');
const stopShareBtn = document.getElementById('stopShareBtn');
const videosContainer = document.getElementById('videosContainer');
const emptyState = document.getElementById('emptyState');
const memberCountText = document.getElementById('memberCountText');
const participantsList = document.getElementById('participantsList');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatCountText = document.getElementById('chatCountText');
const videoTileTemplate = document.getElementById('videoTileTemplate');

async function loadConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('无法读取房间配置');
  state.config = await res.json();
  roomNameText.textContent = state.config.roomId;
}

function setLoginError(message) {
  loginError.textContent = message || '';
}

function setLoginBusy(isBusy) {
  loginSubmitBtn.disabled = isBusy;
  loginSubmitBtn.textContent = isBusy ? '进入中...' : '进入房间';
}

function setConnectionLabel(value) {
  connectionState.textContent = value;
}

function updateOnlineCount() {
  const count = state.remoteUsers.size + 1;
  onlineCount.textContent = String(count);
  memberCountText.textContent = String(count);
  updateParticipantsList();
}

function updateEmptyState() {
  const hasVideo = videosContainer.children.length > 0;
  emptyState.hidden = hasVideo;
  stageFullscreenBtn.disabled = !hasVideo;
  stageHintText.textContent = hasVideo ? '正在观看屏幕直播' : '等待主播开始共享';
}

function videoKey(userId, streamType) {
  return `${userId}:${streamType || STREAM_TYPE_MAIN}`;
}

function streamLabel(userId, streamType) {
  if (userId === state.userId) return '我的屏幕';
  return streamType === STREAM_TYPE_SUB ? '主播屏幕' : userId;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function setLiveState(isLive) {
  liveStateText.textContent = isLive ? '直播中' : '未开播';
  liveStateText.classList.toggle('live-on', isLive);
  liveStateText.classList.toggle('live-off', !isLive);
}

function startShareTimer() {
  state.shareStartedAt = Date.now();
  shareTimerText.textContent = '00:00';
  clearInterval(state.shareTimerId);
  state.shareTimerId = setInterval(() => {
    shareTimerText.textContent = formatDuration(Date.now() - state.shareStartedAt);
  }, 1000);
}

function stopShareTimer() {
  clearInterval(state.shareTimerId);
  state.shareTimerId = 0;
  state.shareStartedAt = 0;
  shareTimerText.textContent = '00:00';
}

function updateParticipantsList() {
  participantsList.replaceChildren();

  const local = document.createElement('div');
  local.className = 'participant-chip';
  const localName = document.createElement('span');
  const localRole = document.createElement('strong');
  localName.textContent = state.displayName || '我';
  localRole.textContent = state.role === 'broadcaster' ? '主播' : '我';
  local.append(localName, localRole);
  participantsList.appendChild(local);

  for (const userId of state.remoteUsers) {
    const item = document.createElement('div');
    item.className = 'participant-chip';
    const name = document.createElement('span');
    const role = document.createElement('strong');
    name.textContent = userId;
    role.textContent = '在线';
    item.append(name, role);
    participantsList.appendChild(item);
  }
}

async function requestTileFullscreen(tile) {
  try {
    if (document.fullscreenElement === tile) {
      await document.exitFullscreen();
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }

    if (tile.requestFullscreen) {
      await tile.requestFullscreen();
    } else if (tile.webkitRequestFullscreen) {
      tile.webkitRequestFullscreen();
    } else {
      addChatMessage('', '当前浏览器不支持全屏播放。', true);
    }
  } catch (_error) {
    addChatMessage('', '浏览器没有允许进入全屏，请手动再点一次全屏按钮。', true);
  }
}

function updateFullscreenButtons() {
  for (const { tile } of state.videoTiles.values()) {
    const button = tile.querySelector('.fullscreen-btn');
    if (button) button.textContent = document.fullscreenElement === tile ? '退出' : '全屏';
  }
}

function createVideoTile({ userId, streamType, label }) {
  const key = videoKey(userId, streamType);
  const existing = state.videoTiles.get(key);
  if (existing) return existing;

  const fragment = videoTileTemplate.content.cloneNode(true);
  const tile = fragment.querySelector('.video-tile');
  const host = fragment.querySelector('.video-host');
  const name = fragment.querySelector('.participant-name');
  const muteBtn = fragment.querySelector('.mute-btn');
  const fullscreenBtn = fragment.querySelector('.fullscreen-btn');

  host.id = `video-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  name.textContent = label || streamLabel(userId, streamType);

  muteBtn.addEventListener('click', () => {
    const video = host.querySelector('video');
    if (!video) return;
    video.muted = !video.muted;
    muteBtn.textContent = video.muted ? '取消静音' : '静音';
  });

  fullscreenBtn.addEventListener('click', () => {
    requestTileFullscreen(tile);
  });

  videosContainer.appendChild(tile);
  const entry = { tile, host, userId, streamType };
  state.videoTiles.set(key, entry);
  updateEmptyState();
  setLiveState(true);
  return entry;
}

function removeVideoTile(userId, streamType) {
  const key = videoKey(userId, streamType);
  const entry = state.videoTiles.get(key);
  if (!entry) return;
  entry.tile.remove();
  state.videoTiles.delete(key);
  updateEmptyState();
  if (state.videoTiles.size === 0 && !state.localSharing) setLiveState(false);
}

function addChatMessage(author, text, isSystem = false) {
  const line = document.createElement('p');
  line.className = 'chat-line';
  if (isSystem) {
    line.classList.add('system');
    line.textContent = text;
  } else {
    const strong = document.createElement('strong');
    strong.textContent = `${author}: `;
    line.append(strong, document.createTextNode(text));
  }
  chatMessages.appendChild(line);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function onTrtc(eventName, handler) {
  if (eventName && typeof state.trtc?.on === 'function') {
    state.trtc.on(eventName, handler);
  }
}

function parseMessageData(data) {
  try {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function bindTrtcEvents() {
  const event = TRTC.EVENT || {};

  onTrtc(event.ERROR, (error) => {
    addChatMessage('', error?.message || 'TRTC 发生错误。', true);
  });

  onTrtc(event.REMOTE_USER_ENTER, ({ userId }) => {
    if (userId) state.remoteUsers.add(userId);
    updateOnlineCount();
  });

  onTrtc(event.REMOTE_USER_EXIT, ({ userId }) => {
    if (userId) state.remoteUsers.delete(userId);
    removeVideoTile(userId, STREAM_TYPE_MAIN);
    removeVideoTile(userId, STREAM_TYPE_SUB);
    updateOnlineCount();
  });

  onTrtc(event.REMOTE_VIDEO_AVAILABLE, async ({ userId, streamType }) => {
    const type = streamType || STREAM_TYPE_MAIN;
    const entry = createVideoTile({ userId, streamType: type });
    try {
      await state.trtc.startRemoteVideo({ userId, streamType: type, view: entry.host.id });
    } catch (_error) {
      addChatMessage('', '远端画面播放失败，请刷新页面后重试。', true);
    }
  });

  onTrtc(event.REMOTE_VIDEO_UNAVAILABLE, ({ userId, streamType }) => {
    removeVideoTile(userId, streamType || STREAM_TYPE_MAIN);
  });

  onTrtc(event.CUSTOM_MESSAGE, ({ userId, data }) => {
    const message = parseMessageData(data);
    if (!message || message.type !== 'chat') return;
    addChatMessage(message.name || userId || '访客', message.text || '');
  });
}

async function connectRoom(auth) {
  state.trtc = TRTC.create();
  bindTrtcEvents();
  setConnectionLabel('连接中');

  await state.trtc.enterRoom({
    sdkAppId: state.config.sdkAppId,
    userId: auth.userId,
    userSig: auth.userSig,
    strRoomId: state.config.roomId,
    role: auth.role === 'broadcaster' ? ROLE_ANCHOR : ROLE_AUDIENCE,
    scene: SCENE_LIVE,
  });

  state.userId = auth.userId;
  setConnectionLabel('已连接');
  updateOnlineCount();
  updateParticipantsList();
}

async function startShare() {
  if (!state.trtc || state.role !== 'broadcaster') return;

  startShareBtn.disabled = true;
  try {
    const entry = createVideoTile({
      userId: state.userId,
      streamType: STREAM_TYPE_SUB,
      label: '我的屏幕',
    });

    await state.trtc.startScreenShare({
      view: entry.host.id,
      option: {
        streamType: STREAM_TYPE_SUB,
        profile: '720p',
        systemAudio: true,
        fillMode: 'contain',
      },
    });

    state.localSharing = true;
    setLiveState(true);
    startShareTimer();
    stopShareBtn.disabled = false;
    addChatMessage('', '屏幕直播已开始。', true);
  } catch (_error) {
    startShareBtn.disabled = false;
    removeVideoTile(state.userId, STREAM_TYPE_SUB);
    addChatMessage('', '屏幕共享被取消或浏览器没有授权。', true);
  }
}

async function stopShare() {
  if (!state.trtc || !state.localSharing) return;

  try {
    await state.trtc.stopScreenShare();
  } catch (_error) {
    // The track may already have ended from the browser share picker.
  }

  state.localSharing = false;
  setLiveState(state.videoTiles.size > 1);
  stopShareTimer();
  removeVideoTile(state.userId, STREAM_TYPE_SUB);
  startShareBtn.disabled = state.role !== 'broadcaster';
  stopShareBtn.disabled = true;
  addChatMessage('', '屏幕直播已停止。', true);
}

async function leaveRoom() {
  stopShareTimer();
  try {
    if (state.localSharing) await stopShare();
    if (state.trtc?.exitRoom) await state.trtc.exitRoom();
    if (state.trtc?.destroy) state.trtc.destroy();
  } catch (_error) {
    // Leaving should always return the UI to the login screen.
  }

  state.trtc = null;
  state.userId = '';
  state.role = 'viewer';
  state.localSharing = false;
  state.remoteUsers.clear();
  state.videoTiles.clear();
  videosContainer.replaceChildren();
  chatMessages.replaceChildren();
  setLiveState(false);
  updateEmptyState();
  updateOnlineCount();
  roomPanel.hidden = true;
  loginPanel.hidden = false;
  startShareBtn.disabled = true;
  stopShareBtn.disabled = true;
  setConnectionLabel('未连接');
}

async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    addChatMessage('', '邀请链接已复制。', true);
  } catch (_error) {
    addChatMessage('', '复制失败，可以直接复制浏览器地址栏链接。', true);
  }
}

function fullscreenFirstVideo() {
  const first = state.videoTiles.values().next().value;
  if (first) requestTileFullscreen(first.tile);
}

async function sendChatMessage(text) {
  const message = JSON.stringify({
    type: 'chat',
    name: state.displayName || '访客',
    text,
  });
  const data = new TextEncoder().encode(message).buffer;

  if (typeof state.trtc?.sendCustomMessage !== 'function') {
    throw new Error('当前 SDK 不支持自定义消息。');
  }

  await state.trtc.sendCustomMessage({
    cmdId: 1,
    data,
  });
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setLoginError('');

  const payload = {
    password: passwordInput.value,
    displayName: displayNameInput.value,
    role: broadcasterInput.checked ? 'broadcaster' : 'viewer',
  };

  try {
    if (!state.config) await loadConfig();
    setLoginBusy(true);
    const res = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setLoginError(body.error || '进入失败');
      return;
    }

    state.role = body.role;
    state.displayName = body.name || displayNameInput.value.trim();
    await connectRoom(body);
    loginPanel.hidden = true;
    roomPanel.hidden = false;
    startShareBtn.disabled = state.role !== 'broadcaster';
    currentUserText.textContent = state.displayName || body.userId;
    currentRoleText.textContent = state.role === 'broadcaster' ? '主播' : '观众';
    updateParticipantsList();
    addChatMessage('', state.role === 'broadcaster' ? '你已作为主播进入房间' : '你已作为观众进入房间', true);
  } catch (error) {
    setLoginError(error.message || '网络错误');
  } finally {
    setLoginBusy(false);
  }
});

startShareBtn.addEventListener('click', startShare);
stopShareBtn.addEventListener('click', stopShare);
leaveRoomBtn.addEventListener('click', leaveRoom);
copyLinkBtn.addEventListener('click', copyInviteLink);
stageFullscreenBtn.addEventListener('click', fullscreenFirstVideo);
document.addEventListener('fullscreenchange', updateFullscreenButtons);
document.addEventListener('webkitfullscreenchange', updateFullscreenButtons);

chatInput.addEventListener('input', () => {
  chatCountText.textContent = `${chatInput.value.length}/300`;
});

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !state.trtc) return;

  chatInput.value = '';
  chatCountText.textContent = '0/300';
  addChatMessage('我', text);

  try {
    await sendChatMessage(text);
  } catch (_error) {
    addChatMessage('', '消息暂时没有发送出去。TRTC 自定义消息通常只支持主播端发送，观众聊天建议后续接入腾讯云 Chat。', true);
  }
});

loadConfig().catch((error) => {
  setLoginError(error.message || '无法连接服务');
});
