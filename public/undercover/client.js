// 谁是卧底 - 前端核心交互逻辑
(function() {
  const socket = io('/undercover');

  // 安全容错：如果 sfx.js 异常或被拦截，提供空安全代理，确保游戏永远可正常交互
  if (!window.sfx) {
    window.sfx = {
      playClick: () => {}, playVote: () => {}, playFlip: () => {}, playDeal: () => {},
      playElimination: () => {}, playVictory: () => {}, playTick: () => {}, playJoin: () => {},
      playPop: () => {}, speak: () => {}, vibrate: () => {}
    };
  }

  // 可选头像库
  const AVATARS = [
    '😎', '🧐', '🤠', '🥷', '🦸‍♂️', '🧙‍♂️',
    '🐶', '🐱', '🦊', '🐼', '🦁', '🐯',
    '🐸', '🐵', '🦄', '🐲', '🤖', '👽',
    '👻', '🧛‍♂️', '🥳', '🤩', '🚀', '💎'
  ];

  // 本地玩家信息 (优先使用 localStorage，确保微信等内置浏览器退出再进时能恢复身份)
  let myPlayerId = null;
  try {
    myPlayerId = localStorage.getItem('undercover_pid') || sessionStorage.getItem('undercover_tab_pid');
  } catch (e) {}

  if (!myPlayerId) {
    myPlayerId = 'p_' + Math.random().toString(36).substring(2, 8) + Date.now().toString(36);
    try {
      localStorage.setItem('undercover_pid', myPlayerId);
      sessionStorage.setItem('undercover_tab_pid', myPlayerId);
    } catch (e) {}
  } else {
    try {
      localStorage.setItem('undercover_pid', myPlayerId);
    } catch (e) {}
  }

  let myNickname = null;
  try {
    myNickname = localStorage.getItem('undercover_name');
  } catch (e) {}
  if (!myNickname || myNickname === '玩家1') {
    myNickname = `玩家${Math.floor(100 + Math.random() * 900)}`;
    try {
      localStorage.setItem('undercover_name', myNickname);
    } catch (e) {}
  }
  let myAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  try {
    const savedAvatar = localStorage.getItem('undercover_avatar');
    if (savedAvatar) myAvatar = savedAvatar;
  } catch (e) {}
  let currentRoom = null;
  let selectedVoteTargetId = null;
  let lastRenderedPhase = null;
  let lastRenderedRound = null;
  let lastAnnouncedSpeakerId = null;
  let currentTimerStartTime = null;
  let speechTimerInterval = null;
  let currentPkTimerStartTime = null;
  let pkTimerInterval = null;
  let currentVotingStartTime = null;
  let votingTimerInterval = null;
  let customWordPairs = [];
  let serverInfo = null;

  let pendingRoomSettings = {
    undercoverCount: 1,
    whiteboardCount: 0,
    speechTimeLimit: 90,
    voteTimeLimit: 60,
    speechOrderMode: 'random',
    revealRoleOnEliminate: true,
    allowGuessWord: true,
    enablePunishment: true,
    category: 'all',
    customWords: []
  };

  function formatSettingsSummary(settings) {
    if (!settings) return '';
    const catMap = {
      all: '综合随机', classic: '经典对决', life: '生活日常',
      fun: '搞笑扎心', pop: '影视动漫', food: '吃货天下', custom_only: '自定义'
    };
    const catText = catMap[settings.category] || '综合随机';
    const isDarkCard = settings.revealRoleOnEliminate === false;
    const canGuess = settings.allowGuessWord !== false;
    const speechLimit = settings.speechTimeLimit > 0 ? `${settings.speechTimeLimit}s发言` : '不限时发言';
    const voteLimit = settings.voteTimeLimit > 0 ? `${settings.voteTimeLimit}s投票` : '手动投票';
    const orderText = settings.speechOrderMode === 'seat' ? '顺时针轮转' : '随机乱序';
    const punishText = settings.enablePunishment === false ? '无惩罚' : '大冒险';

    return `${settings.undercoverCount}卧底 · ${settings.whiteboardCount}白板 · ${isDarkCard ? '🎭暗牌' : '📢明牌'} · ${canGuess ? '🎯猜词' : '纯淘汰'} · ${speechLimit} · ${voteLimit} · ${orderText} · ${catText}`;
  }

  function updateHomeSettingsTag() {
    const tag = document.getElementById('home-settings-tag');
    if (tag) {
      tag.innerText = formatSettingsSummary(pendingRoomSettings);
    }
  }

  // DOM 元素引用
  const views = {
    home: document.getElementById('view-home'),
    lobby: document.getElementById('view-lobby'),
    card: document.getElementById('view-card'),
    speaking: document.getElementById('view-speaking'),
    voting: document.getElementById('view-voting'),
    pk: document.getElementById('view-pk'),
    guess: document.getElementById('view-guess'),
    elimination: document.getElementById('view-elimination'),
    gameOver: document.getElementById('view-game-over')
  };

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function switchView(activeViewName) {
    Object.keys(views).forEach(name => {
      if (name === activeViewName) {
        views[name].classList.remove('hidden');
      } else {
        views[name].classList.add('hidden');
      }
    });

    const showPublicScreenViews = ['speaking', 'voting', 'pk', 'guess', 'elimination'];
    const isGameStage = showPublicScreenViews.includes(activeViewName);

    // 动态切换桌面双栏布局 class
    const layoutWrapper = document.getElementById('game-layout-wrapper');
    if (layoutWrapper) {
      layoutWrapper.classList.toggle('has-sidebar', isGameStage);
    }

    // 仅在真实对局环节展示公屏记录；在首页 (home)、大厅 (lobby)、看牌 (card)、结算 (gameOver) 阶段严格隐藏并清空残留
    const publicScreenContainer = document.getElementById('public-screen-container');
    const publicScreenLogs = document.getElementById('public-screen-logs');
    const publicScreenSummary = document.getElementById('public-screen-summary');
    const publicScreenBadge = document.getElementById('public-screen-badge');
    if (publicScreenContainer) {
      if (!isGameStage) {
        publicScreenContainer.classList.add('hidden');
        if (publicScreenLogs && (activeViewName === 'home' || activeViewName === 'lobby')) {
          publicScreenLogs.innerHTML = '<div style="color: var(--text-muted); text-align: center;">暂无描述记录</div>';
          if (publicScreenSummary) publicScreenSummary.innerText = '暂无记录';
          if (publicScreenBadge) publicScreenBadge.innerText = '0条';
        }
      }
    }

    const headerLeaveBtn = document.getElementById('btn-header-leave');
    const mobileLeaveBtn = document.getElementById('btn-mobile-leave');
    if (headerLeaveBtn) {
      if (activeViewName === 'home') {
        headerLeaveBtn.classList.add('hidden');
      } else {
        headerLeaveBtn.classList.remove('hidden');
      }
    }
    if (mobileLeaveBtn) {
      if (activeViewName === 'home') {
        mobileLeaveBtn.classList.add('hidden');
      } else {
        mobileLeaveBtn.classList.remove('hidden');
      }
    }
  }

  function confirmLeaveRoom() {
    window.sfx.playClick();
    if (confirm('确定要退出当前房间吗？')) {
      socket.emit('leave_room', () => {});
      currentRoom = null;
      localStorage.removeItem('undercover_room');
      const publicScreen = document.getElementById('public-screen-container');
      if (publicScreen) publicScreen.classList.add('hidden');
      const publicScreenLogs = document.getElementById('public-screen-logs');
      if (publicScreenLogs) publicScreenLogs.innerHTML = '<div style="color: var(--text-muted); text-align: center;">暂无描述记录</div>';
      const publicScreenSummary = document.getElementById('public-screen-summary');
      if (publicScreenSummary) publicScreenSummary.innerText = '暂无记录';
      const publicScreenBadge = document.getElementById('public-screen-badge');
      if (publicScreenBadge) publicScreenBadge.innerText = '0条';
      switchView('home');
      const hostResetBtn = document.getElementById('btn-host-reset');
      if (hostResetBtn) hostResetBtn.classList.add('hidden');
      const mobileHostResetBtn = document.getElementById('btn-mobile-host-reset');
      if (mobileHostResetBtn) mobileHostResetBtn.classList.add('hidden');
    }
  }

  // 初始化首页头像与数据
  function initHome() {
    const avatarGrid = document.getElementById('home-avatar-grid');
    avatarGrid.innerHTML = '';
    AVATARS.forEach(emoji => {
      const div = document.createElement('div');
      div.className = `avatar-item ${emoji === myAvatar ? 'active' : ''}`;
      div.innerText = emoji;
      div.addEventListener('click', () => {
        myAvatar = emoji;
        localStorage.setItem('undercover_avatar', myAvatar);
        document.querySelectorAll('.avatar-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        window.sfx.playClick();
      });
      avatarGrid.appendChild(div);
    });

    const nameInput = document.getElementById('input-nickname');
    nameInput.value = myNickname;
    nameInput.addEventListener('input', (e) => {
      myNickname = e.target.value.trim() || '神秘人';
      localStorage.setItem('undercover_name', myNickname);
    });

    // 检查 URL 是否带 room 参数
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      const roomInput = document.getElementById('input-room-code');
      if (roomInput) {
        roomInput.value = roomParam;
        roomInput.style.borderColor = '#fbbf24';
        roomInput.style.boxShadow = '0 0 10px rgba(251, 191, 36, 0.3)';
      }
      const joinBtn = document.getElementById('btn-join-room');
      if (joinBtn) {
        joinBtn.innerHTML = `🚀 进入受邀房间 (${roomParam})`;
        joinBtn.classList.add('btn-start-game-glow');
      }
    }

    const btnHomeSettings = document.getElementById('btn-home-toggle-settings');
    if (btnHomeSettings) {
      btnHomeSettings.addEventListener('click', () => {
        window.sfx.playClick();
        populateSettingsModal(pendingRoomSettings);
        modalSettings.classList.remove('hidden');
      });
    }
    updateHomeSettingsTag();
  }

  // 获取服务器网络信息并准备二维码
  fetch('/api/server-info')
    .then(r => r.json())
    .then(data => {
      serverInfo = data;
    })
    .catch(() => {});

  // 创建房间
  document.getElementById('btn-create-room').addEventListener('click', () => {
    window.sfx.playClick();
    localStorage.removeItem('undercover_room');
    currentRoom = null;
    const name = document.getElementById('input-nickname').value.trim() || myNickname;
    socket.emit('create_room', {
      player: { id: myPlayerId, name, avatar: myAvatar },
      settings: pendingRoomSettings
    }, (res) => {
      if (!res.success) {
        alert(res.message || '创建房间失败');
      } else {
        localStorage.setItem('undercover_room', res.roomCode);
        if (res.roomData) {
          currentRoom = res.roomData;
          switchView('lobby');
          renderRoom(res.roomData);
        }
      }
    });
  });

  // 加入房间
  document.getElementById('btn-join-room').addEventListener('click', () => {
    window.sfx.playClick();
    const roomCode = document.getElementById('input-room-code').value.trim();
    if (!roomCode || roomCode.length < 4) {
      return alert('请输入正确的 4 位房间号');
    }
    const name = document.getElementById('input-nickname').value.trim() || myNickname;
    localStorage.setItem('undercover_room', roomCode);
    socket.emit('join_room', {
      roomCode,
      player: { id: myPlayerId, name, avatar: myAvatar }
    }, (res) => {
      if (!res.success) {
        localStorage.removeItem('undercover_room');
        alert(res.message || '加入房间失败');
      } else if (res.roomData) {
        currentRoom = res.roomData;
        renderRoom(res.roomData);
      }
    });
  });

  // 房间状态更新总调度
  socket.on('room_update', (roomData) => {
    currentRoom = roomData;
    if (roomData && roomData.code) {
      localStorage.setItem('undercover_room', roomData.code);
    }
    renderRoom(roomData);
  });

  socket.on('kicked_from_room', () => {
    alert('您已被房主移出房间');
    currentRoom = null;
    localStorage.removeItem('undercover_room');
    switchView('home');
  });

  // 自动重新连接与全量状态同步机制 (针对手机熄屏、切后台等场景)
  function autoSyncRoom() {
    const savedRoomCode = (currentRoom && currentRoom.code) || localStorage.getItem('undercover_room');
    if (!savedRoomCode || !socket.connected) return;

    // 已有 currentRoom（已在房间内）→ 只发 sync_room 心跳更新 socketId 和在线状态
    // 未有 currentRoom（断线重连、刷新等）→ 发 join_room 完整恢复
    if (currentRoom && currentRoom.code === savedRoomCode) {
      socket.emit('sync_room', { roomCode: savedRoomCode, playerId: myPlayerId });
    } else {
      const name = localStorage.getItem('undercover_name') || myNickname;
      const avatar = localStorage.getItem('undercover_avatar') || myAvatar;
      socket.emit('join_room', {
        roomCode: savedRoomCode,
        player: { id: myPlayerId, name, avatar }
      }, (res) => {
        if (res && res.success && res.roomData) {
          currentRoom = res.roomData;
          renderRoom(res.roomData);
        } else if (res && !res.success) {
          localStorage.removeItem('undercover_room');
          currentRoom = null;
        }
      });
    }
  }

  // Socket 连接或重连成功时触发同步
  socket.on('connect', () => {
    autoSyncRoom();
  });

  // 当手机解锁屏幕、切换回浏览器页面时立即触发同步
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!socket.connected) {
        socket.connect();
      }
      autoSyncRoom();
    }
  });

  window.addEventListener('focus', autoSyncRoom);
  window.addEventListener('pageshow', autoSyncRoom);

  // 监听全房间阶段广播通知，一旦阶段切换立即全自动对齐，彻底告别 F5 刷新
  socket.on('room_phase_sync', (data) => {
    if (data && (!currentRoom || currentRoom.code === data.code)) {
      if (!currentRoom || !currentRoom.gameState || currentRoom.gameState.phase !== data.phase) {
        autoSyncRoom();
      }
    }
  });

  // 定时心跳保活 (3秒一次)，确保多端状态快速对齐
  setInterval(() => {
    const savedRoomCode = (currentRoom && currentRoom.code) || localStorage.getItem('undercover_room');
    if (savedRoomCode && socket.connected) {
      socket.emit('sync_room', { roomCode: savedRoomCode, playerId: myPlayerId });
    }
  }, 3000);

  // 渲染房间主函数
  function renderRoom(room) {
    const me = (room.players && room.players.find(p => p.id === myPlayerId)) || room.myPlayer;
    const isHost = (room.hostId === myPlayerId) || (me && me.isHost) || (room.myPlayer && room.myPlayer.isHost);

    // 1. 房间号展示与在线玩家统计
    document.getElementById('display-room-code').innerText = room.code;
    const activePlayerCount = room.players ? room.players.filter(p => p.isOnline).length : 0;
    document.getElementById('lobby-player-count').innerText = activePlayerCount;

    // 2. 观战提示控制
    const spectatorBanner = document.getElementById('spectator-banner');
    if (me && me.isSpectator && room.gameState.phase !== 'LOBBY' && room.gameState.phase !== 'GAME_OVER') {
      spectatorBanner.classList.remove('hidden');
    } else {
      spectatorBanner.classList.add('hidden');
    }

    // 3. 房主重置按钮控制
    const hostResetBtn = document.getElementById('btn-host-reset');
    const mobileHostResetBtn = document.getElementById('btn-mobile-host-reset');
    const isResetAvailable = isHost && room.gameState.phase !== 'LOBBY';
    if (hostResetBtn) {
      if (isResetAvailable) hostResetBtn.classList.remove('hidden');
      else hostResetBtn.classList.add('hidden');
    }
    if (mobileHostResetBtn) {
      if (isResetAvailable) mobileHostResetBtn.classList.remove('hidden');
      else mobileHostResetBtn.classList.add('hidden');
    }

    document.querySelectorAll('.btn-host-reset-action').forEach(btn => {
      if (isHost && room.gameState.phase !== 'LOBBY' && room.gameState.phase !== 'GAME_OVER') {
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
    });

    // 4. 根据阶段渲染视图
    const phase = room.gameState.phase;
    const isPhaseChanged = lastRenderedPhase !== phase;
    const isRoundChanged = lastRenderedRound !== room.gameState.round;

    if (isPhaseChanged) {
      lastAnnouncedSpeakerId = null;
      // 仅在真实切换阶段时才重置投票选定目标与阶段定时器
      if (phase !== 'PK_SPEAKING' && pkTimerInterval) {
        clearInterval(pkTimerInterval);
        pkTimerInterval = null;
        currentPkTimerStartTime = null;
      }
      if (phase === 'VOTING' || phase === 'PK_VOTING' || phase === 'LOBBY' || phase === 'SPEAKING' || phase === 'CARD_VIEW') {
        selectedVoteTargetId = null;
      }
      // TTS 阶段语音播报
      if (phase === 'CARD_VIEW') {
        window.sfx.speak('游戏开始，请查看你的底牌词语，注意防窥');
      } else if (phase === 'SPEAKING') {
        window.sfx.speak(`第 ${room.gameState.round} 轮发言开始`);
      } else if (phase === 'VOTING') {
        window.sfx.speak('发言结束，请大家投票找出卧底');
      } else if (phase === 'PK_SPEAKING') {
        window.sfx.speak('出现平票，请平票候选人依次辩解');
      } else if (phase === 'PK_VOTING') {
        window.sfx.speak('辩解结束，请未平票玩家再次投票');
      } else if (phase === 'GUESS_WORD') {
        window.sfx.speak('进入绝地猜词环节');
      }
    }

    lastRenderedPhase = phase;
    lastRenderedRound = room.gameState.round;

    if (phase === 'LOBBY') {
      switchView('lobby');
      renderLobby(room, isHost);
    } else if (phase === 'CARD_VIEW') {
      switchView('card');
      renderCardView(room, me, isHost, isPhaseChanged);
    } else if (phase === 'SPEAKING') {
      switchView('speaking');
      renderSpeaking(room, me, isHost);
    } else if (phase === 'VOTING') {
      switchView('voting');
      renderVoting(room, me, false, isHost);
    } else if (phase === 'PK_SPEAKING') {
      switchView('pk');
      renderPKSpeaking(room, me, isHost);
    } else if (phase === 'PK_VOTING') {
      switchView('voting');
      renderVoting(room, me, true, isHost);
    } else if (phase === 'GUESS_WORD') {
      switchView('guess');
      renderGuessWord(room, me, isHost);
    } else if (phase === 'ELIMINATION') {
      switchView('elimination');
      renderElimination(room, isHost);
    } else if (phase === 'GAME_OVER') {
      switchView('gameOver');
      renderGameOver(room, isHost, isPhaseChanged);
    }

    // 5. 渲染公屏记录 (仅在发言、投票、争辩、猜词、淘汰等活跃对局环节展示；大厅、看牌、结算、首页坚决隐藏并重置)
    const publicScreenContainer = document.getElementById('public-screen-container');
    const publicScreenLogs = document.getElementById('public-screen-logs');
    const publicScreenBadge = document.getElementById('public-screen-badge');
    const publicScreenSummary = document.getElementById('public-screen-summary');
    if (publicScreenContainer && publicScreenLogs) {
      const activeGamePhases = ['SPEAKING', 'VOTING', 'PK_SPEAKING', 'PK_VOTING', 'GUESS_WORD', 'ELIMINATION'];
      if (activeGamePhases.includes(phase)) {
        publicScreenContainer.classList.remove('hidden');
        
        const logs = room.gameState.clueLogs || [];
        if (publicScreenBadge) publicScreenBadge.innerText = `${logs.length}条`;

        if (logs.length === 0) {
          publicScreenLogs.innerHTML = '<div style="color: var(--text-muted); text-align: center;">暂无描述记录</div>';
          if (publicScreenSummary) publicScreenSummary.innerText = '暂无记录';
        } else {
          publicScreenLogs.innerHTML = logs.map(log => {
            const prefix = log.isPk ? `<span style="color: #ef4444;">[PK发言]</span>` : `<span style="color: #a855f7;">[第${log.round}轮]</span>`;
            return `<div style="padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.1);">
              ${prefix} <b style="color: #38bdf8;">${escapeHtml(log.playerName)}</b>: ${escapeHtml(log.clue)}
            </div>`;
          }).join('');
          
          const lastLog = logs[logs.length - 1];
          if (publicScreenSummary && lastLog) {
            publicScreenSummary.innerText = `${lastLog.playerName}: ${lastLog.clue}`;
          }

          // 自动滚动到底部
          setTimeout(() => {
            publicScreenLogs.scrollTop = publicScreenLogs.scrollHeight;
          }, 50);
        }
      } else {
        publicScreenContainer.classList.add('hidden');
        if (phase === 'LOBBY' || phase === 'CARD_VIEW') {
          publicScreenLogs.innerHTML = '<div style="color: var(--text-muted); text-align: center;">暂无描述记录</div>';
          if (publicScreenSummary) publicScreenSummary.innerText = '暂无记录';
          if (publicScreenBadge) publicScreenBadge.innerText = '0条';
        }
      }
    }
  }

  // 渲染大厅
  function renderLobby(room, isHost) {
    // 房主信息及顶栏提示
    const hostPlayer = room.players.find(p => p.id === room.hostId);
    const hostName = hostPlayer ? hostPlayer.name : '未知';
    const hostBanner = document.getElementById('lobby-host-banner');
    const displayHostName = document.getElementById('display-host-name');
    if (displayHostName) {
      displayHostName.innerText = hostName;
    }
    if (hostBanner) {
      if (isHost) {
        hostBanner.innerHTML = `👑 <b>你是本房间房主</b>（拥有开始游戏与配置权限）`;
      } else {
        const isHostOnline = hostPlayer && hostPlayer.isOnline;
        let hostStatusText = '';
        if (isHostOnline) {
          hostStatusText = '<span style="color:#34d399; font-weight: 700;">(🟢 在线)</span>';
        } else {
          const remSec = (typeof room.hostOfflineRemainingSeconds === 'number' && room.hostOfflineRemainingSeconds > 0)
            ? room.hostOfflineRemainingSeconds
            : 60;
          hostStatusText = `<span style="color:#f87171; font-weight: 700;">(⚠️ 离线重连中，保留${remSec}s)</span>`;
        }
        hostBanner.innerHTML = `👑 当前房主: <b>${escapeHtml(hostName)}</b> ${hostStatusText}`;
      }
    }

    const playersGrid = document.getElementById('lobby-players-grid');
    playersGrid.innerHTML = '';

    room.players.forEach(p => {
      const isMe = p.id === myPlayerId;
      const box = document.createElement('div');
      box.className = `player-box ${p.isHost ? 'is-host' : ''} ${isMe ? 'is-me' : ''}`;
      const displayName = (p.name && p.name.trim()) ? p.name : '神秘人';
      const aiBadge = p.isAi ? '<span class="ai-badge">AI</span>' : '';
      const hostBadge = p.isHost ? '<span class="host-badge">👑 房主</span>' : '';
      const meBadge = isMe ? '<span class="me-badge">我</span>' : '';
      const offlineBadge = (!p.isOnline && !p.isAi) ? '<span class="offline-badge">离线</span>' : '';
      const canKick = (isHost && !isMe) || (!p.isOnline && !isMe);
      const kickBtnTitle = !p.isOnline ? '移除离线玩家' : '移出玩家';
      box.innerHTML = `
        <div class="player-avatar">
          ${p.avatar}
          <span class="status-dot ${p.isOnline ? 'online' : 'offline'}" title="${p.isOnline ? '在线' : '离线'}"></span>
          ${p.isHost ? '<span class="host-crown">👑</span>' : ''}
        </div>
        <div class="player-name" title="${escapeHtml(displayName)}" style="font-weight: ${isMe ? '700' : '500'}; color: ${isMe ? '#fbbf24' : 'var(--text-primary)'};">${escapeHtml(displayName)}${isMe ? ' (我)' : ''}</div>
        <div style="display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; margin-top: 4px;">
          ${hostBadge}${meBadge}${aiBadge}${offlineBadge}
        </div>
        ${canKick ? `<button class="kick-btn" data-id="${p.id}" title="${kickBtnTitle}">✕ 移出</button>` : ''}
      `;

        if (canKick) {
          box.querySelector('.kick-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const actionMsg = !p.isOnline ? `确定要移除离线玩家 ${displayName} 吗？` : `确定要踢出 ${displayName} 吗？`;
            if (confirm(actionMsg)) {
              socket.emit('kick_player', p.id);
            }
          });
        }
        playersGrid.appendChild(box);
      });

      // 离线玩家提示栏更新
      const offlinePlayers = room.players.filter(p => !p.isOnline && !p.isAi);
      const offlineAlert = document.getElementById('lobby-offline-alert');
      if (offlineAlert) {
        if (offlinePlayers.length > 0) {
          offlineAlert.classList.remove('hidden');
        } else {
          offlineAlert.classList.add('hidden');
        }
      }

    const hostControls = document.getElementById('host-controls');
    const guestWaiting = document.getElementById('guest-waiting-msg');
    const guestWaitingText = document.getElementById('guest-waiting-text');
    const btnClaimHost = document.getElementById('btn-claim-host');
    const lobbyStartTip = document.getElementById('lobby-start-tip');
    const btnStartGame = document.getElementById('btn-start-game');

    const settingsSummary = formatSettingsSummary(room.settings);

    const hostSettingsSummary = document.getElementById('lobby-settings-summary');
    if (hostSettingsSummary) hostSettingsSummary.innerText = settingsSummary;

    const guestSettingsSummary = document.getElementById('guest-settings-summary');
    if (guestSettingsSummary) guestSettingsSummary.innerText = settingsSummary;

    const onlineCount = room.players.filter(p => p.isOnline).length;

    if (isHost) {
      if (hostControls) hostControls.classList.remove('hidden');
      if (guestWaiting) guestWaiting.classList.add('hidden');
    } else {
      if (hostControls) hostControls.classList.add('hidden');
      if (guestWaiting) guestWaiting.classList.remove('hidden');

      if (guestWaitingText) {
        if (onlineCount >= 3) {
          guestWaitingText.innerHTML = `
            <div style="font-size: 14px; color: #34d399; font-weight: 700; margin-bottom: 4px;">
              ✅ 房间已满 ${onlineCount} 人在线，全员已就绪！
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">
              等待房主开局，你也可以点击下方「🚀 开始游戏」直接开启对局
            </div>
          `;
        } else {
          guestWaitingText.innerHTML = `
            <div style="font-size: 14px; color: #e2e8f0; font-weight: 600; margin-bottom: 4px;">
              ⏳ 等待更多玩家加入 (当前 ${onlineCount}/3 人)...
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">
              可邀请好友扫码加入，或直接点击下方「开始游戏」自动补齐电脑开局
            </div>
          `;
        }
      }
      if (btnClaimHost) {
        btnClaimHost.classList.remove('hidden');
        const isHostOnline = hostPlayer && hostPlayer.isOnline;
        if (!isHostOnline) {
          btnClaimHost.innerHTML = '👑 房主已离线，点击立即接管房主';
          btnClaimHost.style.borderColor = '#f59e0b';
          btnClaimHost.style.background = 'rgba(245, 158, 11, 0.25)';
          btnClaimHost.style.color = '#fbbf24';
        } else {
          btnClaimHost.innerHTML = '👑 成为房主 / 调整配置';
          btnClaimHost.style.borderColor = 'rgba(245, 158, 11, 0.4)';
          btnClaimHost.style.background = 'transparent';
          btnClaimHost.style.color = '#fbbf24';
        }
      }
    }

    // 全局通用开始游戏按键与提示（房主及所有玩家均可见并可点击启动游戏）
    if (lobbyStartTip) {
      if (onlineCount >= 3) {
        lobbyStartTip.innerHTML = `🎉 <b>全员已就绪 (${onlineCount}人在线)</b>，点击下方按钮立即开启游戏！`;
      } else {
        const diff = 3 - onlineCount;
        lobbyStartTip.innerHTML = `💡 当前已有 <b>${onlineCount}</b> 人（还需 ${diff} 人），点击下方可自动补齐电脑开局`;
      }
    }

    if (btnStartGame) {
      if (onlineCount >= 3) {
        btnStartGame.innerHTML = isHost ? `🚀 房主开始游戏 (${onlineCount}人就绪)` : `🚀 立即开始游戏 (${onlineCount}人就绪)`;
      } else {
        btnStartGame.innerHTML = `🚀 开始游戏 (自动补齐电脑)`;
      }
    }
  }

  // 退出房间处理 (顶部栏退出、大厅退出、结算页退出、首页返回链接)
  const btnHeaderLeave = document.getElementById('btn-header-leave');
  if (btnHeaderLeave) {
    btnHeaderLeave.addEventListener('click', confirmLeaveRoom);
  }

  const btnLeaveLobby = document.getElementById('btn-leave-lobby');
  if (btnLeaveLobby) {
    btnLeaveLobby.addEventListener('click', confirmLeaveRoom);
  }

  const btnGameOverLeave = document.getElementById('btn-gameover-leave');
  if (btnGameOverLeave) {
    btnGameOverLeave.addEventListener('click', confirmLeaveRoom);
  }

  const linkHomeLobby = document.getElementById('link-home-lobby');
  if (linkHomeLobby) {
    linkHomeLobby.addEventListener('click', (e) => {
      if (currentRoom) {
        e.preventDefault();
        if (confirm('你正在房间中，确定要退出当前房间并返回游戏大厅吗？')) {
          socket.emit('leave_room', () => {});
          currentRoom = null;
          localStorage.removeItem('undercover_room');
          window.location.href = '/';
        }
      }
    });
  }

  // 接管 / 申请成为房主
  const btnClaimHost = document.getElementById('btn-claim-host');
  if (btnClaimHost) {
    btnClaimHost.addEventListener('click', () => {
      window.sfx.playClick();
      socket.emit('claim_host', (res) => {
        if (res && !res.success) {
          alert(res.message || '接管房主失败');
        }
      });
    });
  }

  // 一键清理离线幽灵玩家
  const btnCleanOffline = document.getElementById('btn-clean-offline');
  if (btnCleanOffline) {
    btnCleanOffline.addEventListener('click', () => {
      window.sfx.playClick();
      socket.emit('clean_offline_players');
    });
  }

  // 房主添加/移除电脑
  const btnAddAi = document.getElementById('btn-add-ai');
  if (btnAddAi) {
    btnAddAi.addEventListener('click', () => {
      window.sfx.playClick();
      socket.emit('add_ai');
    });
  }

  // 补齐电脑(测试专用)
  const btnQuickFillAi = document.getElementById('btn-quick-fill-ai');
  if (btnQuickFillAi) {
    btnQuickFillAi.addEventListener('click', () => {
      window.sfx.playClick();
      if (!currentRoom) return;
      const count = currentRoom.players.filter(p => p.isOnline).length;
      const need = Math.max(0, 3 - count);
      if (need === 0) {
        alert('当前已满 3 人以上，可直接点击【🚀 开始游戏】！');
        return;
      }
      for (let i = 0; i < need; i++) {
        socket.emit('add_ai');
      }
    });
  }

  const btnRemoveAi = document.getElementById('btn-remove-ai');
  if (btnRemoveAi) {
    btnRemoveAi.addEventListener('click', () => {
      window.sfx.playClick();
      socket.emit('remove_ai');
    });
  }

  // 房主点击开始游戏 (支持智能检测并一键补齐电脑)
  document.getElementById('btn-start-game').addEventListener('click', () => {
    window.sfx.playClick();
    if (!currentRoom) return;
    const onlineCount = currentRoom.players.filter(p => p.isOnline).length;
    if (onlineCount < 3) {
      if (confirm(`当前仅有 ${onlineCount} 名玩家，至少需要 3 人才能开局。\n是否立即自动添加电脑玩家并开始游戏？`)) {
        socket.emit('start_game', { autoFill: true }, (res) => {
          if (res && !res.success) {
            alert(res.message || '无法开始游戏');
          }
        });
      }
      return;
    }

    socket.emit('start_game', {}, (res) => {
      if (res && !res.success) {
        alert(res.message || '无法开始游戏');
      }
    });
  });

  // 渲染查看卡片
  function renderCardView(room, me, isHost, isPhaseChanged) {
    const cardEl = document.getElementById('secret-card-element');
    const wordEl = document.getElementById('my-secret-word');
    
    if (me && me.word) {
      wordEl.innerText = me.word;
    } else {
      wordEl.innerText = '请等待分发...';
    }

    // 只有在刚切入看词阶段时才重置卡片翻转状态，避免别人看词更新时自己的卡片被自动盖上
    if (isPhaseChanged) {
      cardEl.classList.remove('flipped');
    }

    // 统计已查看人数
    const viewedCount = room.players.filter(p => p.hasViewedCard).length;
    document.getElementById('viewed-count').innerText = viewedCount;
    document.getElementById('total-view-count').innerText = room.players.length;

    const confirmBtn = document.getElementById('btn-card-confirm');
    if (me && me.hasViewedCard) {
      confirmBtn.disabled = true;
      confirmBtn.innerText = '✅ 已准备完毕，等待其他人...';
    } else {
      confirmBtn.disabled = false;
      confirmBtn.innerText = '✅ 我已经记住了，准备发言';
    }

    const hostCardControls = document.getElementById('host-card-controls');
    if (hostCardControls) {
      if (isHost) {
        hostCardControls.classList.remove('hidden');
      } else {
        hostCardControls.classList.add('hidden');
      }
    }
  }

  // ----------------------------------------------------
  // 看牌防窥模式控制 (按住防窥 / 点击常开)
  // ----------------------------------------------------
  let peekMode = localStorage.getItem('undercover_peek_mode') || 'hold';
  const btnModeHold = document.getElementById('btn-mode-hold');
  const btnModeToggle = document.getElementById('btn-mode-toggle');
  const cardFlipPrompt = document.getElementById('card-flip-prompt');
  const cardHidePrompt = document.getElementById('card-hide-prompt');
  const cardElement = document.getElementById('secret-card-element');
  let isHoldingCard = false;

  function updatePeekModeUI() {
    if (peekMode === 'hold') {
      if (btnModeHold) btnModeHold.classList.add('active');
      if (btnModeToggle) btnModeToggle.classList.remove('active');
      if (cardFlipPrompt) cardFlipPrompt.innerText = '👆 按住卡片查看底牌 (松手即盖上)';
      if (cardHidePrompt) cardHidePrompt.innerText = '🙈 松开手指立即隐藏';
    } else {
      if (btnModeToggle) btnModeToggle.classList.add('active');
      if (btnModeHold) btnModeHold.classList.remove('active');
      if (cardFlipPrompt) cardFlipPrompt.innerText = '👉 点击卡片翻开底牌 👈';
      if (cardHidePrompt) cardHidePrompt.innerText = '🙈 点击卡片立即盖上';
    }
  }

  if (btnModeHold) {
    btnModeHold.addEventListener('click', () => {
      window.sfx.playClick();
      peekMode = 'hold';
      localStorage.setItem('undercover_peek_mode', 'hold');
      updatePeekModeUI();
      if (cardElement) cardElement.classList.remove('flipped');
    });
  }

  if (btnModeToggle) {
    btnModeToggle.addEventListener('click', () => {
      window.sfx.playClick();
      peekMode = 'toggle';
      localStorage.setItem('undercover_peek_mode', 'toggle');
      updatePeekModeUI();
    });
  }

  updatePeekModeUI();

  function revealCard() {
    if (cardElement && !cardElement.classList.contains('flipped')) {
      cardElement.classList.add('flipped');
      window.sfx.playFlip();
      window.sfx.vibrate('light');
    }
  }

  function concealCard() {
    if (cardElement && cardElement.classList.contains('flipped')) {
      cardElement.classList.remove('flipped');
      window.sfx.playFlip();
    }
  }

  if (cardElement) {
    // 触摸事件 (移动端防窥按住)
    cardElement.addEventListener('touchstart', (e) => {
      if (peekMode === 'hold') {
        e.preventDefault();
        isHoldingCard = true;
        revealCard();
      }
    }, { passive: false });

    const handleTouchEnd = () => {
      if (peekMode === 'hold' && isHoldingCard) {
        isHoldingCard = false;
        concealCard();
      }
    };
    cardElement.addEventListener('touchend', handleTouchEnd);
    cardElement.addEventListener('touchcancel', handleTouchEnd);

    // 鼠标事件 (桌面端防窥按住)
    cardElement.addEventListener('mousedown', (e) => {
      if (e.button === 0 && peekMode === 'hold') {
        isHoldingCard = true;
        revealCard();
      }
    });

    const handleMouseUp = () => {
      if (peekMode === 'hold' && isHoldingCard) {
        isHoldingCard = false;
        concealCard();
      }
    };
    window.addEventListener('mouseup', handleMouseUp);
    cardElement.addEventListener('mouseleave', () => {
      if (peekMode === 'hold' && isHoldingCard) {
        isHoldingCard = false;
        concealCard();
      }
    });

    // 点击事件 (常开模式翻转)
    cardElement.addEventListener('click', () => {
      if (peekMode === 'toggle') {
        cardElement.classList.toggle('flipped');
        window.sfx.playFlip();
        window.sfx.vibrate('light');
      }
    });

    // 禁用默认右键菜单防止长按弹出菜单
    cardElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // 确认查看词语
  document.getElementById('btn-card-confirm').addEventListener('click', () => {
    window.sfx.playClick();
    const confirmBtn = document.getElementById('btn-card-confirm');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerText = '✅ 已准备完毕，等待其他人...';
    }
    socket.emit('view_card_confirm', {
      roomCode: currentRoom ? currentRoom.code : null,
      playerId: myPlayerId
    });
  });

  // 房主强制开始发言
  document.getElementById('btn-force-start-speaking').addEventListener('click', () => {
    window.sfx.playClick();
    socket.emit('force_start_speaking', {
      roomCode: currentRoom ? currentRoom.code : null,
      playerId: myPlayerId
    });
  });

  // 房主重新发牌 / 换一组词 (仅看牌阶段有效)
  const btnRedealCards = document.getElementById('btn-redeal-cards');
  if (btnRedealCards) {
    btnRedealCards.addEventListener('click', () => {
      if (confirm('确定要重新发牌吗？将换一组全新词语，并重新随机分配全员身份！')) {
        window.sfx.playClick();
        socket.emit('redeal_cards', {
          roomCode: currentRoom ? currentRoom.code : null,
          playerId: myPlayerId
        });
      }
    });
  }

  // 房主重新发牌事件广播响应 (全员卡片回正盖上，重置看牌状态)
  socket.on('cards_redealt', (data) => {
    const cardEl = document.getElementById('secret-card-element');
    if (cardEl) {
      cardEl.classList.remove('flipped');
    }
    const confirmBtn = document.getElementById('btn-card-confirm');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerText = '✅ 我已经记住了，准备发言';
    }
    window.sfx.playDeal();
    if (data && data.message) {
      window.sfx.speak(data.message);
    }
  });

  // 渲染发言阶段
  function renderSpeaking(room, me, isHost) {
    document.getElementById('speaking-round-num').innerText = room.gameState.round;
    const currentSpeakerId = room.gameState.currentSpeakerId;
    const currentSpeaker = room.players.find(p => p.id === currentSpeakerId);
    const isMeSpeaking = currentSpeakerId === myPlayerId;

    const speakerBox = document.getElementById('current-speaker-box');
    const speakerAvatar = document.getElementById('current-speaker-avatar');
    const speakerName = document.getElementById('current-speaker-name');
    const tipText = document.getElementById('speaker-tip-text');

    if (currentSpeaker) {
      speakerAvatar.innerText = currentSpeaker.avatar;
      speakerName.innerText = currentSpeaker.name + (isMeSpeaking ? ' (轮到你发言啦！)' : '');
      if (isMeSpeaking) {
        speakerBox.classList.add('is-me');
        tipText.innerText = '🎯 请用一句话描述你的词语，不能直接说出词汇哦！';
      } else {
        speakerBox.classList.remove('is-me');
        tipText.innerText = `正在认真听 ${currentSpeaker.name} 发言...`;
      }

      if (lastAnnouncedSpeakerId !== currentSpeakerId) {
        lastAnnouncedSpeakerId = currentSpeakerId;
        if (isMeSpeaking) {
          window.sfx.speak('轮到你发言了，请描述你的词语');
          window.sfx.vibrate('turn');
        } else {
          window.sfx.speak(`请 ${currentSpeaker.name} 发言`);
        }
      }
    }

    // 轮到自己发言时显示打字描述输入框
    const clueContainer = document.getElementById('my-speech-input-container');
    if (clueContainer) {
      if (isMeSpeaking) {
        clueContainer.classList.remove('hidden');
      } else {
        clueContainer.classList.add('hidden');
      }
    }

    // 发言顺序列表
    const orderGrid = document.getElementById('speaking-order-grid');
    orderGrid.innerHTML = '';
    room.gameState.speakingOrder.forEach((pid, idx) => {
      const p = room.players.find(item => item.id === pid);
      if (!p) return;
      const isCurrent = idx === room.gameState.currentSpeakerIndex;
      const isPast = idx < room.gameState.currentSpeakerIndex;

      const box = document.createElement('div');
      box.className = `player-box ${isCurrent ? 'is-host' : ''} ${isPast ? 'is-dead' : ''}`;
      box.style.borderWidth = isCurrent ? '2px' : '1px';
      box.innerHTML = `
        <div style="position: absolute; top: 4px; left: 6px; font-size: 11px; font-weight: 800; color: ${isCurrent ? '#a855f7' : '#94a3b8'};">
          #${idx + 1}
        </div>
        <div class="player-avatar">${p.avatar}</div>
        <div class="player-name">${p.name}</div>
        <div style="font-size: 11px; color: ${isCurrent ? '#38bdf8' : (isPast ? '#64748b' : '#94a3b8')}; margin-top: 2px;">
          ${isCurrent ? '🎙️ 正在发言' : (isPast ? '✅ 已描述' : '⏳ 等待中')}
        </div>
      `;
      orderGrid.appendChild(box);
    });

    // 倒计时管理
    startCountdownTimer(room.settings.speechTimeLimit, room.gameState.speechStartTime);

    // 下一位发言按钮控制
    const finishBtn = document.getElementById('btn-finish-speaking');
    if (isMeSpeaking || isHost) {
      finishBtn.disabled = false;
      finishBtn.classList.remove('hidden');
      finishBtn.innerText = isMeSpeaking ? '🎤 我已描述完毕 (交给下一位)' : '⏭️ 房主跳过此人发言';
    } else {
      finishBtn.disabled = true;
      finishBtn.classList.add('hidden');
    }

    // 房主全员推进控制 (直接进入投票)
    const hostSpeakingControls = document.getElementById('host-speaking-controls');
    if (hostSpeakingControls) {
      if (isHost) {
        hostSpeakingControls.classList.remove('hidden');
      } else {
        hostSpeakingControls.classList.add('hidden');
      }
    }
  }

  // 倒计时函数
  function startCountdownTimer(timeLimit, startTime) {
    if (currentTimerStartTime === startTime && speechTimerInterval) {
      return; // 倒计时已经在运行，不重复重置定时器
    }
    currentTimerStartTime = startTime;
    if (speechTimerInterval) clearInterval(speechTimerInterval);
    const timerText = document.getElementById('speaker-timer-text');
    
    if (!timeLimit || timeLimit <= 0) {
      timerText.innerText = '不限时';
      return;
    }

    function update() {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, timeLimit - elapsed);
      timerText.innerText = `${remaining}s`;

      if (remaining <= 5 && remaining > 0) {
        timerText.style.color = '#ef4444';
        window.sfx.playTick();
      } else {
        timerText.style.color = '#f59e0b';
      }

      if (remaining <= 0) {
        clearInterval(speechTimerInterval);
        timerText.innerText = '时间到!';
      }
    }

    update();
    speechTimerInterval = setInterval(update, 1000);
  }

  // 发送打字描述词语 (发送即代表描述完毕，自动切到下一位，无需二次点击)
  function handleSendClueText() {
    const input = document.getElementById('input-speech-clue');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    window.sfx.playClick();
    socket.emit('send_clue', text);
    input.value = '';
    socket.emit('finish_speaking', {
      roomCode: currentRoom ? currentRoom.code : null,
      playerId: myPlayerId
    });
  }

  const btnSendClue = document.getElementById('btn-send-speech-clue');
  if (btnSendClue) {
    btnSendClue.addEventListener('click', handleSendClueText);
  }
  const inputClue = document.getElementById('input-speech-clue');
  if (inputClue) {
    inputClue.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSendClueText();
    });
  }

  // 监听发言线索
  socket.on('speaker_clue', (data) => {
    window.sfx.playPop();
    const tipText = document.getElementById('speaker-tip-text');
    if (tipText) {
      tipText.innerHTML = `💬 <b style="color: #38bdf8;">${escapeHtml(data.playerName)}</b>：“${escapeHtml(data.clue)}”`;
    }
    const pkTipText = document.getElementById('pk-speaker-tip-text');
    if (pkTipText) {
      pkTipText.innerHTML = `💬 <b style="color: #38bdf8;">${escapeHtml(data.playerName)}</b>：“${escapeHtml(data.clue)}”`;
    }
    
    // 立即追加到公屏记录（不需要等下一个 room_update）
    const publicScreenLogs = document.getElementById('public-screen-logs');
    if (publicScreenLogs) {
      const emptyMsg = document.getElementById('public-screen-empty');
      if (emptyMsg) emptyMsg.remove();
      
      const isPk = currentRoom && currentRoom.gameState && currentRoom.gameState.phase.startsWith('PK');
      const round = currentRoom && currentRoom.gameState ? currentRoom.gameState.round : 1;
      const prefix = isPk ? `<span style="color: #ef4444;">[PK发言]</span>` : `<span style="color: #a855f7;">[第${round}轮]</span>`;
      
      const newLog = document.createElement('div');
      newLog.style = "padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.1);";
      newLog.innerHTML = `${prefix} <b style="color: #38bdf8;">${escapeHtml(data.playerName)}</b>: ${escapeHtml(data.clue)}`;
      
      // 如果本来显示的是“暂无记录”，先清空
      if (publicScreenLogs.innerHTML.includes('暂无描述记录')) {
        publicScreenLogs.innerHTML = '';
      }
      publicScreenLogs.appendChild(newLog);

      const count = publicScreenLogs.children.length;
      const badge = document.getElementById('public-screen-badge');
      if (badge) {
        badge.innerText = `${count}条`;
        badge.classList.remove('badge-pulse');
        void badge.offsetWidth;
        badge.classList.add('badge-pulse');
      }
      const summary = document.getElementById('public-screen-summary');
      if (summary) {
        summary.innerText = `${data.playerName}: ${data.clue}`;
      }

      setTimeout(() => {
        publicScreenLogs.scrollTop = publicScreenLogs.scrollHeight;
      }, 50);
    }
    
    window.sfx.speak(`${data.playerName}发言说：“${data.clue}”`);
  });

  // 结束发言点击
  document.getElementById('btn-finish-speaking').addEventListener('click', () => {
    window.sfx.playClick();
    const clueInput = document.getElementById('input-speech-clue');
    if (clueInput && clueInput.value.trim()) {
      socket.emit('send_clue', clueInput.value.trim());
      clueInput.value = '';
    }
    socket.emit('finish_speaking', {
      roomCode: currentRoom ? currentRoom.code : null,
      playerId: myPlayerId
    });
  });

  // 房主提前结束全员发言，直接进入投票
  const forceStartVotingBtn = document.getElementById('btn-force-start-voting');
  if (forceStartVotingBtn) {
    forceStartVotingBtn.addEventListener('click', () => {
      if (confirm('确定要提前结束全员发言，直接进入投票阶段吗？')) {
        window.sfx.playClick();
        socket.emit('force_start_voting', {
          roomCode: currentRoom ? currentRoom.code : null,
          playerId: myPlayerId
        });
      }
    });
  }

  // 渲染 PK 发言
  function renderPKSpeaking(room, me, isHost) {
    const currentSpeakerId = room.gameState.pkSpeakerId;
    const currentSpeaker = room.players.find(p => p.id === currentSpeakerId);
    const isMe = currentSpeakerId === myPlayerId;

    const speakerBox = document.getElementById('pk-speaker-box');
    const speakerAvatar = document.getElementById('pk-speaker-avatar');
    const speakerName = document.getElementById('pk-speaker-name');
    const tipText = document.getElementById('pk-speaker-tip-text');

    if (speakerAvatar) speakerAvatar.innerText = currentSpeaker ? currentSpeaker.avatar : '🔥';
    if (speakerName) speakerName.innerText = (currentSpeaker ? currentSpeaker.name : '候选人') + (isMe ? ' (轮到你辩解！)' : '');

    if (speakerBox) {
      if (isMe) {
        speakerBox.classList.add('is-me');
      } else {
        speakerBox.classList.remove('is-me');
      }
    }

    if (tipText) {
      if (isMe) {
        tipText.innerText = '🛡️ 请输入辩解发言，表明你的身份并争取大家的信任！';
      } else {
        tipText.innerText = `正在认真听 ${currentSpeaker ? currentSpeaker.name : '候选人'} 进行辩解发言...`;
      }
    }

    // 语音与震动提醒轮到辩解
    if (lastAnnouncedSpeakerId !== ('pk_' + currentSpeakerId)) {
      lastAnnouncedSpeakerId = 'pk_' + currentSpeakerId;
      if (isMe) {
        window.sfx.speak('轮到你辩解发言了，请表明你的身份');
        window.sfx.vibrate('turn');
      } else if (currentSpeaker) {
        window.sfx.speak(`请 ${currentSpeaker.name} 进行辩解发言`);
      }
    }

    // 轮到自己辩解时显示打字输入框并自动聚焦
    const pkClueContainer = document.getElementById('my-pk-speech-input-container');
    const pkInput = document.getElementById('input-pk-speech-clue');
    if (pkClueContainer) {
      if (isMe) {
        pkClueContainer.classList.remove('hidden');
        if (pkInput && document.activeElement !== pkInput) {
          setTimeout(() => pkInput.focus(), 80);
        }
      } else {
        pkClueContainer.classList.add('hidden');
      }
    }

    // 辩解发言倒计时 (根据配置或默认45s)
    const pkTimeLimit = Math.min(room.settings.speechTimeLimit || 45, 60);
    startPkCountdownTimer(pkTimeLimit, room.gameState.speechStartTime);

    const finishBtn = document.getElementById('btn-finish-pk-speaking');
    if (finishBtn) {
      if (isMe || isHost) {
        finishBtn.disabled = false;
        finishBtn.classList.remove('hidden');
        finishBtn.innerText = isMe ? '🎤 辩解完毕 / 下一位' : '⏭️ 房主跳过此人辩解';
      } else {
        finishBtn.disabled = true;
        finishBtn.classList.add('hidden');
      }
    }

    const hostPkControls = document.getElementById('host-pk-controls');
    if (hostPkControls) {
      if (isHost) {
        hostPkControls.classList.remove('hidden');
      } else {
        hostPkControls.classList.add('hidden');
      }
    }
  }

  // PK 倒计时函数
  function startPkCountdownTimer(timeLimit, startTime) {
    if (currentPkTimerStartTime === startTime && pkTimerInterval) {
      return;
    }
    currentPkTimerStartTime = startTime;
    if (pkTimerInterval) clearInterval(pkTimerInterval);
    const timerText = document.getElementById('pk-speaker-timer-text');
    if (!timerText) return;

    if (!timeLimit || timeLimit <= 0 || !startTime) {
      timerText.innerText = '辩解中';
      return;
    }

    function update() {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, timeLimit - elapsed);
      timerText.innerText = `${remaining}s`;

      if (remaining <= 5 && remaining > 0) {
        timerText.style.color = '#ef4444';
        window.sfx.playTick();
        if (currentRoom && currentRoom.gameState && currentRoom.gameState.pkSpeakerId === myPlayerId) {
          window.sfx.vibrate('urgent');
        }
      } else {
        timerText.style.color = '#f59e0b';
      }

      if (remaining <= 0) {
        clearInterval(pkTimerInterval);
        timerText.innerText = '时间到!';
      }
    }

    update();
    pkTimerInterval = setInterval(update, 1000);
  }

  // 发送打字辩解发言 (发送即代表辩解完毕，自动切到下一位，无需二次点击)
  function handleSendPkClueText() {
    const input = document.getElementById('input-pk-speech-clue');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    window.sfx.playClick();
    socket.emit('send_clue', text);
    input.value = '';
    socket.emit('finish_speaking', {
      roomCode: currentRoom ? currentRoom.code : null,
      playerId: myPlayerId
    });
  }

  const btnSendPkClue = document.getElementById('btn-send-pk-speech-clue');
  if (btnSendPkClue) {
    btnSendPkClue.addEventListener('click', handleSendPkClueText);
  }
  const inputPkClue = document.getElementById('input-pk-speech-clue');
  if (inputPkClue) {
    inputPkClue.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSendPkClueText();
    });
  }

  document.getElementById('btn-finish-pk-speaking').addEventListener('click', () => {
    window.sfx.playClick();
    const pkInput = document.getElementById('input-pk-speech-clue');
    if (pkInput && pkInput.value.trim()) {
      socket.emit('send_clue', pkInput.value.trim());
      pkInput.value = '';
    }
    socket.emit('finish_speaking', {
      roomCode: currentRoom ? currentRoom.code : null,
      playerId: myPlayerId
    });
  });

  // 房主提前结束辩解，直接进入 PK 投票
  const forcePkVotingBtn = document.getElementById('btn-force-pk-voting');
  if (forcePkVotingBtn) {
    forcePkVotingBtn.addEventListener('click', () => {
      if (confirm('确定要提前结束辩解，直接进入 PK 投票吗？')) {
        window.sfx.playClick();
        socket.emit('force_start_voting', {
          roomCode: currentRoom ? currentRoom.code : null,
          playerId: myPlayerId
        });
      }
    });
  }

  // 渲染投票阶段 (支持正常投票与 PK 投票)
  function renderVoting(room, me, isPK, isHost) {
    const grid = document.getElementById('voting-grid');
    grid.innerHTML = '';

    const submitBtn = document.getElementById('btn-submit-vote');

    const stageTitle = document.getElementById('voting-stage-title');
    if (stageTitle) {
      stageTitle.innerText = isPK ? '🔥 平票 PK 再次对决' : '🗳️ 全员投票环节';
    }

    startVotingCountdownTimer(room.gameState.voteTimeLimit || 60, room.gameState.voteStartTime);

    // 筛选出可以被投票的候选人
    let candidates = room.players.filter(p => p.isAlive);
    if (isPK) {
      candidates = candidates.filter(p => room.gameState.pkCandidates.includes(p.id));
    }

    // 校验已选目标是否仍在候选人中
    if (selectedVoteTargetId && !candidates.some(c => c.id === selectedVoteTargetId)) {
      selectedVoteTargetId = null;
    }

    // 统计已投票数
    const alivePlayers = room.players.filter(p => p.isAlive);
    const votedCount = alivePlayers.filter(p => p.hasVoted).length;
    document.getElementById('voted-count').innerText = votedCount;
    document.getElementById('total-vote-count').innerText = alivePlayers.length;

    // 获取当前选定目标（无论来自已提交还是本地待提交选中）
    const effectiveSelectedId = (me && me.voteTarget) ? me.voteTarget : selectedVoteTargetId;

    const isPkCandidate = isPK && room.gameState.pkCandidates && room.gameState.pkCandidates.includes(myPlayerId);

    candidates.forEach(p => {
      const card = document.createElement('div');
      const isSelected = effectiveSelectedId === p.id;
      card.className = `vote-card ${isSelected ? 'selected' : ''}`;
      
      card.innerHTML = `
        <div style="font-size: 36px; margin-bottom: 6px;">${p.avatar}</div>
        <div style="font-size: 15px; font-weight: 700; color: white;">${escapeHtml(p.name)}${p.id === myPlayerId ? ' (自己)' : ''}</div>
        <div class="vote-select-pill">
          ${isSelected ? '🎯 [已选定] 投TA出局' : '⚪ 点击怀疑TA'}
        </div>
      `;

      if (me && me.isAlive && !me.hasVoted && !isPkCandidate) {
        card.addEventListener('click', () => {
          document.querySelectorAll('.vote-card').forEach(el => {
            el.classList.remove('selected');
            const sub = el.querySelector('.vote-select-pill');
            if (sub) sub.innerText = '⚪ 点击怀疑TA';
          });
          card.classList.add('selected');
          const sub = card.querySelector('.vote-select-pill');
          if (sub) sub.innerText = '🎯 [已选定] 投TA出局';

          selectedVoteTargetId = p.id;
          submitBtn.disabled = false;
          submitBtn.innerText = `🔥 确认投票给【${p.name}】`;
          window.sfx.playClick();
        });
      }

      grid.appendChild(card);
    });

    const forceResolveBtn = document.getElementById('btn-force-resolve-votes');
    if (forceResolveBtn) {
      if (isHost && votedCount > 0) {
        forceResolveBtn.classList.remove('hidden');
      } else {
        forceResolveBtn.classList.add('hidden');
      }
    }

    const currentSelectedPlayer = room.players.find(p => p.id === selectedVoteTargetId);
    if (isPkCandidate) {
      submitBtn.disabled = true;
      submitBtn.innerText = '⚖️ 您处于 PK 辩护席，由其他未平票玩家裁决';
    } else if (me && me.hasVoted) {
      submitBtn.disabled = true;
      submitBtn.innerText = '✅ 已完成投票，等待全员投票...';
    } else if (me && !me.isAlive) {
      submitBtn.disabled = true;
      submitBtn.innerText = '👻 您已出局，观战中...';
    } else {
      submitBtn.disabled = !selectedVoteTargetId;
      submitBtn.innerText = selectedVoteTargetId 
        ? `🔥 确认投票给【${currentSelectedPlayer ? currentSelectedPlayer.name : ''}】` 
        : '👆 请先在上方点击选择怀疑对象';
    }
  }

  // 投票倒计时管理函数
  function startVotingCountdownTimer(timeLimit, startTime) {
    if (currentVotingStartTime === startTime && votingTimerInterval) {
      return;
    }
    currentVotingStartTime = startTime;
    if (votingTimerInterval) clearInterval(votingTimerInterval);
    const timerText = document.getElementById('voting-timer-text');
    if (!timerText) return;

    if (!timeLimit || timeLimit <= 0 || !startTime) {
      timerText.innerText = '投票中';
      return;
    }

    function update() {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, timeLimit - elapsed);
      timerText.innerText = `${remaining}s`;

      if (remaining <= 5 && remaining > 0) {
        timerText.style.color = '#ef4444';
        window.sfx.playTick();
        if (currentRoom && currentRoom.myPlayer && !currentRoom.myPlayer.hasVoted && currentRoom.myPlayer.isAlive) {
          window.sfx.vibrate('urgent');
        }
      } else {
        timerText.style.color = '#f59e0b';
      }

      if (remaining <= 0) {
        clearInterval(votingTimerInterval);
        timerText.innerText = '结算中...';
      }
    }

    update();
    votingTimerInterval = setInterval(update, 1000);
  }

  // 提交投票
  document.getElementById('btn-submit-vote').addEventListener('click', () => {
    if (!selectedVoteTargetId) return;
    window.sfx.playVote();
    socket.emit('cast_vote', {
      targetId: selectedVoteTargetId,
      roomCode: currentRoom ? currentRoom.code : null,
      playerId: myPlayerId
    });
  });

  // 房主强制提前结算投票 (跳过离线未投)
  const forceResolveBtn = document.getElementById('btn-force-resolve-votes');
  if (forceResolveBtn) {
    forceResolveBtn.addEventListener('click', () => {
      if (confirm('确定要提前结算当前投票吗？未投票或离线的玩家将被视为弃票。')) {
        window.sfx.playClick();
        socket.emit('force_resolve_votes', {
          roomCode: currentRoom ? currentRoom.code : null,
          playerId: myPlayerId
        });
      }
    });
  }

  // 渲染绝地猜词阶段
  let currentGuessStartTime = null;
  let guessTimerInterval = null;

  function renderGuessWord(room, me, isHost) {
    const target = room.gameState.guessTarget;
    if (!target) return;

    const isMe = me && me.id === target.id;
    const myGuessContainer = document.getElementById('my-guess-container');
    const otherGuessWaiting = document.getElementById('other-guess-waiting');
    const guessTitle = document.getElementById('guess-title');
    const guessSubtitle = document.getElementById('guess-subtitle');
    const otherGuessText = document.getElementById('other-guess-text');

    startGuessCountdownTimer(target.timeLimit || 30, target.startTime);

    if (isMe) {
      if (guessTitle) guessTitle.innerText = '🔥 你的绝地反杀机会！';
      if (guessSubtitle) guessSubtitle.innerText = '请输入你猜测的平民底牌词，猜中直接逆风翻盘获胜！';
      if (myGuessContainer) myGuessContainer.classList.remove('hidden');
      if (otherGuessWaiting) otherGuessWaiting.classList.add('hidden');
      const input = document.getElementById('input-guess-word');
      if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 100);
      }
    } else {
      if (guessTitle) guessTitle.innerText = '🔥 绝地猜词进行中...';
      if (guessSubtitle) guessSubtitle.innerText = '被淘汰玩家正在进行最后的绝地猜词...';
      if (myGuessContainer) myGuessContainer.classList.add('hidden');
      if (otherGuessWaiting) otherGuessWaiting.classList.remove('hidden');
      if (otherGuessText) otherGuessText.innerText = `${target.name} 正在尝试猜平民底牌词...`;
    }

    // 房主跳过猜词控制按钮显隐
    const hostGuessControls = document.getElementById('host-guess-controls');
    if (hostGuessControls) {
      if (isHost) {
        hostGuessControls.classList.remove('hidden');
      } else {
        hostGuessControls.classList.add('hidden');
      }
    }
  }

  function startGuessCountdownTimer(timeLimit, startTime) {
    if (currentGuessStartTime === startTime && guessTimerInterval) return;
    currentGuessStartTime = startTime;
    if (guessTimerInterval) clearInterval(guessTimerInterval);
    const timerText = document.getElementById('guess-timer-text');
    if (!timerText) return;

    function update() {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, timeLimit - elapsed);
      timerText.innerText = `${remaining}s`;

      if (remaining <= 5 && remaining > 0) {
        timerText.style.color = '#ef4444';
        window.sfx.playTick();
      } else {
        timerText.style.color = '#f59e0b';
      }

      if (remaining <= 0) {
        clearInterval(guessTimerInterval);
        timerText.innerText = '时间到!';
      }
    }

    update();
    guessTimerInterval = setInterval(update, 1000);
  }

  // 提交猜词事件绑定
  function handleGuessWordSubmit() {
    const input = document.getElementById('input-guess-word');
    if (!input) return;
    const word = input.value.trim();
    if (!word) return alert('请输入你猜测的平民词');
    window.sfx.playClick();
    socket.emit('submit_guess_word', {
      roomCode: currentRoom ? currentRoom.code : null,
      playerId: myPlayerId,
      word
    }, (res) => {
      if (res && !res.success) {
        alert(res.message || '猜词错误！');
      }
    });
  }

  const btnSubmitGuess = document.getElementById('btn-submit-guess');
  if (btnSubmitGuess) {
    btnSubmitGuess.addEventListener('click', handleGuessWordSubmit);
  }
  const inputGuess = document.getElementById('input-guess-word');
  if (inputGuess) {
    inputGuess.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleGuessWordSubmit();
    });
  }

  const btnSkipGuess = document.getElementById('btn-skip-guess');
  if (btnSkipGuess) {
    btnSkipGuess.addEventListener('click', () => {
      window.sfx.playClick();
      socket.emit('submit_guess_word', {
        roomCode: currentRoom ? currentRoom.code : null,
        playerId: myPlayerId,
        word: ''
      });
    });
  }

  // 房主强制跳过猜词
  const forceSkipGuessBtn = document.getElementById('btn-force-skip-guess');
  if (forceSkipGuessBtn) {
    forceSkipGuessBtn.addEventListener('click', () => {
      if (confirm('确定要跳过猜词环节吗？该玩家将被判定为放弃猜词并立即淘汰。')) {
        window.sfx.playClick();
        socket.emit('force_skip_guess', {
          roomCode: currentRoom ? currentRoom.code : null,
          playerId: myPlayerId
        });
      }
    });
  }

  // 渲染淘汰揭晓阶段
  function renderElimination(room, isHost) {
    window.sfx.playElimination();
    const container = document.getElementById('eliminated-container');
    const elim = room.gameState.eliminatedPlayer || room.gameState.lastEliminated;

    if (elim && (elim.isTieNoElimination || elim.isTie)) {
      container.innerHTML = `
        <div style="font-size: 56px; margin-bottom: 12px;">⚖️</div>
        <div style="font-size: 22px; font-weight: 800; color: #f59e0b; margin-bottom: 8px;">PK 依然平票！</div>
        <p style="color: var(--text-muted); font-size: 14px;">${escapeHtml(elim.message || '本轮无人被淘汰，游戏继续进行！')}</p>
      `;
      window.sfx.speak(elim.message || '平票，本轮无人出局');
    } else if (elim) {
      const roleMap = {
        CIVILIAN: '<span class="role-tag CIVILIAN">平民</span>',
        UNDERCOVER: '<span class="role-tag UNDERCOVER">卧底 🕵️</span>',
        WHITEBOARD: '<span class="role-tag WHITEBOARD">白板 📄</span>'
      };
      const votesText = (typeof elim.votes === 'number' && elim.votes > 0) ? `获得 ${elim.votes} 票` : '';
      const isSecretMode = (room.settings.revealRoleOnEliminate === false) || elim.isSecret;

      if (isSecretMode) {
        container.innerHTML = `
          <div style="font-size: 56px; margin-bottom: 8px;">${elim.avatar}</div>
          <div style="font-size: 22px; font-weight: 800; margin-bottom: 8px;">${escapeHtml(elim.name)} 被投出局！</div>
          ${votesText ? `<div style="font-size: 14px; margin-bottom: 12px; color: #fca5a5;">${votesText}</div>` : ''}
          <div style="margin-top: 10px; display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: rgba(168,85,247,0.15); border: 1px dashed rgba(168,85,247,0.4); border-radius: 999px; font-size: 14px; color: #d8b4fe; font-weight: 700;">
            🎭 暗牌模式：真实身份保密
          </div>
        `;
        window.sfx.speak(`${elim.name} 被投出局，暗牌模式下身份保密`);
      } else {
        container.innerHTML = `
          <div style="font-size: 56px; margin-bottom: 8px;">${elim.avatar}</div>
          <div style="font-size: 22px; font-weight: 800; margin-bottom: 8px;">${escapeHtml(elim.name)} 被投出局！</div>
          ${votesText ? `<div style="font-size: 14px; margin-bottom: 12px; color: #fca5a5;">${votesText}</div>` : ''}
          <div style="font-size: 16px;">真实的身份是：${roleMap[elim.role] || elim.role}</div>
        `;
        const roleCn = elim.role === 'UNDERCOVER' ? '卧底' : (elim.role === 'WHITEBOARD' ? '白板' : '平民');
        window.sfx.speak(`${elim.name} 被投出局，真实身份是 ${roleCn}`);
      }

      if (elim.id === myPlayerId) {
        window.sfx.vibrate('eliminated');
      }
    }

    const hostNextBtn = document.getElementById('host-next-round-btn');
    const guestMsg = document.getElementById('guest-next-round-msg');

    if (isHost) {
      hostNextBtn.classList.remove('hidden');
      guestMsg.classList.add('hidden');
    } else {
      hostNextBtn.classList.add('hidden');
      guestMsg.classList.remove('hidden');
      if (guestMsg) guestMsg.innerText = '⏳ 4 秒后自动进入下一轮...';
    }
  }

  // 房主点击进入下一轮
  document.getElementById('btn-next-round').addEventListener('click', () => {
    window.sfx.playClick();
    socket.emit('next_round', {
      roomCode: currentRoom ? currentRoom.code : null,
      playerId: myPlayerId
    });
  });

  // 渲染游戏结束与胜负结算
  function renderGameOver(room, isHost, isPhaseChanged) {
    if (isPhaseChanged) {
      window.sfx.playVictory();
      triggerConfetti();
      const myRole = room.myPlayer ? room.myPlayer.role : null;
      const isWinner = myRole && (myRole === room.gameState.winner || (myRole === 'CIVILIAN' && room.gameState.winner === 'CIVILIAN'));
      if (isWinner) {
        window.sfx.vibrate('win');
      }
    }

    const winner = room.gameState.winner;
    const titleEl = document.getElementById('victory-title');
    const descEl = document.getElementById('victory-desc');
    const iconEl = document.getElementById('victory-icon');

    if (winner === 'CIVILIAN') {
      iconEl.innerText = '🏆';
      titleEl.innerText = '平民大获全胜！';
      titleEl.className = 'victory-title civilians';
      descEl.innerText = '火眼金睛，成功揪出所有卧底与白板！';
      if (isPhaseChanged) window.sfx.speak('游戏结束，平民大获全胜！');
    } else if (winner === 'WHITEBOARD') {
      iconEl.innerText = '🤍';
      titleEl.innerText = '白板大获全胜！';
      titleEl.className = 'victory-title whiteboards';
      descEl.innerText = '零词伪装瞒天过海，成功潜伏苟活到最后！';
      if (isPhaseChanged) window.sfx.speak('游戏结束，白板瞒天过海取得胜利！');
    } else {
      iconEl.innerText = '🎭';
      titleEl.innerText = '卧底胜利！';
      titleEl.className = 'victory-title undercovers';
      descEl.innerText = '演技炸裂，卧底成功潜伏到最后，取得胜利！';
      if (isPhaseChanged) window.sfx.speak('游戏结束，卧底瞒天过海取得胜利！');
    }

    // 绝地反杀大横幅展示
    const reversalBanner = document.getElementById('reversal-banner');
    if (reversalBanner) {
      if (room.gameState.guessResult && room.gameState.guessResult.success) {
        reversalBanner.classList.remove('hidden');
        const revName = document.getElementById('reversal-player-name');
        const revWord = document.getElementById('reversal-word');
        if (revName) revName.innerText = room.gameState.guessResult.playerName || '玩家';
        if (revWord) revWord.innerText = room.gameState.guessResult.winningWord || '';
      } else {
        reversalBanner.classList.add('hidden');
      }
    }

    // 渲染全员词语真实底牌
    const tbody = document.getElementById('game-over-players-tbody');
    tbody.innerHTML = '';
    room.players.forEach(p => {
      const tr = document.createElement('tr');
      const roleMap = {
        CIVILIAN: '<span class="role-tag CIVILIAN">平民</span>',
        UNDERCOVER: '<span class="role-tag UNDERCOVER">卧底</span>',
        WHITEBOARD: '<span class="role-tag WHITEBOARD">白板</span>'
      };
      tr.innerHTML = `
        <td><span style="font-size: 18px; margin-right: 4px;">${p.avatar}</span>${escapeHtml(p.name)}</td>
        <td>${roleMap[p.role] || p.role}</td>
        <td style="font-weight: 700; color: #67e8f9;">${escapeHtml(p.word || '-')}</td>
      `;
      tbody.appendChild(tr);
    });

    // 惩罚卡
    const punishContainer = document.getElementById('punishment-card-container');
    const hasPunishment = room.settings.enablePunishment !== false && Boolean(room.gameState.punishment);
    if (punishContainer) {
      if (hasPunishment) {
        punishContainer.classList.remove('hidden');
        const punishmentText = document.getElementById('punishment-text');
        if (punishmentText) punishmentText.innerText = room.gameState.punishment || '模仿一种动物叫声！';
      } else {
        punishContainer.classList.add('hidden');
      }
    }

    const hostActions = document.getElementById('game-over-host-actions');
    const guestMsg = document.getElementById('game-over-guest-msg');
    if (hostActions) {
      if (isHost) {
        hostActions.classList.remove('hidden');
        if (guestMsg) guestMsg.classList.add('hidden');
      } else {
        hostActions.classList.add('hidden');
        if (guestMsg) guestMsg.classList.remove('hidden');
      }
    }

    const restartBtn = document.getElementById('btn-restart-game');
    if (restartBtn) {
      restartBtn.innerText = isHost ? '🏠 房主重置 / 回到房间大厅 (再来一局)' : '🏠 回到房间大厅 (准备下一局)';
    }
  }

  // 重新抽取惩罚
  document.getElementById('btn-reroll-punishment').addEventListener('click', () => {
    window.sfx.playClick();
    socket.emit('reroll_punishment');
  });

  // 房主强制重置房间回到大厅（随时可用）
  function requestResetToLobby() {
    window.sfx.playClick();
    if (confirm('确定要强制结束本局，重新回到房间大厅吗？\n（新加入的观战朋友也将一同加入游戏）')) {
      socket.emit('reset_to_lobby', {
        roomCode: currentRoom ? currentRoom.code : null,
        playerId: myPlayerId
      });
    }
  }

  const hostResetBtn = document.getElementById('btn-host-reset');
  if (hostResetBtn) hostResetBtn.addEventListener('click', requestResetToLobby);

  document.querySelectorAll('.btn-host-reset-action').forEach(btn => {
    btn.addEventListener('click', requestResetToLobby);
  });

  // 再来一局 (结算页面)
  document.getElementById('btn-restart-game').addEventListener('click', () => {
    window.sfx.playClick();
    socket.emit('restart_game', {
      roomCode: currentRoom ? currentRoom.code : null,
      playerId: myPlayerId
    });
  });

  // 快捷互动表情
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji;
      socket.emit('send_reaction', emoji);
    });
  });

  socket.on('reaction_received', (data) => {
    window.sfx.playPop();
    spawnFloatingEmoji(data.emoji, data.playerName);
  });

  function spawnFloatingEmoji(emoji, senderName) {
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.innerText = emoji;
    const randomX = Math.floor(Math.random() * (window.innerWidth - 60)) + 30;
    el.style.left = `${randomX}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  // 局域网分享与二维码弹窗
  const modalLan = document.getElementById('modal-lan');
  document.getElementById('btn-lan-share').addEventListener('click', () => {
    window.sfx.playClick();
    renderLanModal();
    modalLan.classList.remove('hidden');
  });

  document.getElementById('btn-close-lan').addEventListener('click', () => {
    modalLan.classList.add('hidden');
  });

  function renderLanModal() {
    const list = document.getElementById('lan-url-list');
    list.innerHTML = '';
    const roomCode = currentRoom ? currentRoom.code : '';

    const isPublicOrigin = window.location.protocol === 'https:' || 
      (!['localhost', '127.0.0.1'].includes(window.location.hostname) &&
       !window.location.hostname.startsWith('192.168.') &&
       !window.location.hostname.startsWith('10.') &&
       !window.location.hostname.startsWith('172.'));

    const basePath = '/undercover';
    let primaryUrl = window.location.origin;
    let selectedUrl = primaryUrl;

    function buildJoinUrl(baseUrl) {
      return roomCode ? `${baseUrl}${basePath}/?room=${roomCode}` : `${baseUrl}${basePath}/`;
    }

    if (isPublicOrigin) {
      // 线上公网环境，直接展示专属房间链接
      const joinUrl = buildJoinUrl(window.location.origin);
      const pubCard = document.createElement('div');
      pubCard.style.cssText = `
        padding: 12px;
        background: rgba(168, 85, 247, 0.12);
        border: 1px solid rgba(168, 85, 247, 0.35);
        border-radius: 8px;
        text-align: center;
        margin-bottom: 8px;
      `;
      pubCard.innerHTML = `
        <div style="font-weight: 700; color: #d8b4fe; font-size: 13px; word-break: break-all;">${joinUrl}</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
          ✨ 专属房间链接已生成 · 好友手机浏览器或微信扫码即玩
        </div>
      `;
      list.appendChild(pubCard);
      drawQRCode(joinUrl);
      return;
    }

    if (serverInfo && serverInfo.ipObjs && serverInfo.ipObjs.length > 0) {
      const primaryItem = serverInfo.ipObjs.find(item => item.isPrimary) || serverInfo.ipObjs[0];
      primaryUrl = `http://${primaryItem.address}:${serverInfo.port}`;
      selectedUrl = primaryUrl;

      serverInfo.ipObjs.forEach((item, idx) => {
        const itemUrl = `http://${item.address}:${serverInfo.port}`;
        const joinUrl = buildJoinUrl(itemUrl);
        
        const card = document.createElement('div');
        card.style.cssText = `
          padding: 10px 12px;
          background: ${item.isPrimary ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255,255,255,0.05)'};
          border: 1px solid ${item.isPrimary ? 'rgba(6, 182, 212, 0.4)' : 'var(--border-color)'};
          border-radius: 8px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          justify-content: space-between;
          align-items: center;
        `;
        card.innerHTML = `
          <div>
            <div style="font-weight: 700; color: ${item.isPrimary ? '#67e8f9' : '#ffffff'}; font-size: 14px;">${joinUrl}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              ${item.name} ${item.isPrimary ? '<span style="color:#10b981; font-weight:700;">(推荐连接)</span>' : ''}
            </div>
          </div>
          <button class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 11px;">生成此码</button>
        `;

        card.addEventListener('click', () => {
          selectedUrl = itemUrl;
          drawQRCode(buildJoinUrl(selectedUrl));
        });

        list.appendChild(card);
      });
    }

    // 默认绘制主地址二维码
    drawQRCode(buildJoinUrl(primaryUrl));
  }

  function drawQRCode(urlToEncode) {
    const qrContainer = document.getElementById('qrcode-container');
    qrContainer.innerHTML = '';
    if (window.QRCode) {
      new window.QRCode(qrContainer, {
        text: urlToEncode,
        width: 180,
        height: 180,
        colorDark: "#0f172a",
        colorLight: "#ffffff"
      });
    }
  }

  // 复制链接
  document.getElementById('btn-copy-link').addEventListener('click', () => {
    const roomCode = currentRoom ? currentRoom.code : '';
    const joinUrl = roomCode
      ? `${window.location.origin}/undercover/?room=${roomCode}`
      : `${window.location.origin}/undercover/`;
    navigator.clipboard.writeText(joinUrl).then(() => {
      alert('已复制游戏链接到剪贴板！');
    }).catch(() => {
      prompt('请手动复制链接:', joinUrl);
    });
  });

  function copyTextToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        alert(successMsg);
      }).catch(() => {
        fallbackCopy(text, successMsg);
      });
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      alert(successMsg);
    } catch (e) {
      prompt('请手动复制以下信息：', text);
    }
    ta.remove();
  }

  // 点击房间号快捷复制邀请链接与房间号
  document.getElementById('lobby-room-code').addEventListener('click', () => {
    if (currentRoom) {
      window.sfx.playClick();
      const joinUrl = `${window.location.origin}/undercover/?room=${currentRoom.code}`;
      const inviteMsg = `【谁是卧底】房间号：${currentRoom.code}\n点击直接进入游戏房间：${joinUrl}`;
      copyTextToClipboard(inviteMsg, `房间邀请已复制到剪贴板！\n房间号: ${currentRoom.code}\n发送给好友即可点击链接快速开战！`);
      
      const copyPill = document.getElementById('lobby-copy-pill');
      if (copyPill) {
        copyPill.innerText = '✅ 已复制！';
        copyPill.style.background = 'rgba(16, 185, 129, 0.3)';
        copyPill.style.borderColor = '#10b981';
        copyPill.style.color = '#ffffff';
        setTimeout(() => {
          copyPill.innerText = '📋 点击复制邀请';
          copyPill.style.background = 'rgba(56, 189, 248, 0.2)';
          copyPill.style.borderColor = 'rgba(56, 189, 248, 0.4)';
          copyPill.style.color = '#38bdf8';
        }, 2000);
      }
    }
  });

  // 规则弹窗
  const modalRules = document.getElementById('modal-rules');
  document.getElementById('btn-help').addEventListener('click', () => {
    window.sfx.playClick();
    modalRules.classList.remove('hidden');
  });
  document.getElementById('btn-close-rules').addEventListener('click', () => {
    modalRules.classList.add('hidden');
  });

  // 设置弹窗
  const modalSettings = document.getElementById('modal-settings');

  function populateSettingsModal(settings) {
    if (!settings) return;
    const s = Object.assign({}, pendingRoomSettings, settings);
    const spyEl = document.getElementById('val-spy-count');
    if (spyEl) spyEl.innerText = s.undercoverCount ?? 1;
    const wbEl = document.getElementById('val-wb-count');
    if (wbEl) wbEl.innerText = s.whiteboardCount ?? 0;
    const speechEl = document.getElementById('select-speech-timer');
    if (speechEl) speechEl.value = String(s.speechTimeLimit ?? 90);
    const voteEl = document.getElementById('select-vote-timer');
    if (voteEl) voteEl.value = String(s.voteTimeLimit ?? 60);
    const orderEl = document.getElementById('select-speech-order');
    if (orderEl) orderEl.value = s.speechOrderMode || 'random';
    const revealEl = document.getElementById('select-reveal-mode');
    if (revealEl) revealEl.value = s.revealRoleOnEliminate === false ? 'false' : 'true';
    const guessEl = document.getElementById('select-guess-mode');
    if (guessEl) guessEl.value = s.allowGuessWord === false ? 'false' : 'true';
    const punishEl = document.getElementById('select-punishment-mode');
    if (punishEl) punishEl.value = s.enablePunishment === false ? 'false' : 'true';
    const catEl = document.getElementById('select-category');
    if (catEl) catEl.value = s.category || 'all';

    customWordPairs = Array.isArray(s.customWords) ? [...s.customWords] : [];
    renderCustomWordsBadges();
  }

  document.getElementById('btn-open-settings').addEventListener('click', () => {
    window.sfx.playClick();
    if (!currentRoom) return;
    populateSettingsModal(currentRoom.settings);
    modalSettings.classList.remove('hidden');
  });

  document.getElementById('btn-close-settings').addEventListener('click', () => {
    modalSettings.classList.add('hidden');
  });

  // 步进器按钮
  document.getElementById('btn-spy-minus').addEventListener('click', () => {
    const el = document.getElementById('val-spy-count');
    let val = parseInt(el.innerText);
    if (val > 1) el.innerText = val - 1;
  });
  document.getElementById('btn-spy-plus').addEventListener('click', () => {
    const el = document.getElementById('val-spy-count');
    let val = parseInt(el.innerText);
    if (val < 4) el.innerText = val + 1;
  });

  document.getElementById('btn-wb-minus').addEventListener('click', () => {
    const el = document.getElementById('val-wb-count');
    let val = parseInt(el.innerText);
    if (val > 0) el.innerText = val - 1;
  });
  document.getElementById('btn-wb-plus').addEventListener('click', () => {
    const el = document.getElementById('val-wb-count');
    let val = parseInt(el.innerText);
    if (val < 2) el.innerText = val + 1;
  });

  // 自定义词库添加
  document.getElementById('btn-add-custom-word').addEventListener('click', () => {
    const civ = document.getElementById('custom-word-civ').value.trim();
    const spy = document.getElementById('custom-word-spy').value.trim();
    if (!civ || !spy) return alert('请输入完整的平民词和卧底词');
    customWordPairs.push({ civilian: civ, undercover: spy });
    document.getElementById('custom-word-civ').value = '';
    document.getElementById('custom-word-spy').value = '';
    renderCustomWordsBadges();
  });

  function renderCustomWordsBadges() {
    const list = document.getElementById('custom-words-badge-list');
    list.innerHTML = '';
    customWordPairs.forEach((item, idx) => {
      const tag = document.createElement('div');
      tag.style.cssText = 'padding: 4px 8px; background: rgba(168,85,247,0.2); border-radius: 6px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;';
      tag.innerHTML = `${escapeHtml(item.civilian)} / ${escapeHtml(item.undercover)} <span style="cursor: pointer; color: #f43f5e;" data-idx="${idx}">✕</span>`;
      tag.querySelector('span').addEventListener('click', () => {
        customWordPairs.splice(idx, 1);
        renderCustomWordsBadges();
      });
      list.appendChild(tag);
    });
  }

  // 保存设置
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    window.sfx.playClick();
    const newSettings = {
      undercoverCount: parseInt(document.getElementById('val-spy-count').innerText) || 1,
      whiteboardCount: parseInt(document.getElementById('val-wb-count').innerText) || 0,
      speechTimeLimit: parseInt(document.getElementById('select-speech-timer').value) || 0,
      voteTimeLimit: parseInt(document.getElementById('select-vote-timer').value) || 0,
      speechOrderMode: document.getElementById('select-speech-order').value || 'random',
      revealRoleOnEliminate: document.getElementById('select-reveal-mode').value === 'true',
      allowGuessWord: document.getElementById('select-guess-mode').value === 'true',
      enablePunishment: document.getElementById('select-punishment-mode').value === 'true',
      category: document.getElementById('select-category').value || 'all',
      customWords: customWordPairs
    };

    if (currentRoom && currentRoom.code) {
      socket.emit('update_settings', newSettings);
    }
    pendingRoomSettings = Object.assign({}, pendingRoomSettings, newSettings);
    updateHomeSettingsTag();
    modalSettings.classList.add('hidden');
  });

  // ----------------------------------------------------
  // 音效与语音播报控制 (多端状态同步)
  // ----------------------------------------------------
  function updateSoundUI() {
    const icon = document.getElementById('sound-icon');
    const text = document.getElementById('sound-text');
    if (icon) icon.innerText = window.sfx.enabled ? '🔊' : '🔇';
    if (text) text.innerText = window.sfx.enabled ? '音效' : '静音';

    const mIcon = document.getElementById('mobile-sound-icon');
    const mDesc = document.getElementById('mobile-sound-desc');
    if (mIcon) mIcon.innerText = window.sfx.enabled ? '🔊' : '🔇';
    if (mDesc) mDesc.innerText = window.sfx.enabled ? '开启中' : '已静音';
  }

  function toggleSound() {
    window.sfx.enabled = !window.sfx.enabled;
    updateSoundUI();
    window.sfx.playClick();
  }

  const soundBtn = document.getElementById('btn-sound');
  if (soundBtn) soundBtn.addEventListener('click', toggleSound);
  const btnMobileSound = document.getElementById('btn-mobile-sound');
  if (btnMobileSound) btnMobileSound.addEventListener('click', toggleSound);

  function updateVoiceUI() {
    const icon = document.getElementById('voice-icon');
    const text = document.getElementById('voice-text');
    if (icon) icon.innerText = window.sfx.voiceEnabled ? '🗣️' : '🔇';
    if (text) text.innerText = window.sfx.voiceEnabled ? '语音:开' : '语音:关';

    const mIcon = document.getElementById('mobile-voice-icon');
    const mDesc = document.getElementById('mobile-voice-desc');
    if (mIcon) mIcon.innerText = window.sfx.voiceEnabled ? '🗣️' : '🔇';
    if (mDesc) mDesc.innerText = window.sfx.voiceEnabled ? '开启中' : '已关闭';
  }

  function toggleVoice() {
    window.sfx.voiceEnabled = !window.sfx.voiceEnabled;
    updateVoiceUI();
    window.sfx.playClick();
    if (window.sfx.voiceEnabled) {
      window.sfx.speak('语音播报已开启');
    } else {
      window.speechSynthesis && window.speechSynthesis.cancel();
    }
  }

  const voiceBtn = document.getElementById('btn-voice');
  if (voiceBtn) voiceBtn.addEventListener('click', toggleVoice);
  const btnMobileVoice = document.getElementById('btn-mobile-voice');
  if (btnMobileVoice) btnMobileVoice.addEventListener('click', toggleVoice);

  updateSoundUI();
  updateVoiceUI();

  // ----------------------------------------------------
  // 移动端公屏折叠/展开与胶囊状态控制
  // ----------------------------------------------------
  const publicScreenContainer = document.getElementById('public-screen-container');
  const publicScreenHeader = document.getElementById('public-screen-header');
  const screenToggleText = document.getElementById('screen-toggle-text');
  const screenToggleIcon = document.getElementById('screen-toggle-icon');

  function togglePublicScreenCollapse() {
    if (!publicScreenContainer) return;
    window.sfx.playClick();
    const isCollapsed = publicScreenContainer.classList.toggle('collapsed');
    if (screenToggleText) screenToggleText.innerText = isCollapsed ? '展开' : '收起';
    if (screenToggleIcon) screenToggleIcon.innerText = isCollapsed ? '▲' : '▼';
  }

  if (publicScreenHeader) {
    publicScreenHeader.addEventListener('click', () => {
      togglePublicScreenCollapse();
    });
  }

  // ----------------------------------------------------
  // 移动端安全快捷菜单控制面板
  // ----------------------------------------------------
  const modalMobileMenu = document.getElementById('modal-mobile-menu');
  const btnMobileMenu = document.getElementById('btn-mobile-menu');
  const btnCloseMobileMenu = document.getElementById('btn-close-mobile-menu');
  const btnMobileShare = document.getElementById('btn-mobile-share');
  const btnMobileShareMenu = document.getElementById('btn-mobile-share-menu');
  const btnMobileRules = document.getElementById('btn-mobile-rules');
  const btnMobileHostReset = document.getElementById('btn-mobile-host-reset');
  const btnMobileLeave = document.getElementById('btn-mobile-leave');

  function openMobileMenu() {
    window.sfx.playClick();
    if (modalMobileMenu) modalMobileMenu.classList.remove('hidden');
  }

  function closeMobileMenu() {
    if (modalMobileMenu) modalMobileMenu.classList.add('hidden');
  }

  if (btnMobileMenu) btnMobileMenu.addEventListener('click', openMobileMenu);
  if (btnCloseMobileMenu) btnCloseMobileMenu.addEventListener('click', closeMobileMenu);
  if (modalMobileMenu) {
    modalMobileMenu.addEventListener('click', (e) => {
      if (e.target === modalMobileMenu) closeMobileMenu();
    });
  }

  function triggerLanShare() {
    window.sfx.playClick();
    renderLanModal();
    const modalLan = document.getElementById('modal-lan');
    if (modalLan) modalLan.classList.remove('hidden');
    closeMobileMenu();
  }

  if (btnMobileShare) btnMobileShare.addEventListener('click', triggerLanShare);
  if (btnMobileShareMenu) btnMobileShareMenu.addEventListener('click', triggerLanShare);

  if (btnMobileRules) {
    btnMobileRules.addEventListener('click', () => {
      window.sfx.playClick();
      const modalRules = document.getElementById('modal-rules');
      if (modalRules) modalRules.classList.remove('hidden');
      closeMobileMenu();
    });
  }

  if (btnMobileHostReset) {
    btnMobileHostReset.addEventListener('click', () => {
      closeMobileMenu();
      requestResetToLobby();
    });
  }

  if (btnMobileLeave) {
    btnMobileLeave.addEventListener('click', () => {
      closeMobileMenu();
      confirmLeaveRoom();
    });
  }

  // 纯 JS 纸屑烟花效果
  function triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#f43f5e', '#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        w: Math.random() * 8 + 4,
        h: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.7) * 16,
        gravity: 0.25,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
        opacity: 1
      });
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rotation += p.rotSpeed;
        p.opacity -= 0.008;

        if (p.opacity > 0) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
      });

      if (alive) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    animate();
  }

  // 初始化
  initHome();
})();
