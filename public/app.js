import {
  Room,
  RoomEvent,
  Track,
} from 'https://cdn.jsdelivr.net/npm/livekit-client@2/+esm';

const state = {
  room: null,
  config: null,
  role: 'viewer',
  displayName: '',
  localTracks: [],
  videoTiles: new Map(),
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
const startShareBtn = document.getElementById('startShareBtn');
const stopShareBtn = document.getElementById('stopShareBtn');
const videosContainer = document.getElementById('videosContainer');
const emptyState = document.getElementById('emptyState');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const videoTileTemplate = document.getElementById('videoTileTemplate');

async function loadConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('无法读取房间配置');
  state.config = await res.json();
  roomNameText.textContent = state.config.roomName;
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
  if (!state.room) return;
  onlineCount.textContent = String(state.room.remoteParticipants.size + 1);
}

function updateEmptyState() {
  emptyState.hidden = videosContainer.children.length > 0;
}

function participantLabel(participant) {
  return participant?.name || participant?.identity || 'friend';
}

function tileKey(participant, publication) {
  return `${participant.identity}:${publication.trackSid || publication.sid || publication.trackName}`;
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
    if (button) {
      button.textContent = document.fullscreenElement === tile ? '退出' : '全屏';
    }
  }
}

function addVideoTile(track, publication, participant) {
  const key = tileKey(participant, publication);
  if (state.videoTiles.has(key)) return;

  const fragment = videoTileTemplate.content.cloneNode(true);
  const tile = fragment.querySelector('.video-tile');
  const host = fragment.querySelector('.video-host');
  const name = fragment.querySelector('.participant-name');
  const muteBtn = fragment.querySelector('.mute-btn');
  const fullscreenBtn = fragment.querySelector('.fullscreen-btn');
  const element = track.attach();

  element.playsInline = true;
  element.autoplay = true;
  name.textContent = participantLabel(participant);
  host.appendChild(element);

  muteBtn.addEventListener('click', () => {
    element.muted = !element.muted;
    muteBtn.textContent = element.muted ? '取消静音' : '静音';
  });

  fullscreenBtn.addEventListener('click', () => {
    requestTileFullscreen(tile);
  });

  videosContainer.appendChild(tile);
  state.videoTiles.set(key, { tile, track });
  updateEmptyState();
}

function removeVideoTile(track, publication, participant) {
  const key = tileKey(participant, publication);
  const entry = state.videoTiles.get(key);
  track.detach().forEach((element) => element.remove());
  if (entry) {
    entry.tile.remove();
    state.videoTiles.delete(key);
  }
  updateEmptyState();
}

function attachAudio(track) {
  const audio = track.attach();
  audio.autoplay = true;
  audio.hidden = true;
  document.body.appendChild(audio);
}

function addChatMessage(author, text, isSystem = false) {
  const line = document.createElement('p');
  line.className = 'chat-line';
  if (isSystem) {
    line.textContent = text;
  } else {
    const strong = document.createElement('strong');
    strong.textContent = `${author}: `;
    line.append(strong, document.createTextNode(text));
  }
  chatMessages.appendChild(line);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function connectRoom(token) {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  room.on(RoomEvent.ConnectionStateChanged, (status) => {
    const labels = {
      connected: '已连接',
      connecting: '连接中',
      disconnected: '已断开',
      reconnecting: '重连中',
    };
    setConnectionLabel(labels[status] || status);
  });

  room.on(RoomEvent.ParticipantConnected, (participant) => {
    updateOnlineCount();
    addChatMessage('', `${participantLabel(participant)} 加入了房间`, true);
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    updateOnlineCount();
    addChatMessage('', `${participantLabel(participant)} 离开了房间`, true);
  });

  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    if (track.kind === Track.Kind.Video) {
      addVideoTile(track, publication, participant);
    }
    if (track.kind === Track.Kind.Audio) {
      attachAudio(track);
    }
  });

  room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
    if (track.kind === Track.Kind.Video) {
      removeVideoTile(track, publication, participant);
    }
  });

  room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
    if (topic && topic !== 'chat') return;
    const text = new TextDecoder().decode(payload);
    addChatMessage(participantLabel(participant), text);
  });

  await room.connect(state.config.livekitUrl, token);
  state.room = room;
  updateOnlineCount();
}

async function publishTrack(track, options) {
  const publication = await state.room.localParticipant.publishTrack(track, options);
  state.localTracks.push({ track, publication });
}

async function startShare() {
  if (!state.room || state.role !== 'broadcaster') return;

  startShareBtn.disabled = true;
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 30, max: 30 },
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
      },
      audio: true,
    });

    const [screenVideo] = screenStream.getVideoTracks();
    if (screenVideo) {
      screenVideo.addEventListener('ended', stopShare, { once: true });
      await publishTrack(screenVideo, {
        source: Track.Source.ScreenShare,
        name: 'screen',
        videoEncoding: {
          maxBitrate: 2500000,
          maxFramerate: 30,
        },
      });
    }

    for (const audioTrack of screenStream.getAudioTracks()) {
      await publishTrack(audioTrack, {
        source: Track.Source.ScreenShareAudio,
        name: 'system-audio',
      });
    }

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      for (const micTrack of micStream.getAudioTracks()) {
        await publishTrack(micTrack, {
          source: Track.Source.Microphone,
          name: 'microphone',
        });
      }
    } catch (_error) {
      addChatMessage('', '麦克风没有开启，当前只直播屏幕和可用的系统声音。', true);
    }

    stopShareBtn.disabled = false;
    addChatMessage('', '屏幕直播已开始', true);
  } catch (error) {
    startShareBtn.disabled = false;
    addChatMessage('', '屏幕共享被取消或浏览器没有授权。', true);
  }
}

async function stopShare() {
  if (!state.room) return;

  const localTracks = [...state.localTracks];
  state.localTracks = [];
  for (const { track } of localTracks) {
    try {
      await state.room.localParticipant.unpublishTrack(track, true);
    } catch (_error) {
      track.stop();
    }
  }

  startShareBtn.disabled = state.role !== 'broadcaster';
  stopShareBtn.disabled = true;
  addChatMessage('', '屏幕直播已停止', true);
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
    state.displayName = displayNameInput.value.trim();
    await connectRoom(body.token);
    loginPanel.hidden = true;
    roomPanel.hidden = false;
    startShareBtn.disabled = state.role !== 'broadcaster';
    currentUserText.textContent = state.displayName || body.identity;
    currentRoleText.textContent = state.role === 'broadcaster' ? '主播' : '观众';
    addChatMessage('', state.role === 'broadcaster' ? '你已作为主播进入房间' : '你已作为观众进入房间', true);
  } catch (error) {
    setLoginError(error.message || '网络错误');
  } finally {
    setLoginBusy(false);
  }
});

startShareBtn.addEventListener('click', startShare);
stopShareBtn.addEventListener('click', stopShare);
document.addEventListener('fullscreenchange', updateFullscreenButtons);
document.addEventListener('webkitfullscreenchange', updateFullscreenButtons);

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !state.room) return;

  const payload = new TextEncoder().encode(text);
  state.room.localParticipant.publishData(payload, { reliable: true, topic: 'chat' });
  addChatMessage('我', text);
  chatInput.value = '';
});

loadConfig().catch((error) => {
  setLoginError(error.message || '无法连接服务');
});
