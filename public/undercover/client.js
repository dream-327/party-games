// 谁是卧底 - 前端核心交互逻辑
(function() {
  const socket = io('/undercover');

  // 可选头像库
  const AVATARS = [
    '😎', '🧐', '🤠', '🥷', '🦸‍♂️', '🧙‍♂️',
    '🐶', '🐱', '🦊', '🐼', '🦁', '🐯',
    '🐸', '🐵', '🦄', '🐲', '🤖', '👽',
    '👻', '🧛‍♂️', '🥳', '🤩', '🚀', '💎'
  ];

  // 本地玩家信息 (安全隔离，支持同设备多标签页独立游戏与刷新状态保持)
  let myPlayerId = null;
  try {
    myPlayerId = sessionStorage.getItem('undercover_tab_pid');
    if (!myPlayerId) {
      myPlayerId = localStorage.getItem('undercover_pid');
    }
  } catch (e) {}

  if (!myPlayerId) {
    myPlayerId = 'p_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }
  try {
    sessionStorage.setItem('undercover_tab_pid', myPlayerId);
    localStorage.setItem('undercover_pid', myPlayerId);
  } catch (e) {}

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
  let currentVotingStartTime = null;
  let votingTimerInterval = null;
  let customWordPairs = [];
  let serverInfo = null;

  // DOM 元素引用
  const views = {
    home: document.getElementById('view-home'),
    lobby: document.getElementById('view-lobby'),
    card: document.getElementById('view-card'),
    speaking: document.getElementById('view-speaking'),
    voting: document.getElementById('view-voting'),
    pk: document.getElementById('view-pk'),
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

    const headerLeaveBtn = document.getElementById('btn-header-leave');
    if (headerLeaveBtn) {
      if (activeViewName === 'home') {
        headerLeaveBtn.classList.add('hidden');
      } else {
        headerLeaveBtn.classList.remove('hidden');
      }
    }
  }

  function confirmLeaveRoom() {
    window.sfx.playClick();
    if (confirm('确定要退出当前房间吗？')) {
      socket.emit('leave_room', () => {});
      currentRoom = null;
      sessionStorage.removeItem('undercover_room');
      switchView('home');
      const hostResetBtn = document.getElementById('btn-host-reset');
      if (hostResetBtn) hostResetBtn.classList.add('hidden');
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
      document.getElementById('input-room-code').value = roomParam;
    }
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
    sessionStorage.removeItem('undercover_room');
    currentRoom = null;
    const name = document.getElementById('input-nickname').value.trim() || myNickname;
    socket.emit('create_room', {
      player: { id: myPlayerId, name, avatar: myAvatar },
      settings: {
        undercoverCount: 1,
        whiteboardCount: 0,
        category: 'all',
        speechTimeLimit: 45,
        revealRoleOnEliminate: true,
        customWords: customWordPairs
      }
    }, (res) => {
      if (!res.success) {
        alert(res.message || '创建房间失败');
      } else {
        sessionStorage.setItem('undercover_room', res.roomCode);
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
    sessionStorage.setItem('undercover_room', roomCode);
    socket.emit('join_room', {
      roomCode,
      player: { id: myPlayerId, name, avatar: myAvatar }
    }, (res) => {
      if (!res.success) {
        sessionStorage.removeItem('undercover_room');
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
      sessionStorage.setItem('undercover_room', roomData.code);
    }
    renderRoom(roomData);
  });

  socket.on('kicked_from_room', () => {
    alert('您已被房主移出房间');
    currentRoom = null;
    sessionStorage.removeItem('undercover_room');
    switchView('home');
  });

  // 自动重新连接与全量状态同步机制 (针对手机熄屏、切后台等场景)
  function autoSyncRoom() {
    const savedRoomCode = (currentRoom && currentRoom.code) || sessionStorage.getItem('undercover_room');
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
          sessionStorage.removeItem('undercover_room');
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

  // 定时心跳保活 (由 2s 降频为 15s)，避免频繁消耗服务器资源与 DOM 闪烁
  setInterval(() => {
    const savedRoomCode = (currentRoom && currentRoom.code) || sessionStorage.getItem('undercover_room');
    if (savedRoomCode && socket.connected) {
      socket.emit('sync_room', { roomCode: savedRoomCode, playerId: myPlayerId });
    }
  }, 15000);

  // 渲染房间主函数
  function renderRoom(room) {
    const me = (room.players && room.players.find(p => p.id === myPlayerId)) || room.myPlayer;
    const isHost = (room.hostId === myPlayerId) || (me && me.isHost) || (room.myPlayer && room.myPlayer.isHost);

    // 1. 房间号展示
    document.getElementById('display-room-code').innerText = room.code;
    document.getElementById('lobby-player-count').innerText = room.players.length;

    // 2. 观战提示控制
    const spectatorBanner = document.getElementById('spectator-banner');
    if (me && me.isSpectator && room.gameState.phase !== 'LOBBY' && room.gameState.phase !== 'GAME_OVER') {
      spectatorBanner.classList.remove('hidden');
    } else {
      spectatorBanner.classList.add('hidden');
    }

    // 3. 房主重置按钮控制
    const hostResetBtn = document.getElementById('btn-host-reset');
    if (isHost && room.gameState.phase !== 'LOBBY') {
      hostResetBtn.classList.remove('hidden');
    } else {
      hostResetBtn.classList.add('hidden');
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
      // 仅在真实切换阶段时才重置投票选定目标
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
    } else if (phase === 'ELIMINATION') {
      switchView('elimination');
      renderElimination(room, isHost);
    } else if (phase === 'GAME_OVER') {
      switchView('gameOver');
      renderGameOver(room, isHost);
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
        const hostStatus = (hostPlayer && hostPlayer.isOnline) 
          ? '<span style="color:#34d399; font-weight: 600;">(在线)</span>' 
          : '<span style="color:#f87171; font-weight: 600;">(已离线)</span>';
        hostBanner.innerHTML = `👑 当前房主: <b>${escapeHtml(hostName)}</b> ${hostStatus}`;
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
      box.innerHTML = `
        <div class="player-avatar">
          ${p.avatar}
          ${p.isHost ? '<span class="host-crown">👑</span>' : ''}
        </div>
        <div class="player-name" title="${escapeHtml(displayName)}" style="font-weight: ${isMe ? '700' : '500'}; color: ${isMe ? '#fbbf24' : 'var(--text-primary)'};">${escapeHtml(displayName)}${isMe ? ' (我)' : ''}</div>
        <div style="display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; margin-top: 4px;">
          ${hostBadge}${meBadge}${aiBadge}${offlineBadge}
        </div>
        ${(isHost && !isMe) ? `<button class="kick-btn" data-id="${p.id}" title="移出玩家">✕</button>` : ''}
      `;

      if (isHost && !isMe) {
        box.querySelector('.kick-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`确定要踢出 ${displayName} 吗？`)) {
            socket.emit('kick_player', p.id);
          }
        });
      }
      playersGrid.appendChild(box);
    });

    const hostControls = document.getElementById('host-controls');
    const guestWaiting = document.getElementById('guest-waiting-msg');
    const guestWaitingText = document.getElementById('guest-waiting-text');
    const btnClaimHost = document.getElementById('btn-claim-host');
    const lobbyStartTip = document.getElementById('lobby-start-tip');
    const btnStartGame = document.getElementById('btn-start-game');

    const catMap = {
      all: '综合随机', classic: '经典对决', life: '生活日常',
      fun: '搞笑扎心', pop: '影视动漫', food: '吃货天下', custom_only: '自定义'
    };
    const catText = catMap[room.settings.category] || '综合随机';
    const settingsSummary = `${room.settings.undercoverCount}卧底 · ${room.settings.whiteboardCount}白板 · ${catText}`;

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
        btnClaimHost.innerText = '👑 成为房主 / 调整配置';
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
          sessionStorage.removeItem('undercover_room');
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

    const forceStartBtn = document.getElementById('btn-force-start-speaking');
    if (isHost) {
      forceStartBtn.classList.remove('hidden');
    } else {
      forceStartBtn.classList.add('hidden');
    }
  }

  // 卡片长按/点击翻转交互
  const cardElement = document.getElementById('secret-card-element');
  cardElement.addEventListener('click', () => {
    cardElement.classList.toggle('flipped');
    window.sfx.playFlip();
  });

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
          ${isCurrent ? '🎙️ 发言中' : (isPast ? '已发言' : '等待')}
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
    } else {
      finishBtn.disabled = true;
      finishBtn.classList.add('hidden');
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

  // 发送打字描述词语
  function handleSendClueText() {
    const input = document.getElementById('input-speech-clue');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    window.sfx.playClick();
    socket.emit('send_clue', text);
    input.value = '';
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
    window.sfx.speak(`${data.playerName}发言说：“${data.clue}”`);
  });

  // 结束发言点击
  document.getElementById('btn-finish-speaking').addEventListener('click', () => {
    window.sfx.playClick();
    socket.emit('finish_speaking', {
      roomCode: currentRoom ? currentRoom.code : null,
      playerId: myPlayerId
    });
  });

  // 渲染 PK 发言
  function renderPKSpeaking(room, me, isHost) {
    const currentSpeakerId = room.gameState.pkSpeakerId;
    const currentSpeaker = room.players.find(p => p.id === currentSpeakerId);
    const isMe = currentSpeakerId === myPlayerId;

    document.getElementById('pk-speaker-avatar').innerText = currentSpeaker ? currentSpeaker.avatar : '🔥';
    document.getElementById('pk-speaker-name').innerText = (currentSpeaker ? currentSpeaker.name : '候选人') + (isMe ? ' (轮到你辩解！)' : '');

    const finishBtn = document.getElementById('btn-finish-pk-speaking');
    if (isMe || isHost) {
      finishBtn.disabled = false;
      finishBtn.classList.remove('hidden');
    } else {
      finishBtn.disabled = true;
      finishBtn.classList.add('hidden');
    }
  }

  document.getElementById('btn-finish-pk-speaking').addEventListener('click', () => {
    window.sfx.playClick();
    socket.emit('finish_speaking', {
      roomCode: currentRoom ? currentRoom.code : null,
      playerId: myPlayerId
    });
  });

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

    candidates.forEach(p => {
      const card = document.createElement('div');
      const isSelected = effectiveSelectedId === p.id;
      card.className = `vote-card ${isSelected ? 'selected' : ''}`;
      
      card.innerHTML = `
        <div style="font-size: 36px; margin-bottom: 6px;">${p.avatar}</div>
        <div style="font-size: 15px; font-weight: 700; color: white;">${escapeHtml(p.name)}${p.id === myPlayerId ? ' (自己)' : ''}</div>
        <div style="font-size: 12px; color: ${isSelected ? '#fca5a5' : 'var(--text-muted)'}; margin-top: 4px;">
          ${isSelected ? '🎯 已选中此人' : '怀疑此人是卧底'}
        </div>
      `;

      if (me && me.isAlive && !me.hasVoted) {
        card.addEventListener('click', () => {
          document.querySelectorAll('.vote-card').forEach(el => {
            el.classList.remove('selected');
            const sub = el.querySelector('div:last-child');
            if (sub) sub.innerText = '怀疑此人是卧底';
          });
          card.classList.add('selected');
          const sub = card.querySelector('div:last-child');
          if (sub) sub.innerText = '🎯 已选中此人';

          selectedVoteTargetId = p.id;
          submitBtn.disabled = false;
          submitBtn.innerText = '🔥 确认投TA一票';
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

    if (me && me.hasVoted) {
      submitBtn.disabled = true;
      submitBtn.innerText = '✅ 已投票，等待其他人...';
    } else if (me && !me.isAlive) {
      submitBtn.disabled = true;
      submitBtn.innerText = '👻 您已出局，观战中...';
    } else {
      submitBtn.disabled = !selectedVoteTargetId;
      submitBtn.innerText = selectedVoteTargetId ? '🔥 确认投TA一票' : '👆 请先点击头像选择';
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
      container.innerHTML = `
        <div style="font-size: 56px; margin-bottom: 8px;">${elim.avatar}</div>
        <div style="font-size: 22px; font-weight: 800; margin-bottom: 8px;">${escapeHtml(elim.name)} 被投出局！</div>
        ${votesText ? `<div style="font-size: 14px; margin-bottom: 12px; color: #fca5a5;">${votesText}</div>` : ''}
        ${room.settings.revealRoleOnEliminate ? `<div style="font-size: 16px;">真实的身份是：${roleMap[elim.role] || elim.role}</div>` : ''}
      `;
      const roleCn = elim.role === 'UNDERCOVER' ? '卧底' : (elim.role === 'WHITEBOARD' ? '白板' : '平民');
      window.sfx.speak(`${elim.name} 被投出局，真实身份是 ${roleCn}`);
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
  function renderGameOver(room, isHost) {
    window.sfx.playVictory();
    triggerConfetti();

    const winner = room.gameState.winner;
    const titleEl = document.getElementById('victory-title');
    const descEl = document.getElementById('victory-desc');
    const iconEl = document.getElementById('victory-icon');

    if (winner === 'CIVILIAN') {
      iconEl.innerText = '🏆';
      titleEl.innerText = '平民大获全胜！';
      titleEl.className = 'victory-title civilians';
      descEl.innerText = '火眼金睛！成功揪出了所有潜伏的卧底！';
      window.sfx.speak('游戏结束，平民大获全胜！');
    } else {
      iconEl.innerText = '🎭';
      titleEl.innerText = '卧底瞒天过海！';
      titleEl.className = 'victory-title undercovers';
      descEl.innerText = '演技炸裂！卧底成功潜伏到底，取得胜利！';
      window.sfx.speak('游戏结束，卧底瞒天过海取得胜利！');
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
    const punishmentText = document.getElementById('punishment-text');
    punishmentText.innerText = room.gameState.punishment || '模仿一种动物叫声！';

    const hostActions = document.getElementById('game-over-host-actions');
    const guestMsg = document.getElementById('game-over-guest-msg');
    if (isHost) {
      hostActions.classList.remove('hidden');
      if (guestMsg) guestMsg.classList.add('hidden');
    } else {
      hostActions.classList.add('hidden');
      if (guestMsg) guestMsg.classList.remove('hidden');
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
  document.getElementById('btn-open-settings').addEventListener('click', () => {
    window.sfx.playClick();
    if (!currentRoom) return;
    document.getElementById('val-spy-count').innerText = currentRoom.settings.undercoverCount;
    document.getElementById('val-wb-count').innerText = currentRoom.settings.whiteboardCount;
    document.getElementById('select-speech-timer').value = currentRoom.settings.speechTimeLimit;
    document.getElementById('select-category').value = currentRoom.settings.category;
    renderCustomWordsBadges();
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
    const newSettings = {
      undercoverCount: parseInt(document.getElementById('val-spy-count').innerText),
      whiteboardCount: parseInt(document.getElementById('val-wb-count').innerText),
      speechTimeLimit: parseInt(document.getElementById('select-speech-timer').value),
      category: document.getElementById('select-category').value,
      customWords: customWordPairs
    };
    socket.emit('update_settings', newSettings);
    modalSettings.classList.add('hidden');
  });

  // 音效开关
  const soundBtn = document.getElementById('btn-sound');
  soundBtn.addEventListener('click', () => {
    window.sfx.enabled = !window.sfx.enabled;
    soundBtn.innerText = window.sfx.enabled ? '🔊' : '🔇';
    window.sfx.playClick();
  });

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
