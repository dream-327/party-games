// 聚会狼人杀 - 客户端交互逻辑
(function() {
  const socket = io('/werewolf');

  const AVATARS = [
    '😎', '🤠', '🧐', '🥳', '🥷', '🦸‍♂️',
    '🧙‍♂️', '🧔', '🧝', '🦊', '🐺', '🦉'
  ];

  let myPlayerId = localStorage.getItem('werewolf_pid');
  if (!myPlayerId) {
    myPlayerId = 'p_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('werewolf_pid', myPlayerId);
  }

  let myNickname = localStorage.getItem('werewolf_name') || `村民${Math.floor(100 + Math.random() * 900)}`;
  let myAvatar = localStorage.getItem('werewolf_avatar') || AVATARS[Math.floor(Math.random() * AVATARS.length)];

  let currentRoom = null;
  let selectedTargetId = null;
  let selectedCenterIndex = null;
  let selectedCenterIndices = [];
  let selectedTroubleTarget1 = null;
  let selectedTroubleTarget2 = null;
  let timerInterval = null;
  let serverInfo = null;
  let privateRoleData = null;

  // DOM 元素引用
  const viewHome = document.getElementById('view-home');
  const viewGame = document.getElementById('view-game');

  const modeTag = document.getElementById('mode-tag');
  const roomCodeBadge = document.getElementById('room-code-badge');
  const playersCountNum = document.getElementById('players-count-num');

  const avatarList = document.getElementById('avatar-list');
  const nicknameInput = document.getElementById('nickname-input');
  const roomCodeInput = document.getElementById('room-code-input');

  const btnModeOneNight = document.getElementById('btn-mode-onenight');
  const btnModeClassic = document.getElementById('btn-mode-classic');

  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom = document.getElementById('btn-join-room');
  const btnQuickInvite = document.getElementById('btn-quick-invite');
  const btnRules = document.getElementById('btn-rules');
  const btnSound = document.getElementById('btn-sound');
  const btnLeaveRoom = document.getElementById('btn-leave-room');
  const btnLeaveLobby = document.getElementById('btn-leave-lobby');
  const btnSettleLeave = document.getElementById('btn-settle-leave');

  // 会场元素
  const phaseTitle = document.getElementById('phase-title');
  const phaseDesc = document.getElementById('phase-desc');
  const phaseTimer = document.getElementById('phase-timer');
  const playersGrid = document.getElementById('players-grid');
  const centerCardsZone = document.getElementById('center-cards-zone');
  const centerCardItems = document.querySelectorAll('.center-card-item');

  // 卡牌池预览
  const deckPoolBox = document.getElementById('deck-pool-box');
  const deckPoolCount = document.getElementById('deck-pool-count');
  const deckPoolTags = document.getElementById('deck-pool-tags');

  // 卡牌翻转
  const cardInner = document.getElementById('card-inner');
  const myRoleIcon = document.getElementById('my-role-icon');
  const myRoleName = document.getElementById('my-role-name');
  const myRoleTeam = document.getElementById('my-role-team');
  const myRoleDesc = document.getElementById('my-role-desc');

  // 控制面板
  const panelLobby = document.getElementById('panel-lobby-actions');
  const btnAddAi = document.getElementById('btn-add-ai');
  const btnRemoveAi = document.getElementById('btn-remove-ai');
  const btnStartGame = document.getElementById('btn-start-game');

  const panelNightAction = document.getElementById('panel-night-action');
  const nightActionPrompt = document.getElementById('night-action-prompt');
  const btnSkipRobber = document.getElementById('btn-skip-robber');
  const btnConfirmNight = document.getElementById('btn-confirm-night');

  const panelDiscussion = document.getElementById('panel-discussion-actions');
  const btnExtendDiscussion = document.getElementById('btn-extend-discussion');
  const btnAdvanceVoting = document.getElementById('btn-advance-voting');

  const panelVoting = document.getElementById('panel-voting-actions');
  const btnConfirmVote = document.getElementById('btn-confirm-vote');

  // 弹窗元素
  const modalShare = document.getElementById('modal-share');
  const btnCloseShare = document.getElementById('btn-close-share');
  const shareLinkInput = document.getElementById('share-link-input');
  const btnCopyShareLink = document.getElementById('btn-copy-share-link');
  const shareNetworkOptions = document.getElementById('share-network-options');

  const modalRules = document.getElementById('modal-rules');
  const btnCloseRules = document.getElementById('btn-close-rules');

  const modalNightResult = document.getElementById('modal-night-result');
  const resultModalTitle = document.getElementById('result-modal-title');
  const resultDisplayBox = document.getElementById('result-display-box');
  const btnCloseResult = document.getElementById('btn-close-result');
  const btnAckResult = document.getElementById('btn-ack-result');

  const modalSettle = document.getElementById('modal-settle');
  const settleWinner = document.getElementById('settle-winner');
  const settleExecutedList = document.getElementById('settle-executed-list');
  const settleLogsList = document.getElementById('settle-logs-list');
  const settleRolesGrid = document.getElementById('settle-roles-grid');
  const settleCenterSection = document.getElementById('settle-center-section');
  const settleCenterCards = document.getElementById('settle-center-cards');
  const btnPlayAgain = document.getElementById('btn-play-again');

  // 上帝模式与规则设置元素
  const godSettingsCard = document.getElementById('god-mode-settings-card');
  const settingIsGodMode = document.getElementById('setting-is-god-mode');
  const settingBoardPreset = document.getElementById('setting-board-preset');
  const settingFirstDaySheriffTiming = document.getElementById('setting-first-day-sheriff-timing');
  const settingHasSheriff = document.getElementById('setting-has-sheriff');
  const settingWitchSelfSave = document.getElementById('setting-witch-self-save');
  const settingGuardWitchConflict = document.getElementById('setting-guard-witch-conflict');
  const settingWinCondition = document.getElementById('setting-win-condition');

  // 上帝总控台元素
  const godConsoleZone = document.getElementById('god-console-zone');
  const godWakelockBadge = document.getElementById('god-wakelock-badge');
  const godRoundBadge = document.getElementById('god-round-badge');
  const godPhaseBadge = document.getElementById('god-phase-badge');
  const btnGodPrevStep = document.getElementById('btn-god-prev-step');
  const btnGodRefereeToggle = document.getElementById('btn-god-referee-toggle');
  const godFakeCallBanner = document.getElementById('god-fake-call-banner');
  const godPrompterText = document.getElementById('god-prompter-text');
  const godSeerFeedbackCard = document.getElementById('god-seer-feedback-card');
  const godSeerFeedbackText = document.getElementById('god-seer-feedback-text');
  const godActionsWorkbench = document.getElementById('god-actions-workbench');
  const godSeatMatrix = document.getElementById('god-seat-matrix');

  // 普通玩家线下界面元素
  const playerOfflineZone = document.getElementById('player-offline-zone');
  const playerOfflineSeat = document.getElementById('player-offline-seat');
  const playerOfflineSheriffBadge = document.getElementById('player-offline-sheriff-badge');
  const playerOfflineStatusText = document.getElementById('player-offline-status-text');

  // 新增弹窗
  const modalBadgeTransfer = document.getElementById('modal-badge-transfer');
  const selectBadgeSuccessor = document.getElementById('select-badge-successor');
  const btnTransferBadge = document.getElementById('btn-transfer-badge');
  const btnTearBadge = document.getElementById('btn-tear-badge');

  const modalShootKill = document.getElementById('modal-shoot-kill');
  const shootKillTitle = document.getElementById('shoot-kill-title');
  const shootKillPrompt = document.getElementById('shoot-kill-prompt');
  const selectShootTarget = document.getElementById('select-shoot-target');
  const btnConfirmShoot = document.getElementById('btn-confirm-shoot');
  const btnCancelShoot = document.getElementById('btn-cancel-shoot');

  const modalWolfExplode = document.getElementById('modal-wolf-explode');
  const btnCloseExplode = document.getElementById('btn-close-explode');
  const selectExplodeWolf = document.getElementById('select-explode-wolf');
  const selectExplodeVictim = document.getElementById('select-explode-victim');
  const btnConfirmExplode = document.getElementById('btn-confirm-explode');

  const modalPkSetup = document.getElementById('modal-pk-setup');
  const btnClosePk = document.getElementById('btn-close-pk');
  const pkCandidatesCheckboxes = document.getElementById('pk-candidates-checkboxes');
  const btnConfirmPk = document.getElementById('btn-confirm-pk');

  const modalReferee = document.getElementById('modal-referee');
  const btnCloseReferee = document.getElementById('btn-close-referee');
  const selectRefereeEliminatePlayer = document.getElementById('select-referee-eliminate-player');
  const btnRefereeEliminate = document.getElementById('btn-referee-eliminate');
  const btnForceEndVillagers = document.getElementById('btn-force-end-villagers');
  const btnForceEndWolves = document.getElementById('btn-force-end-wolves');
  const btnForceEndTie = document.getElementById('btn-force-end-tie');
  const btnRefereeRedeal = document.getElementById('btn-referee-redeal');

  // 屏幕常亮 Screen Wake Lock API
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        if (godWakelockBadge) godWakelockBadge.textContent = '🟢 屏幕常亮保活';
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
          if (godWakelockBadge) godWakelockBadge.textContent = '⚪ 常亮已休眠';
        });
      }
    } catch (e) {
      console.log('Wake Lock request error:', e);
    }
  }
  document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
      await requestWakeLock();
    }
  });

  function showToast(msg, duration = 2800) {
    const t = document.createElement('div');
    t.className = 'toast-box';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      t.style.opacity = '0';
      t.style.transform = 'translate(-50%, -15px)';
      setTimeout(() => t.remove(), 300);
    }, duration);
  }

  function showNightResult(title, contentHtml) {
    if (!modalNightResult) return;
    resultModalTitle.textContent = title;
    resultDisplayBox.innerHTML = contentHtml;
    modalNightResult.classList.remove('hidden');
    window.sfx && window.sfx.playSwap();
  }

  // 初始化个人信息选择
  function initProfileUI() {
    nicknameInput.value = myNickname;
    avatarList.innerHTML = '';
    AVATARS.forEach(av => {
      const el = document.createElement('div');
      el.className = `avatar-option ${av === myAvatar ? 'selected' : ''}`;
      el.textContent = av;
      el.addEventListener('click', () => {
        document.querySelectorAll('.avatar-option').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
        myAvatar = av;
        localStorage.setItem('werewolf_avatar', av);
      });
      avatarList.appendChild(el);
    });

    nicknameInput.addEventListener('change', () => {
      const val = nicknameInput.value.trim() || `村民${Math.floor(100 + Math.random() * 900)}`;
      myNickname = val;
      localStorage.setItem('werewolf_name', val);
    });

    // 模式切换
    btnModeOneNight.addEventListener('click', () => {
      btnModeOneNight.classList.add('active');
      btnModeClassic.classList.remove('active');
      btnModeOneNight.querySelector('input').checked = true;
      if (godSettingsCard) godSettingsCard.classList.add('hidden');
    });

    btnModeClassic.addEventListener('click', () => {
      btnModeClassic.classList.add('active');
      btnModeOneNight.classList.remove('active');
      btnModeClassic.querySelector('input').checked = true;
      if (godSettingsCard) godSettingsCard.classList.remove('hidden');
    });

    if (settingIsGodMode) {
      settingIsGodMode.addEventListener('change', () => {
        const grid = document.getElementById('god-rules-grid');
        if (grid) grid.style.display = settingIsGodMode.checked ? 'grid' : 'none';
      });
    }
  }

  // 3D 防窥翻牌绑定 (手指长按或点击翻看，松开自动合上)
  let isCardFlipped = false;
  function toggleCard(flip) {
    if (flip) {
      cardInner.classList.add('flipped');
      isCardFlipped = true;
      window.sfx && window.sfx.playSwap();
    } else {
      cardInner.classList.remove('flipped');
      isCardFlipped = false;
    }
  }

  cardInner.parentElement.addEventListener('mousedown', () => toggleCard(true));
  cardInner.parentElement.addEventListener('mouseup', () => toggleCard(false));
  cardInner.parentElement.addEventListener('mouseleave', () => toggleCard(false));

  cardInner.parentElement.addEventListener('touchstart', (e) => {
    e.preventDefault();
    toggleCard(true);
  });
  cardInner.parentElement.addEventListener('touchend', (e) => {
    e.preventDefault();
    toggleCard(false);
  });

  fetch('/api/server-info')
    .then(res => res.json())
    .then(info => { serverInfo = info; })
    .catch(() => {});

  // 渲染房间主状态
  function renderRoom(room) {
    currentRoom = room;
    if (room && room.code) {
      localStorage.setItem('werewolf_room_code', room.code);
    }
    requestWakeLock();

    viewHome.classList.add('hidden');
    viewGame.classList.remove('hidden');
    if (btnLeaveRoom) btnLeaveRoom.classList.remove('hidden');

    const isGodMode = !!(room.settings && room.settings.isGodMode);
    const isGod = !!(room.myPlayer && room.myPlayer.isGod);

    modeTag.textContent = room.settings.mode === 'ONE_NIGHT' 
      ? '🌙 一夜终极模式' 
      : (isGodMode ? '⚖️ 线下上帝模式' : '🐺 经典多夜模式');
    roomCodeBadge.textContent = `房号: ${room.code}`;
    playersCountNum.textContent = room.players.length;

    // 1. 渲染我的专属身份卡面
    if (room.myPlayer && room.myPlayer.initialRole) {
      const roleDef = room.availableRoles[room.myPlayer.initialRole];
      if (roleDef) {
        myRoleIcon.textContent = roleDef.icon;
        myRoleName.textContent = roleDef.name;
        myRoleTeam.textContent = roleDef.team === 'WEREWOLF' ? '狼人阵营 🐺' : (roleDef.team === 'TANNER' ? '制皮匠 (独立求死) 🧟' : '好人村民阵营 🧑');
        myRoleDesc.textContent = roleDef.desc;
      }
    } else {
      myRoleIcon.textContent = '❓';
      myRoleName.textContent = isGod ? '法官/上帝' : '等待发牌';
      myRoleTeam.textContent = isGod ? '中立裁判' : '身份保密';
      myRoleDesc.textContent = isGod ? '您是本局线下法官，负责掌控全场节奏与提词。' : '长按翻牌可防偷窥查看自己的身份。';
    }

    // 2. 阶段横幅与描述
    renderPhaseBanner(room);

    // 3. 上帝模式 vs 常规模式分支处理
    const playersZone = document.querySelector('.players-zone');
    const myRoleZone = document.getElementById('my-role-zone');
    const actionFooterBar = document.getElementById('action-footer-bar');

    if (isGodMode && room.gameState.phase !== 'LOBBY') {
      if (isGod) {
        // 上帝总控台
        if (godConsoleZone) godConsoleZone.classList.remove('hidden');
        if (playerOfflineZone) playerOfflineZone.classList.add('hidden');
        if (playersZone) playersZone.classList.add('hidden');
        if (centerCardsZone) centerCardsZone.classList.add('hidden');
        if (myRoleZone) myRoleZone.classList.add('hidden');
        if (actionFooterBar) actionFooterBar.classList.add('hidden');
        renderGodConsole(room);
        return;
      } else {
        // 普通参战玩家极暗防窥视角
        if (godConsoleZone) godConsoleZone.classList.add('hidden');
        if (playerOfflineZone) playerOfflineZone.classList.remove('hidden');
        if (playersZone) playersZone.classList.add('hidden');
        if (centerCardsZone) centerCardsZone.classList.add('hidden');
        if (myRoleZone) myRoleZone.classList.remove('hidden');
        if (actionFooterBar) actionFooterBar.classList.add('hidden');
        renderPlayerOfflineZone(room);
        return;
      }
    }

    // 常规模式或准备大厅
    if (godConsoleZone) godConsoleZone.classList.add('hidden');
    if (playerOfflineZone) playerOfflineZone.classList.add('hidden');
    if (playersZone) playersZone.classList.remove('hidden');
    if (myRoleZone) myRoleZone.classList.remove('hidden');
    if (actionFooterBar) actionFooterBar.classList.remove('hidden');

    // 渲染玩家列表卡片
    renderPlayersGrid(room);

    // 一夜模式桌中底牌
    if (room.settings.mode === 'ONE_NIGHT' && room.gameState.phase !== 'LOBBY') {
      centerCardsZone.classList.remove('hidden');
    } else {
      centerCardsZone.classList.add('hidden');
    }

    // 大厅卡牌配置池预览
    if (room.deckPool && room.deckPool.length > 0 && room.gameState.phase === 'LOBBY') {
      if (deckPoolBox && deckPoolCount && deckPoolTags) {
        deckPoolBox.classList.remove('hidden');
        deckPoolCount.textContent = room.deckPool.length;
        deckPoolTags.innerHTML = '';
        room.deckPool.forEach(roleId => {
          const def = room.availableRoles[roleId] || { name: roleId, icon: '❓' };
          const tag = document.createElement('span');
          tag.className = 'deck-tag';
          tag.innerHTML = `<span>${def.icon}</span> <span>${def.name}</span>`;
          deckPoolTags.appendChild(tag);
        });
      }
    } else if (deckPoolBox) {
      deckPoolBox.classList.add('hidden');
    }

    // 操作控制面板
    renderControls(room);
  }

  let currentShooterId = null;

  // 上帝总控台渲染
  function renderGodConsole(room) {
    if (!godConsoleZone) return;

    if (godRoundBadge) godRoundBadge.textContent = `第 ${room.gameState.round || 1} 轮`;
    const phaseNames = {
      'LOBBY': '🏕️ 大厅组局',
      'NIGHT': '🌙 夜间巡查',
      'DAY_SHERIFF': '🏅 警长竞选',
      'DAY_DEATH_ANNOUNCE': '📢 宣读死讯',
      'DAY_DISCUSS': '🗣️ 白天讨论',
      'DAY_VOTING': '⚖️ 举手投票',
      'DAY_PK_DISCUSS': '⚔️ 平票PK陈词',
      'DAY_PK_VOTE': '🗳️ PK二次投票',
      'DAY_PEACE_DAY': '🕊️ 平安日',
      'GAME_OVER': '🎉 游戏结算'
    };
    if (godPhaseBadge) {
      godPhaseBadge.textContent = phaseNames[room.gameState.phase] || room.gameState.phase;
    }

    if (godFakeCallBanner) {
      if (room.gameState.isDeadFakeCall) {
        godFakeCallBanner.classList.remove('hidden');
      } else {
        godFakeCallBanner.classList.add('hidden');
      }
    }

    if (godPrompterText) {
      godPrompterText.textContent = room.gameState.currentSpeechScript || '请主持线下对局推进...';
    }

    renderGodWorkbench(room);
    renderGodSeatMatrix(room);
  }

  // 普通玩家极暗防窥界面
  function renderPlayerOfflineZone(room) {
    if (!playerOfflineZone) return;
    if (playerOfflineSeat) {
      playerOfflineSeat.textContent = `${room.myPlayer && room.myPlayer.seatNumber ? room.myPlayer.seatNumber : '?'} 号`;
    }
    if (playerOfflineSheriffBadge) {
      if (room.myPlayer && room.myPlayer.isSheriff) {
        playerOfflineSheriffBadge.classList.remove('hidden');
      } else {
        playerOfflineSheriffBadge.classList.add('hidden');
      }
    }
    if (playerOfflineStatusText) {
      if (!room.myPlayer || !room.myPlayer.isAlive) {
        playerOfflineStatusText.className = 'status-pill dead';
        playerOfflineStatusText.textContent = '☠️ 已出局';
      } else if (room.myPlayer.isImmuneExiled) {
        playerOfflineStatusText.className = 'status-pill alive';
        playerOfflineStatusText.textContent = '🃏 翻牌免死 (保留发言权，失去投票权)';
      } else {
        playerOfflineStatusText.className = 'status-pill alive';
        playerOfflineStatusText.textContent = '🟢 存活中';
      }
    }
  }

  // 上帝实时操作工作台
  function renderGodWorkbench(room) {
    if (!godActionsWorkbench) return;
    godActionsWorkbench.innerHTML = '';
    const phase = room.gameState.phase;
    const nightStep = room.gameState.activeNightStep;
    const playing = room.players.filter(p => p.id !== room.hostId);
    const alivePlayers = playing.filter(p => p.isAlive);

    const stepBox = document.createElement('div');
    stepBox.className = 'god-workbench-step';

    if (phase === 'NIGHT') {
      if (nightStep === 'NIGHT_FALL') {
        stepBox.innerHTML = `
          <div class="workbench-instruction">入夜念白完成，点击唤醒角色行动：</div>
          <button id="btn-god-wb-next" class="workbench-btn btn btn-gold btn-lg">唤醒角色行动 ➜</button>
        `;
        godActionsWorkbench.appendChild(stepBox);
        document.getElementById('btn-god-wb-next').onclick = () => {
          socket.emit('god_night_step', { roomCode: room.code, step: 'NIGHT_FALL' });
        };
      } else if (nightStep === 'GUARD') {
        let opts = `<option value="">-- 空守 (不守护任何人) --</option>`;
        alivePlayers.forEach(p => {
          opts += `<option value="${p.id}">${p.seatNumber}号 [${p.name}]</option>`;
        });
        stepBox.innerHTML = `
          <div class="workbench-instruction">守卫示意守护目标：</div>
          <div class="workbench-selector-group">
            <select id="select-god-guard" class="form-select">${opts}</select>
            <button id="btn-god-wb-guard" class="workbench-btn btn btn-primary btn-lg">守卫闭眼，下一角色 ➜</button>
          </div>
        `;
        godActionsWorkbench.appendChild(stepBox);
        document.getElementById('btn-god-wb-guard').onclick = () => {
          const targetId = document.getElementById('select-god-guard').value || null;
          socket.emit('god_night_step', { roomCode: room.code, step: 'GUARD', actionData: { targetId } });
        };
      } else if (nightStep === 'WEREWOLF') {
        let opts = `<option value="">-- 空刀 (今晚不杀人) --</option>`;
        alivePlayers.forEach(p => {
          opts += `<option value="${p.id}">${p.seatNumber}号 [${p.name}]</option>`;
        });
        stepBox.innerHTML = `
          <div class="workbench-instruction">狼人商议示意击杀目标：</div>
          <div class="workbench-selector-group">
            <select id="select-god-wolf" class="form-select">${opts}</select>
            <button id="btn-god-wb-wolf" class="workbench-btn btn btn-danger btn-lg">狼人闭眼，下一角色 ➜</button>
          </div>
        `;
        godActionsWorkbench.appendChild(stepBox);
        document.getElementById('btn-god-wb-wolf').onclick = () => {
          const targetId = document.getElementById('select-god-wolf').value || null;
          socket.emit('god_night_step', { roomCode: room.code, step: 'WEREWOLF', actionData: { targetId } });
        };
      } else if (nightStep === 'WITCH') {
        const wolfTargetId = room.gameState.nightRecord && room.gameState.nightRecord.wolfTarget;
        const wolfTargetPlayer = wolfTargetId ? playing.find(p => p.id === wolfTargetId) : null;
        let poisonOpts = `<option value="">-- 不使用毒药 --</option>`;
        alivePlayers.forEach(p => {
          poisonOpts += `<option value="${p.id}">${p.seatNumber}号 [${p.name}]</option>`;
        });
        stepBox.innerHTML = `
          <div class="workbench-instruction">女巫用药决策：</div>
          <div style="font-size:13px; color:#fbbf24; margin-bottom:6px;">
            ${wolfTargetPlayer ? `今晚中刀玩家: ${wolfTargetPlayer.seatNumber}号 [${wolfTargetPlayer.name}]` : '今晚无人中刀 (平安或空刀)'}
          </div>
          <div class="workbench-selector-group">
            <label style="font-size:12px; color:#94a3b8;">解药使用:</label>
            <select id="select-god-witch-save" class="form-select">
              <option value="">-- 不使用解药 --</option>
              ${wolfTargetPlayer ? `<option value="${wolfTargetPlayer.id}">使用解药救 ${wolfTargetPlayer.seatNumber}号</option>` : ''}
            </select>
            <label style="font-size:12px; color:#94a3b8; margin-top:4px;">毒药使用:</label>
            <select id="select-god-witch-poison" class="form-select">${poisonOpts}</select>
            <button id="btn-god-wb-witch" class="workbench-btn btn btn-primary btn-lg" style="margin-top:6px;">女巫闭眼，下一角色 ➜</button>
          </div>
        `;
        godActionsWorkbench.appendChild(stepBox);
        document.getElementById('btn-god-wb-witch').onclick = () => {
          const saveTarget = document.getElementById('select-god-witch-save').value || null;
          const poisonTarget = document.getElementById('select-god-witch-poison').value || null;
          socket.emit('god_night_step', {
            roomCode: room.code,
            step: 'WITCH',
            actionData: { saveTarget, poisonTarget }
          });
        };
      } else if (nightStep === 'SEER') {
        let seerOpts = ``;
        alivePlayers.forEach(p => {
          seerOpts += `<option value="${p.id}">${p.seatNumber}号 [${p.name}]</option>`;
        });
        stepBox.innerHTML = `
          <div class="workbench-instruction">预言家查验目标：</div>
          <div class="workbench-selector-group">
            <select id="select-god-seer" class="form-select">${seerOpts}</select>
            <button id="btn-god-wb-seer" class="workbench-btn btn btn-primary btn-lg">查验目标身份 ➜</button>
          </div>
        `;
        godActionsWorkbench.appendChild(stepBox);
        document.getElementById('btn-god-wb-seer').onclick = () => {
          const targetId = document.getElementById('select-god-seer').value;
          socket.emit('god_night_step', { roomCode: room.code, step: 'SEER', actionData: { targetId } }, (res) => {
            if (res && res.success && res.roleName) {
              if (godSeerFeedbackCard && godSeerFeedbackText) {
                godSeerFeedbackCard.classList.remove('hidden');
                godSeerFeedbackText.innerHTML = res.isWolf 
                  ? `<span style="color:#ef4444;">查杀 🔴 【狼人阵营】</span>`
                  : `<span style="color:#10b981;">金水 🟢 【好人阵营】</span>`;
              }
            }
          });
        };
      } else if (nightStep === 'NIGHT_END') {
        stepBox.innerHTML = `
          <div class="workbench-instruction">夜间行动全部完毕，确认核对后点击天亮结算：</div>
          <button id="btn-god-wb-dawn" class="workbench-btn btn btn-gold btn-lg">☀️ 天亮了，自动死伤结算 ➜</button>
        `;
        godActionsWorkbench.appendChild(stepBox);
        document.getElementById('btn-god-wb-dawn').onclick = () => {
          if (godSeerFeedbackCard) godSeerFeedbackCard.classList.add('hidden');
          socket.emit('god_announce_dawn', { roomCode: room.code });
        };
      }
    } else if (phase === 'DAY_SHERIFF') {
      let sheriffOpts = ``;
      alivePlayers.forEach(p => {
        sheriffOpts += `<option value="${p.id}">${p.seatNumber}号 [${p.name}]</option>`;
      });
      stepBox.innerHTML = `
        <div class="workbench-instruction">线下投票完成，选择当选警长的玩家：</div>
        <div class="workbench-selector-group">
          <select id="select-god-sheriff" class="form-select">${sheriffOpts}</select>
          <div class="workbench-buttons-row">
            <button id="btn-god-wb-badge" class="workbench-btn btn btn-gold">授予警徽 🏅</button>
            <button id="btn-god-wb-skip-sheriff" class="workbench-btn btn btn-secondary">无人竞选 / 跳过</button>
          </div>
        </div>
      `;
      godActionsWorkbench.appendChild(stepBox);
      document.getElementById('btn-god-wb-badge').onclick = () => {
        const targetId = document.getElementById('select-god-sheriff').value;
        socket.emit('god_sheriff_action', { roomCode: room.code, action: 'elect_badge', targetId });
      };
      document.getElementById('btn-god-wb-skip-sheriff').onclick = () => {
        socket.emit('god_sheriff_action', { roomCode: room.code, action: 'skip' });
      };
    } else if (phase === 'DAY_DEATH_ANNOUNCE') {
      const deadTonight = (room.gameState.dayRecord && room.gameState.dayRecord.deadTonight) || [];
      let deadHtml = '';
      if (deadTonight.length === 0) {
        deadHtml = `<div style="color:#10b981; font-weight:700; margin-bottom:8px;">昨夜为：平安夜（无人死亡）</div>`;
      } else {
        deadHtml = `<div style="color:#ef4444; font-weight:700; margin-bottom:8px;">昨夜出局：` + 
          deadTonight.map(p => `${p.seatNumber}号 [${p.name}]${p.canShoot ? ' 🔫(可开枪)' : ''}`).join('、') + `</div>`;
      }
      const canShootPlayer = deadTonight.find(p => p.canShoot);
      stepBox.innerHTML = `
        <div class="workbench-instruction">死讯公告与遗言阶段：</div>
        ${deadHtml}
        <div class="workbench-buttons-row">
          ${canShootPlayer ? `<button id="btn-god-wb-trigger-shoot" class="workbench-btn btn btn-danger">🔫 ${canShootPlayer.seatNumber}号开枪带人</button>` : ''}
          <button id="btn-god-wb-confirm-death" class="workbench-btn btn btn-primary btn-lg">死讯公告完毕，进入发言 ➜</button>
        </div>
      `;
      godActionsWorkbench.appendChild(stepBox);
      if (canShootPlayer) {
        document.getElementById('btn-god-wb-trigger-shoot').onclick = () => {
          openShootModal(canShootPlayer.id, `${canShootPlayer.seatNumber}号 [${canShootPlayer.name}]`);
        };
      }
      document.getElementById('btn-god-wb-confirm-death').onclick = () => {
        socket.emit('god_confirm_death', { roomCode: room.code });
      };
    } else if (phase === 'DAY_DISCUSS') {
      stepBox.innerHTML = `
        <div class="workbench-instruction">自由发言阶段（点击下方座次可切换当前发言人）：</div>
        <div class="workbench-buttons-row">
          <button id="btn-god-wb-explode" class="workbench-btn btn btn-danger">💥 狼人自爆</button>
          <button id="btn-god-wb-pk" class="workbench-btn btn btn-warning">⚖️ 发起平票PK</button>
          <button id="btn-god-wb-vote" class="workbench-btn btn btn-primary btn-lg">🗳️ 发言结束，进入投票 ➜</button>
        </div>
      `;
      godActionsWorkbench.appendChild(stepBox);
      document.getElementById('btn-god-wb-explode').onclick = openWolfExplodeModal;
      document.getElementById('btn-god-wb-pk').onclick = openPkSetupModal;
      document.getElementById('btn-god-wb-vote').onclick = () => {
        socket.emit('god_start_vote', { roomCode: room.code });
      };
    } else if (phase === 'DAY_VOTING') {
      let voteOpts = ``;
      alivePlayers.forEach(p => {
        voteOpts += `<option value="${p.id}">${p.seatNumber}号 [${p.name}]</option>`;
      });
      stepBox.innerHTML = `
        <div class="workbench-instruction">线下举手票决统计：</div>
        <div class="workbench-selector-group">
          <label style="font-size:12px; color:#cbd5e1;">最高票出局者:</label>
          <select id="select-god-voted-player" class="form-select">${voteOpts}</select>
          <div class="workbench-buttons-row">
            <button id="btn-god-wb-confirm-vote" class="workbench-btn btn btn-danger btn-lg">确认处决该玩家出局 ➜</button>
            <button id="btn-god-wb-peace-day" class="workbench-btn btn btn-secondary">平票判定平安日 🕊️</button>
          </div>
        </div>
      `;
      godActionsWorkbench.appendChild(stepBox);
      document.getElementById('btn-god-wb-confirm-vote').onclick = () => {
        const targetPlayerId = document.getElementById('select-god-voted-player').value;
        socket.emit('god_vote_execute', { roomCode: room.code, targetPlayerId }, (res) => {
          if (res) {
            if (res.isIdiotImmune) {
              showToast('🃏 该玩家为白痴，翻牌免死成功！保留发言权，永久失去投票权！');
            } else if (res.isSheriffDead) {
              openBadgeTransferModal();
            } else if (res.canShoot) {
              openShootModal(targetPlayerId);
            }
          }
        });
      };
      document.getElementById('btn-god-wb-peace-day').onclick = () => {
        socket.emit('god_peace_day', { roomCode: room.code });
      };
    } else if (phase === 'DAY_PK_DISCUSS') {
      stepBox.innerHTML = `
        <div class="workbench-instruction">平票 PK 陈词进行中：</div>
        <div class="workbench-buttons-row">
          <button id="btn-god-wb-start-pk-vote" class="workbench-btn btn btn-primary btn-lg">🗳️ PK发言结束，进入二次投票 ➜</button>
          <button id="btn-god-wb-peace-day-pk" class="workbench-btn btn btn-secondary">判定平安日 🕊️</button>
        </div>
      `;
      godActionsWorkbench.appendChild(stepBox);
      document.getElementById('btn-god-wb-start-pk-vote').onclick = () => {
        socket.emit('god_start_vote', { roomCode: room.code });
      };
      document.getElementById('btn-god-wb-peace-day-pk').onclick = () => {
        socket.emit('god_peace_day', { roomCode: room.code });
      };
    } else if (phase === 'DAY_PK_VOTE') {
      const candidates = (room.gameState.dayRecord && room.gameState.dayRecord.pkCandidates) || [];
      const candPlayers = playing.filter(p => candidates.includes(p.id) && p.isAlive);
      let pkOpts = ``;
      candPlayers.forEach(p => {
        pkOpts += `<option value="${p.id}">${p.seatNumber}号 [${p.name}]</option>`;
      });
      stepBox.innerHTML = `
        <div class="workbench-instruction">二次投票统计：</div>
        <div class="workbench-selector-group">
          <select id="select-god-pk-voted" class="form-select">${pkOpts}</select>
          <div class="workbench-buttons-row">
            <button id="btn-god-wb-execute-pk-vote" class="workbench-btn btn btn-danger btn-lg">确认处决该玩家 ➜</button>
            <button id="btn-god-wb-pk-peace" class="workbench-btn btn btn-secondary">再次平票判定平安日 🕊️</button>
          </div>
        </div>
      `;
      godActionsWorkbench.appendChild(stepBox);
      document.getElementById('btn-god-wb-execute-pk-vote').onclick = () => {
        const targetPlayerId = document.getElementById('select-god-pk-voted').value;
        socket.emit('god_vote_execute', { roomCode: room.code, targetPlayerId }, (res) => {
          if (res) {
            if (res.isIdiotImmune) {
              showToast('🃏 该玩家为白痴，翻牌免死成功！');
            } else if (res.isSheriffDead) {
              openBadgeTransferModal();
            } else if (res.canShoot) {
              openShootModal(targetPlayerId);
            }
          }
        });
      };
      document.getElementById('btn-god-wb-pk-peace').onclick = () => {
        socket.emit('god_peace_day', { roomCode: room.code });
      };
    } else if (phase === 'DAY_PEACE_DAY' || room.gameState.dayRecord.executedToday) {
      stepBox.innerHTML = `
        <div class="workbench-instruction">今日白天流程已全部结束：</div>
        <button id="btn-god-wb-enter-next-night" class="workbench-btn btn btn-gold btn-lg">🌙 天黑请闭眼，进入下一夜 ➜</button>
      `;
      godActionsWorkbench.appendChild(stepBox);
      document.getElementById('btn-god-wb-enter-next-night').onclick = () => {
        socket.emit('god_enter_next_night', { roomCode: room.code });
      };
    } else if (phase === 'GAME_OVER') {
      stepBox.innerHTML = `
        <div class="workbench-instruction" style="color:#fbbf24; font-size:16px;">🎉 对局终结：${room.gameState.winnerRole}</div>
        <button id="btn-god-wb-redeal" class="workbench-btn btn btn-gold btn-lg">🎴 重新随机洗牌发牌</button>
      `;
      godActionsWorkbench.appendChild(stepBox);
      document.getElementById('btn-god-wb-redeal').onclick = () => {
        socket.emit('god_redeal', { roomCode: room.code });
      };
    }
  }

  // 上帝全知座次大盘
  function renderGodSeatMatrix(room) {
    if (!godSeatMatrix) return;
    godSeatMatrix.innerHTML = '';
    const playing = room.players.filter(p => p.id !== room.hostId);
    const phase = room.gameState.phase;

    playing.forEach(p => {
      const card = document.createElement('div');
      const isAlive = p.isAlive;
      const isSpeaker = room.gameState.currentSpeakerId === p.id;
      card.className = `god-seat-card ${isAlive ? '' : 'dead'} ${isSpeaker ? 'speaker' : ''}`;

      const roleDef = room.availableRoles[p.initialRole] || { name: p.initialRole || '未知', icon: '❓', team: 'VILLAGER' };
      const roleTeamClass = (roleDef.team === 'WEREWOLF') ? 'wolf' : (roleDef.team === 'VILLAGER' && ['SEER', 'WITCH', 'HUNTER', 'GUARD', 'IDIOT'].includes(p.initialRole) ? 'god' : 'villager');

      card.innerHTML = `
        <div class="god-seat-top">
          <span class="seat-num-badge">${p.seatNumber}号</span>
          <span class="seat-player-name">${p.name}</span>
        </div>
        <div>
          <span class="seat-role-pill ${roleTeamClass}">${roleDef.icon} ${roleDef.name}</span>
        </div>
        <div class="seat-tags-row">
          ${p.isSheriff ? '<span class="seat-tag sheriff">🏅 警长</span>' : ''}
          ${p.canShoot ? '<span class="seat-tag shoot">🔫 可开枪</span>' : ''}
          ${p.isImmuneExiled ? '<span class="seat-tag idiot">🃏 免死</span>' : ''}
          ${!isAlive ? '<span class="seat-tag" style="background:#dc2626; color:#fff;">☠️ 出局</span>' : ''}
        </div>
      `;

      if (phase === 'DAY_DISCUSS' && isAlive) {
        card.onclick = () => {
          socket.emit('god_select_speaker', { roomCode: room.code, playerId: p.id });
        };
      }

      godSeatMatrix.appendChild(card);
    });
  }

  // 弹窗开启辅助方法
  function openBadgeTransferModal() {
    if (!modalBadgeTransfer || !currentRoom) return;
    const living = currentRoom.players.filter(p => p.id !== currentRoom.hostId && p.isAlive);
    selectBadgeSuccessor.innerHTML = living.map(p => `<option value="${p.id}">${p.seatNumber}号 [${p.name}]</option>`).join('');
    modalBadgeTransfer.classList.remove('hidden');
  }

  function openShootModal(shooterId, shooterName) {
    if (!modalShootKill || !currentRoom) return;
    currentShooterId = shooterId;
    if (shooterName && shootKillPrompt) {
      shootKillPrompt.textContent = `${shooterName} 可发动出局开枪技能，请询问线下带人目标：`;
    }
    const living = currentRoom.players.filter(p => p.id !== currentRoom.hostId && p.isAlive && p.id !== shooterId);
    selectShootTarget.innerHTML = living.map(p => `<option value="${p.id}">${p.seatNumber}号 [${p.name}]</option>`).join('');
    modalShootKill.classList.remove('hidden');
  }

  function openWolfExplodeModal() {
    if (!modalWolfExplode || !currentRoom) return;
    const wolves = currentRoom.players.filter(p => p.id !== currentRoom.hostId && p.isAlive && ['WEREWOLF', 'WHITE_WOLF', 'WOLF_KING'].includes(p.initialRole));
    selectExplodeWolf.innerHTML = wolves.map(p => `<option value="${p.id}">${p.seatNumber}号 [${p.name}] (${p.initialRole === 'WHITE_WOLF' ? '白狼王' : '狼人'})</option>`).join('');

    const others = currentRoom.players.filter(p => p.id !== currentRoom.hostId && p.isAlive);
    selectExplodeVictim.innerHTML = `<option value="">-- 普通狼自爆 (不带人，直接入夜) --</option>` +
      others.map(p => `<option value="${p.id}">带走 ${p.seatNumber}号 [${p.name}] (仅白狼王)</option>`).join('');

    modalWolfExplode.classList.remove('hidden');
  }

  function openPkSetupModal() {
    if (!modalPkSetup || !currentRoom) return;
    const living = currentRoom.players.filter(p => p.id !== currentRoom.hostId && p.isAlive);
    pkCandidatesCheckboxes.innerHTML = living.map(p => `
      <label class="checkbox-item">
        <input type="checkbox" value="${p.id}" class="pk-candidate-cb">
        <span>${p.seatNumber}号 [${p.name}]</span>
      </label>
    `).join('');
    modalPkSetup.classList.remove('hidden');
  }

  function renderPhaseBanner(room) {
    const phase = room.gameState.phase;
    phaseTimer.classList.remove('hidden');

    if (phase === 'LOBBY') {
      phaseTitle.textContent = '🏕️ 游戏大厅';
      phaseDesc.textContent = room.myPlayer && room.myPlayer.isHost ? '房主可添加电脑，人齐后点击开始游戏' : '等待房主开始游戏...';
      phaseTimer.classList.add('hidden');
    } else if (phase === 'NIGHT') {
      phaseTitle.textContent = '🌙 天黑请闭眼';
      const step = room.gameState.activeNightStep;
      if (step) {
        const stepDef = room.availableRoles[step];
        phaseDesc.textContent = `当前醒来行动: ${stepDef ? stepDef.name + ' ' + stepDef.icon : step}`;
      } else {
        phaseDesc.textContent = '夜幕降临，迷雾笼罩村庄...';
      }
    } else if (phase === 'DAY_DISCUSSION') {
      phaseTitle.textContent = '☀️ 天亮了 · 自由辩论';
      phaseDesc.textContent = '请结合夜晚记忆、底牌线索与身份对调疑云展开辩论！';
    } else if (phase === 'VOTING') {
      phaseTitle.textContent = '⚖️ 投票处决阶段';
      phaseDesc.textContent = '请在上方点击选择你要投票处决的目标！';
    } else if (phase === 'GAME_OVER') {
      phaseTitle.textContent = '🎉 游戏结算';
      phaseDesc.textContent = `${room.gameState.winnerRole}！`;
      phaseTimer.classList.add('hidden');
    }
  }

  function renderPlayersGrid(room) {
    playersGrid.innerHTML = '';
    const phase = room.gameState.phase;

    room.players.forEach(p => {
      const el = document.createElement('div');
      const isMe = p.id === room.myPlayerId;
      const isSelectable = (phase === 'VOTING' && !isMe) ||
        (phase === 'NIGHT' && room.gameState.activeNightStep && room.myPlayer && room.myPlayer.initialRole === room.gameState.activeNightStep);

      const isSelected = (selectedTargetId === p.id) || (selectedTroubleTarget1 === p.id) || (selectedTroubleTarget2 === p.id);

      el.className = `player-card ${isSelectable ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`;
      el.innerHTML = `
        <div class="player-avatar-circle">${p.avatar}</div>
        <div class="player-name-text">${p.name} ${isMe ? '(我)' : ''}</div>
        ${p.isHost ? '<span class="badge-host">👑</span>' : ''}
        ${p.isAi ? '<span class="badge-voted" style="background:#475569;">AI</span>' : ''}
        ${p.hasVoted && phase === 'VOTING' ? '<span class="badge-voted">已投</span>' : ''}
      `;

      if (isSelectable) {
        el.addEventListener('click', () => handlePlayerSelection(p.id));
      }

      playersGrid.appendChild(el);
    });
  }

  function handlePlayerSelection(targetId) {
    const phase = currentRoom.gameState.phase;
    if (phase === 'VOTING') {
      selectedTargetId = targetId;
      btnConfirmVote.disabled = false;
      renderPlayersGrid(currentRoom);
      window.sfx && window.sfx.playVote();
    } else if (phase === 'NIGHT') {
      const myRole = currentRoom.myPlayer && currentRoom.myPlayer.initialRole;
      if (myRole === 'SEER') {
        selectedTargetId = targetId;
        // 清空底牌多选
        selectedCenterIndices = [];
        updateCenterCardSelection();
        renderPlayersGrid(currentRoom);
      } else if (myRole === 'ROBBER') {
        selectedTargetId = targetId;
        renderPlayersGrid(currentRoom);
      } else if (myRole === 'TROUBLEMAKER') {
        if (!selectedTroubleTarget1) {
          selectedTroubleTarget1 = targetId;
        } else if (!selectedTroubleTarget2 && targetId !== selectedTroubleTarget1) {
          selectedTroubleTarget2 = targetId;
        } else {
          selectedTroubleTarget1 = targetId;
          selectedTroubleTarget2 = null;
        }
        renderPlayersGrid(currentRoom);
      }
    }
  }

  // 桌中底牌点击交互 (支持预言家选2张，醉鬼/独狼选1张)
  centerCardItems.forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index, 10);
      const myRole = currentRoom && currentRoom.myPlayer && currentRoom.myPlayer.initialRole;
      const step = currentRoom && currentRoom.gameState && currentRoom.gameState.activeNightStep;

      if (step === 'SEER' && myRole === 'SEER') {
        selectedTargetId = null; // 清空查验玩家选择
        renderPlayersGrid(currentRoom);

        if (selectedCenterIndices.includes(idx)) {
          selectedCenterIndices = selectedCenterIndices.filter(x => x !== idx);
        } else {
          if (selectedCenterIndices.length >= 2) {
            selectedCenterIndices.shift();
          }
          selectedCenterIndices.push(idx);
        }
        updateCenterCardSelection();
      } else {
        selectedCenterIndices = [idx];
        selectedCenterIndex = idx;
        updateCenterCardSelection();
      }
    });
  });

  function updateCenterCardSelection() {
    centerCardItems.forEach(x => {
      const i = parseInt(x.dataset.index, 10);
      if (selectedCenterIndices.includes(i)) {
        x.classList.add('selected');
      } else {
        x.classList.remove('selected');
      }
    });
  }

  function renderControls(room) {
    panelLobby.classList.add('hidden');
    panelNightAction.classList.add('hidden');
    panelDiscussion.classList.add('hidden');
    panelVoting.classList.add('hidden');

    const phase = room.gameState.phase;
    const isHost = room.myPlayer && room.myPlayer.isHost;

    if (phase === 'LOBBY') {
      panelLobby.classList.remove('hidden');
      if (isHost) {
        btnAddAi.classList.remove('hidden');
        btnStartGame.classList.remove('hidden');
        if (btnRemoveAi) {
          const hasAi = room.players.some(p => p.isAi);
          if (hasAi) btnRemoveAi.classList.remove('hidden');
          else btnRemoveAi.classList.add('hidden');
        }
      } else {
        btnAddAi.classList.add('hidden');
        btnStartGame.classList.add('hidden');
        if (btnRemoveAi) btnRemoveAi.classList.add('hidden');
      }
    } else if (phase === 'NIGHT') {
      const myRole = room.myPlayer && room.myPlayer.initialRole;
      const step = room.gameState.activeNightStep;
      if (myRole && myRole === step) {
        panelNightAction.classList.remove('hidden');
        nightActionPrompt.textContent = getActionPromptText(myRole);

        if (btnSkipRobber) {
          if (myRole === 'ROBBER') btnSkipRobber.classList.remove('hidden');
          else btnSkipRobber.classList.add('hidden');
        }
      }
    } else if (phase === 'DAY_DISCUSSION') {
      panelDiscussion.classList.remove('hidden');
      if (isHost) {
        btnAdvanceVoting.classList.remove('hidden');
        if (btnExtendDiscussion) btnExtendDiscussion.classList.remove('hidden');
      } else {
        btnAdvanceVoting.classList.add('hidden');
        if (btnExtendDiscussion) btnExtendDiscussion.classList.add('hidden');
      }
    } else if (phase === 'VOTING') {
      panelVoting.classList.remove('hidden');
    }
  }

  function getActionPromptText(role) {
    if (role === 'WEREWOLF') return '🐺 狼人请确认同伴。若是独狼可点击查看一张底牌！';
    if (role === 'MINION') return '🦹 爪牙效忠于恶狼，请查看谁是狼人同伴！';
    if (role === 'SEER') return '🔮 预言家：请在上方点击查验一名玩家，或选择两张底牌！';
    if (role === 'ROBBER') return '🥷 强盗：点击选择一名玩家对调身份并查看新牌，或点击放弃！';
    if (role === 'TROUBLEMAKER') return '🃏 捣蛋鬼：点击选择另外两名玩家调换其身份！';
    if (role === 'DRUNK') return '🍸 醉鬼：点击下方任意一张底牌与之调换！';
    if (role === 'INSOMNIAC') return '👀 失眠者：点击确认查看自己目前的最终牌！';
    return '请执行你的夜晚行动。';
  }

  // 倒计时刷新
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!currentRoom || !currentRoom.gameState.timerDeadline) return;
    const remain = Math.max(0, Math.ceil((currentRoom.gameState.timerDeadline - Date.now()) / 1000));
    phaseTimer.textContent = `${remain}s`;
  }, 1000);

  // 按钮交互绑定
  initProfileUI();

  btnCreateRoom.addEventListener('click', () => {
    const selectedMode = document.querySelector('input[name="game-mode"]:checked').value;
    const isClassic = selectedMode === 'CLASSIC';
    const isGodMode = isClassic && settingIsGodMode && settingIsGodMode.checked;

    const settings = {
      isGodMode: !!isGodMode,
      mode: isClassic ? 'CLASSIC' : 'ONE_NIGHT',
      boardPreset: settingBoardPreset ? settingBoardPreset.value : '9_STANDARD',
      firstDaySheriffTiming: settingFirstDaySheriffTiming ? settingFirstDaySheriffTiming.value : 'BEFORE_DEATH_ANNOUNCE',
      hasSheriff: settingHasSheriff ? settingHasSheriff.value === 'true' : true,
      witchSelfSave: settingWitchSelfSave ? settingWitchSelfSave.value : 'FIRST_NIGHT_ONLY',
      guardWitchConflict: settingGuardWitchConflict ? settingGuardWitchConflict.value : 'DIE',
      winCondition: settingWinCondition ? settingWinCondition.value : 'KILL_SIDE'
    };

    socket.emit('create_room', {
      id: myPlayerId,
      name: myNickname,
      avatar: myAvatar,
      settings
    }, (res) => {
      if (res && res.success) {
        localStorage.setItem('werewolf_room_code', res.roomCode);
        window.history.replaceState(null, '', `?room=${res.roomCode}`);
      }
    });
  });

  btnJoinRoom.addEventListener('click', () => {
    const code = roomCodeInput.value.trim();
    if (code.length !== 4) {
      alert('请输入 4 位房间号');
      return;
    }
    joinRoomByCode(code);
  });

  function joinRoomByCode(code) {
    socket.emit('join_room', {
      roomCode: code,
      player: {
        id: myPlayerId,
        name: myNickname,
        avatar: myAvatar
      }
    }, (res) => {
      if (res && res.success) {
        window.history.replaceState(null, '', `?room=${code}`);
      } else {
        alert((res && res.message) || '加入失败');
      }
    });
  }

  btnAddAi.addEventListener('click', () => {
    socket.emit('add_ai', (res) => {
      if (res && !res.success) showToast(res.message);
    });
  });

  if (btnRemoveAi) {
    btnRemoveAi.addEventListener('click', () => {
      if (!currentRoom) return;
      const lastAi = [...currentRoom.players].reverse().find(p => p.isAi);
      if (lastAi) {
        socket.emit('kick_player', lastAi.id);
      }
    });
  }

  btnStartGame.addEventListener('click', () => {
    socket.emit('start_game', (res) => {
      if (res && !res.success) showToast(res.message);
    });
  });

  btnAdvanceVoting.addEventListener('click', () => {
    socket.emit('advance_to_voting');
  });

  if (btnExtendDiscussion) {
    btnExtendDiscussion.addEventListener('click', () => {
      socket.emit('extend_discussion');
    });
  }

  if (btnSkipRobber) {
    btnSkipRobber.addEventListener('click', () => {
      socket.emit('night_action', { skip: true }, (res) => {
        if (res && res.result) {
          showNightResult('🥷 强盗行动', `
            <div class="result-role-badge">
              <div class="r-icon">🥷</div>
              <div class="r-name">保持原样</div>
            </div>
            <div class="result-desc-text">${res.result}</div>
          `);
          panelNightAction.classList.add('hidden');
        }
      });
    });
  }

  // 夜晚技能提交
  btnConfirmNight.addEventListener('click', () => {
    const myRole = currentRoom && currentRoom.myPlayer && currentRoom.myPlayer.initialRole;
    let payload = {};

    if (myRole === 'SEER') {
      if (selectedTargetId) {
        payload = { type: 'PLAYER', targetId: selectedTargetId };
      } else if (selectedCenterIndices.length > 0) {
        payload = { type: 'CENTER', indices: selectedCenterIndices };
      } else {
        showToast('🔮 请点击一位玩家或点击两张底牌查验！');
        return;
      }
    } else if (myRole === 'ROBBER') {
      if (!selectedTargetId) {
        showToast('🥷 请选择要偷换的玩家，或点击放弃偷换！');
        return;
      }
      payload = { targetId: selectedTargetId };
    } else if (myRole === 'TROUBLEMAKER') {
      if (!selectedTroubleTarget1 || !selectedTroubleTarget2) {
        showToast('🃏 请先选择两名要调换的玩家！');
        return;
      }
      payload = { target1: selectedTroubleTarget1, target2: selectedTroubleTarget2 };
    } else if (myRole === 'DRUNK') {
      if (selectedCenterIndex === null && selectedCenterIndices.length === 0) {
        showToast('🍸 请选择一张底牌进行盲换！');
        return;
      }
      payload = { centerIndex: (selectedCenterIndices[0] !== undefined) ? selectedCenterIndices[0] : selectedCenterIndex };
    } else if (myRole === 'INSOMNIAC') {
      payload = {};
    } else if (myRole === 'WEREWOLF') {
      payload = { centerIndex: (selectedCenterIndices[0] !== undefined) ? selectedCenterIndices[0] : (selectedCenterIndex || 0) };
    }

    socket.emit('night_action', payload, (res) => {
      if (res && res.result) {
        panelNightAction.classList.add('hidden');
        if (res.type === 'PLAYER' && res.role) {
          showNightResult('🔮 预言家查验结果', `
            <div style="font-size:14px; color:#cbd5e1;">查验目标: <strong>${res.targetName}</strong></div>
            <div class="result-role-badge">
              <div class="r-icon">${res.role.icon}</div>
              <div class="r-name">${res.role.name}</div>
              <div class="role-team-tag">${res.role.team === 'WEREWOLF' ? '狼人阵营 🐺' : (res.role.team === 'TANNER' ? '制皮匠 🧟' : '好人村民 🧑')}</div>
            </div>
            <div class="result-desc-text">${res.result}</div>
          `);
        } else if (res.type === 'CENTER' && res.cards) {
          const cardsHtml = res.cards.map(c => `
            <div class="result-role-badge" style="min-width:110px;">
              <div style="font-size:11px; color:#94a3b8;">底牌 ${c.index + 1}</div>
              <div class="r-icon">${c.role.icon}</div>
              <div class="r-name">${c.role.name}</div>
            </div>
          `).join('');
          showNightResult('🔮 预言家底牌查验', `
            <div style="display:flex; gap:12px; justify-content:center;">${cardsHtml}</div>
            <div class="result-desc-text">${res.result}</div>
          `);
        } else if (res.type === 'SWAP' && res.newRole) {
          showNightResult('🥷 强盗偷换结果', `
            <div style="font-size:14px; color:#cbd5e1;">你偷换了 <strong>[${res.targetName}]</strong> 的身份牌！</div>
            <div class="result-role-badge">
              <div style="font-size:11px; color:#fbbf24;">你的新身份</div>
              <div class="r-icon">${res.newRole.icon}</div>
              <div class="r-name">${res.newRole.name}</div>
              <div class="role-team-tag">${res.newRole.team === 'WEREWOLF' ? '狼人阵营 🐺' : (res.newRole.team === 'TANNER' ? '制皮匠 🧟' : '好人村民 🧑')}</div>
            </div>
            <div class="result-desc-text">${res.result}</div>
          `);
        } else if (res.type === 'INSOMNIAC' && res.role) {
          showNightResult('👀 失眠者确认身份', `
            <div class="result-role-badge">
              <div style="font-size:11px; color:#fbbf24;">你目前的最终身份</div>
              <div class="r-icon">${res.role.icon}</div>
              <div class="r-name">${res.role.name}</div>
              <div class="role-team-tag">${res.role.team === 'WEREWOLF' ? '狼人阵营 🐺' : (res.role.team === 'TANNER' ? '制皮匠 🧟' : '好人村民 🧑')}</div>
            </div>
            <div class="result-desc-text">${res.result}</div>
          `);
        } else if (res.type === 'WEREWOLF_CENTER' && res.role) {
          showNightResult('🐺 独狼偷看底牌', `
            <div class="result-role-badge">
              <div style="font-size:11px; color:#94a3b8;">底牌 ${res.centerIndex + 1}</div>
              <div class="r-icon">${res.role.icon}</div>
              <div class="r-name">${res.role.name}</div>
            </div>
            <div class="result-desc-text">${res.result}</div>
          `);
        } else {
          showNightResult('🌙 行动完成', `
            <div class="result-desc-text" style="font-size:15px; margin: 15px 0;">${res.result}</div>
          `);
        }
      }
    });
  });

  if (btnCloseResult) btnCloseResult.addEventListener('click', () => modalNightResult.classList.add('hidden'));
  if (btnAckResult) btnAckResult.addEventListener('click', () => modalNightResult.classList.add('hidden'));

  // 投票处决
  btnConfirmVote.addEventListener('click', () => {
    if (!selectedTargetId) return;
    socket.emit('cast_vote', selectedTargetId);
    btnConfirmVote.disabled = true;
    btnConfirmVote.textContent = '已投出处决票';
    window.sfx && window.sfx.playGavel();
  });

  btnPlayAgain.addEventListener('click', () => {
    modalSettle.classList.add('hidden');
    socket.emit('play_again');
  });

  // 扫码弹窗
  btnQuickInvite.addEventListener('click', () => {
    if (!currentRoom) return;
    openShareModal(currentRoom.code);
  });
  btnCloseShare.addEventListener('click', () => modalShare.classList.add('hidden'));

  btnCopyShareLink.addEventListener('click', () => {
    shareLinkInput.select();
    navigator.clipboard.writeText(shareLinkInput.value).then(() => {
      btnCopyShareLink.textContent = '已复制！';
      setTimeout(() => { btnCopyShareLink.textContent = '复制链接'; }, 1500);
    });
  });

  function openShareModal(roomCode) {
    modalShare.classList.remove('hidden');
    shareNetworkOptions.innerHTML = '';

    const isPublic = window.location.protocol === 'https:' ||
      (!['localhost', '127.0.0.1'].includes(window.location.hostname) &&
       !window.location.hostname.startsWith('192.168.') &&
       !window.location.hostname.startsWith('10.'));

    function buildUrl(base) {
      return `${base}/werewolf/?room=${roomCode}`;
    }

    if (isPublic) {
      const pubUrl = buildUrl(window.location.origin);
      const card = document.createElement('div');
      card.style.cssText = `padding: 12px; background: rgba(168,85,247,0.12); border: 1px solid rgba(168,85,247,0.35); border-radius: 8px; text-align: center; margin-bottom: 8px;`;
      card.innerHTML = `
        <div style="font-weight:700; color:#d8b4fe; font-size:13px; word-break: break-all;">${pubUrl}</div>
        <div style="font-size:11px; color:#94a3b8; margin-top: 4px;">✨ 专属房间链接已生成 · 微信或手机扫码即入</div>
      `;
      shareNetworkOptions.appendChild(card);
      drawQR(pubUrl);
      return;
    }

    if (serverInfo && serverInfo.ipObjs) {
      serverInfo.ipObjs.forEach(item => {
        const itemUrl = buildUrl(`http://${item.address}:${serverInfo.port}`);
        const card = document.createElement('div');
        card.style.cssText = `padding: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; cursor: pointer; display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;`;
        card.innerHTML = `
          <div>
            <div style="font-weight:700; color:#fff; font-size:13px;">${itemUrl}</div>
            <div style="font-size:11px; color:#94a3b8;">${item.name}</div>
          </div>
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;">生成此码</button>
        `;
        card.addEventListener('click', () => drawQR(itemUrl));
        shareNetworkOptions.appendChild(card);
      });
    }

    drawQR(buildUrl(window.location.origin));
  }

  function drawQR(url) {
    shareLinkInput.value = url;
    const container = document.getElementById('qrcode-container');
    container.innerHTML = '';
    if (window.QRCode) {
      new window.QRCode(container, {
        text: url,
        width: 180,
        height: 180,
        colorDark: '#000000',
        colorLight: '#ffffff'
      });
    }
  }

  // 规则弹窗
  btnRules.addEventListener('click', () => modalRules.classList.remove('hidden'));
  btnCloseRules.addEventListener('click', () => modalRules.classList.add('hidden'));

  // 音效开关
  btnSound.addEventListener('click', () => {
    const enabled = window.sfx && window.sfx.toggleSound();
    btnSound.textContent = enabled ? '🔊' : '🔇';
  });

  // Socket 核心事件
  socket.on('room_update', (room) => {
    renderRoom(room);
  });

  socket.on('night_fallen', () => {
    window.sfx && window.sfx.playHowl();
    window.sfx && window.sfx.speak('夜幕降临，天黑请闭眼。');
  });

  socket.on('night_step_start', ({ role, duration }) => {
    selectedTargetId = null;
    selectedCenterIndices = [];
    selectedCenterIndex = null;
    selectedTroubleTarget1 = null;
    selectedTroubleTarget2 = null;
    updateCenterCardSelection();

    const announcerLines = {
      WEREWOLF: '狼人请睁眼，确认你的狼同伴。若是独狼可查看一张底牌。',
      MINION: '爪牙请睁眼，确认谁是恶狼同伴。',
      SEER: '预言家请睁眼，查验一名玩家或两张底牌。',
      ROBBER: '强盗请睁眼，选择一名玩家交换并查看新身份。',
      TROUBLEMAKER: '捣蛋鬼请睁眼，调换另外两名玩家的身份。',
      DRUNK: '醉鬼请睁眼，盲换一张桌中底牌。',
      INSOMNIAC: '失眠者请睁眼，查看自己最终的身份。'
    };
    if (announcerLines[role] && window.sfx) {
      window.sfx.speak(announcerLines[role]);
    }
  });

  socket.on('my_role_night_turn', ({ role, privateData }) => {
    privateRoleData = privateData;
    if (role === 'WEREWOLF') {
      if (privateData.isLoneWolf) {
        showToast('🐺 你是唯一的独狼！可点击一张底牌查看。');
        nightActionPrompt.textContent = '🐺 你是唯一的独狼！请点击下方一张底牌，然后点击确认行动查看。';
      } else {
        const partnerNames = (privateData.otherWolves || []).map(p => `${p.name} ${p.avatar}`).join('、');
        showToast(`🐺 你的狼同伴是：${partnerNames}！`);
        nightActionPrompt.textContent = `🐺 你的狼同伴是：${partnerNames}！请保持眼神默契。`;
      }
    } else if (role === 'MINION') {
      const wolfNames = (privateData.werewolves || []).map(w => `${w.name} ${w.avatar}`).join('、');
      showToast(wolfNames ? `🦹 效忠恶狼！场上恶狼是：${wolfNames}` : '🦹 今晚双狼都在底牌！');
      nightActionPrompt.textContent = wolfNames ? `🦹 效忠恶狼！场上恶狼是：${wolfNames}。请掩护他们！` : '🦹 今晚双狼都在底牌！请全力伪装！';
    } else if (role === 'INSOMNIAC') {
      nightActionPrompt.textContent = '👀 点击确认行动，查看你今晚最新的最终身份牌！';
    }
  });

  socket.on('discussion_extended', ({ seconds }) => {
    showToast(`⏳ 白天辩论已延长 ${seconds} 秒！`);
    window.sfx && window.sfx.speak('辩论时间延长一分钟，请各位玩家继续发言。');
  });

  socket.on('day_dawn', ({ message }) => {
    window.sfx && window.sfx.playDawn();
    window.sfx && window.sfx.speak('天亮了，公鸡打鸣，请全员睁眼开始辩论！');
    if (modalNightResult) modalNightResult.classList.add('hidden');
  });

  socket.on('voting_started', () => {
    window.sfx && window.sfx.playGavel();
    window.sfx && window.sfx.speak('讨论时间结束，请大家投票处决恶狼！');
    showToast('⚖️ 投票开始！请在上方选择你要处决的目标！');
  });

  socket.on('game_settled', ({ winnerTeam, winnerRole, executed, nightLogs, centerCards }) => {
    settleWinner.textContent = winnerRole;
    window.sfx && window.sfx.playWin();
    window.sfx && window.sfx.speak(winnerRole);

    // 处决名单
    settleExecutedList.innerHTML = '';
    if (executed && executed.length > 0) {
      executed.forEach(id => {
        const p = currentRoom.players.find(x => x.id === id);
        const tag = document.createElement('span');
        tag.className = 'role-team-tag';
        tag.style.background = '#ef4444';
        tag.textContent = `💀 ${p ? p.name : id}`;
        settleExecutedList.appendChild(tag);
      });
    } else {
      settleExecutedList.textContent = '🕊️ 全员平票或弃投，本局无人被处死';
    }

    // 夜晚事件日志
    settleLogsList.innerHTML = '';
    if (nightLogs && nightLogs.length > 0) {
      nightLogs.forEach(log => {
        const div = document.createElement('div');
        div.textContent = `• ${log}`;
        settleLogsList.appendChild(div);
      });
    } else {
      settleLogsList.textContent = '今夜风平浪静，无移花接木对调。';
    }

    // 全员身份大揭秘对比
    settleRolesGrid.innerHTML = '';
    currentRoom.players.forEach(p => {
      const initDef = currentRoom.availableRoles[p.initialRole] || { name: p.initialRole, icon: '' };
      const finalDef = currentRoom.availableRoles[p.currentRole] || { name: p.currentRole, icon: '' };

      const card = document.createElement('div');
      card.className = 'role-compare-card';
      card.innerHTML = `
        <div><strong>${p.name}</strong>:</div>
        <div style="color:#94a3b8;">始: ${initDef.name} ${initDef.icon}</div>
        <div style="color:#fbbf24; font-weight:700;">终: ${finalDef.name} ${finalDef.icon}</div>
      `;
      settleRolesGrid.appendChild(card);
    });

    // 底牌揭晓 (一夜终极模式)
    if (currentRoom.settings.mode === 'ONE_NIGHT' && centerCards && centerCards.length > 0) {
      settleCenterSection.classList.remove('hidden');
      settleCenterCards.innerHTML = '';
      centerCards.forEach((c, idx) => {
        const def = currentRoom.availableRoles[c.roleId] || { name: '未知', icon: '❓' };
        const col = document.createElement('div');
        col.className = 'center-reveal-item';
        col.innerHTML = `
          <div class="cr-idx">底牌 ${idx + 1}</div>
          <div class="cr-icon">${def.icon}</div>
          <div class="cr-name">${def.name}</div>
        `;
        settleCenterCards.appendChild(col);
      });
    } else {
      settleCenterSection.classList.add('hidden');
    }

    modalSettle.classList.remove('hidden');
  });

  // 退出房间处理
  function exitToHome() {
    currentRoom = null;
    sessionStorage.removeItem('werewolf_room');
    viewHome.classList.remove('hidden');
    viewGame.classList.add('hidden');
    if (btnLeaveRoom) btnLeaveRoom.classList.add('hidden');
    if (modalSettle) modalSettle.classList.add('hidden');
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function confirmLeaveRoom() {
    window.sfx && window.sfx.playClick();
    if (confirm('确定要退出当前狼人杀房间吗？')) {
      socket.emit('leave_room', () => {});
      exitToHome();
    }
  }

  if (btnLeaveRoom) btnLeaveRoom.addEventListener('click', confirmLeaveRoom);
  if (btnLeaveLobby) btnLeaveLobby.addEventListener('click', confirmLeaveRoom);
  if (btnSettleLeave) btnSettleLeave.addEventListener('click', confirmLeaveRoom);

  const homeLobbyLink = document.querySelector('header .header-left a[href="/"]');
  if (homeLobbyLink) {
    homeLobbyLink.addEventListener('click', (e) => {
      if (currentRoom) {
        e.preventDefault();
        if (confirm('你正在房间中，确定要退出房间并返回游戏大厅吗？')) {
          socket.emit('leave_room', () => {});
          exitToHome();
          window.location.href = '/';
        }
      }
    });
  }

  // 上帝模式顶栏按钮绑定
  if (btnGodPrevStep) {
    btnGodPrevStep.onclick = () => {
      if (currentRoom) {
        socket.emit('god_night_prev_step', { roomCode: currentRoom.code });
      }
    };
  }

  if (btnGodRefereeToggle) {
    btnGodRefereeToggle.onclick = () => {
      if (!currentRoom || !modalReferee) return;
      const living = currentRoom.players.filter(p => p.id !== currentRoom.hostId && p.isAlive);
      selectRefereeEliminatePlayer.innerHTML = living.map(p => `<option value="${p.id}">${p.seatNumber}号 [${p.name}]</option>`).join('');
      modalReferee.classList.remove('hidden');
    };
  }

  // 弹窗关闭与动作绑定
  if (btnCloseExplode) btnCloseExplode.onclick = () => modalWolfExplode.classList.add('hidden');
  if (btnClosePk) btnClosePk.onclick = () => modalPkSetup.classList.add('hidden');
  if (btnCloseReferee) btnCloseReferee.onclick = () => modalReferee.classList.add('hidden');
  if (btnCancelShoot) btnCancelShoot.onclick = () => modalShootKill.classList.add('hidden');

  if (btnTransferBadge) {
    btnTransferBadge.onclick = () => {
      if (!currentRoom) return;
      const targetId = selectBadgeSuccessor.value;
      socket.emit('god_transfer_badge', { roomCode: currentRoom.code, action: 'transfer', targetId });
      modalBadgeTransfer.classList.add('hidden');
    };
  }

  if (btnTearBadge) {
    btnTearBadge.onclick = () => {
      if (!currentRoom) return;
      socket.emit('god_transfer_badge', { roomCode: currentRoom.code, action: 'tear' });
      modalBadgeTransfer.classList.add('hidden');
    };
  }

  if (btnConfirmShoot) {
    btnConfirmShoot.onclick = () => {
      if (!currentRoom || !currentShooterId) return;
      const targetId = selectShootTarget.value;
      socket.emit('god_shoot_kill', { roomCode: currentRoom.code, shooterId: currentShooterId, targetId }, (res) => {
        if (res && res.isSheriffDead) {
          openBadgeTransferModal();
        }
      });
      modalShootKill.classList.add('hidden');
    };
  }

  if (btnConfirmExplode) {
    btnConfirmExplode.onclick = () => {
      if (!currentRoom) return;
      const wolfPlayerId = selectExplodeWolf.value;
      const targetId = selectExplodeVictim.value || null;
      socket.emit('god_wolf_explode', { roomCode: currentRoom.code, wolfPlayerId, targetId });
      modalWolfExplode.classList.add('hidden');
    };
  }

  if (btnConfirmPk) {
    btnConfirmPk.onclick = () => {
      if (!currentRoom) return;
      const checkedBoxes = Array.from(document.querySelectorAll('.pk-candidate-cb:checked'));
      const candidateIds = checkedBoxes.map(cb => cb.value);
      if (candidateIds.length < 2) {
        alert('请至少勾选 2 名平票玩家！');
        return;
      }
      socket.emit('god_trigger_pk', { roomCode: currentRoom.code, candidateIds });
      modalPkSetup.classList.add('hidden');
    };
  }

  if (btnRefereeEliminate) {
    btnRefereeEliminate.onclick = () => {
      if (!currentRoom) return;
      const targetPlayerId = selectRefereeEliminatePlayer.value;
      socket.emit('god_judge_eliminate', { roomCode: currentRoom.code, targetPlayerId, reason: '法官裁判淘汰' });
      modalReferee.classList.add('hidden');
    };
  }

  if (btnForceEndVillagers) {
    btnForceEndVillagers.onclick = () => {
      if (!currentRoom) return;
      socket.emit('god_force_end', { roomCode: currentRoom.code, winnerTeam: 'VILLAGER' });
      modalReferee.classList.add('hidden');
    };
  }

  if (btnForceEndWolves) {
    btnForceEndWolves.onclick = () => {
      if (!currentRoom) return;
      socket.emit('god_force_end', { roomCode: currentRoom.code, winnerTeam: 'WEREWOLF' });
      modalReferee.classList.add('hidden');
    };
  }

  if (btnForceEndTie) {
    btnForceEndTie.onclick = () => {
      if (!currentRoom) return;
      socket.emit('god_force_end', { roomCode: currentRoom.code, winnerTeam: 'TIE' });
      modalReferee.classList.add('hidden');
    };
  }

  if (btnRefereeRedeal) {
    btnRefereeRedeal.onclick = () => {
      if (!currentRoom) return;
      socket.emit('god_redeal', { roomCode: currentRoom.code });
      modalReferee.classList.add('hidden');
    };
  }

  // 自动入房与重连检测
  const savedRoomCode = new URLSearchParams(window.location.search).get('room') || localStorage.getItem('werewolf_room_code');
  if (savedRoomCode && myPlayerId) {
    socket.emit('reconnect_room', {
      roomCode: savedRoomCode,
      playerId: myPlayerId
    }, (res) => {
      if (res && res.success && res.roomData) {
        renderRoom(res.roomData);
      }
    });
  }
})();
