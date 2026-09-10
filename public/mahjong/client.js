// 四川麻将（血战到底 / 血流成河）客户端核心逻辑
(function() {
  const socket = io('/mahjong');

  const AVATARS = [
    '👑', '🐉', '🐯', '🦁', '🐼', '🦊',
    '🐱', '🤠', '😎', '🧐', '🥳', '🀄'
  ];

  // 本地玩家信息持久化
  let myPlayerId = localStorage.getItem('mj_pid');
  if (!myPlayerId) {
    myPlayerId = 'p_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    localStorage.setItem('mj_pid', myPlayerId);
  }

  let myNickname = localStorage.getItem('mj_name') || `雀友${Math.floor(100 + Math.random() * 900)}`;
  let myAvatar = localStorage.getItem('mj_avatar') || AVATARS[0];

  let currentRoom = null;
  let selectedTileId = null;
  let selectedSwapIds = new Set();
  let timerInterval = null;
  let serverInfo = null;

  // DOM 元素引用
  const viewHome = document.getElementById('view-home');
  const viewTable = document.getElementById('view-table');

  const roomCodeTag = document.getElementById('room-code-tag');
  const currentRoomCodeEl = document.getElementById('current-room-code');

  const avatarListContainer = document.getElementById('avatar-list');
  const nicknameInput = document.getElementById('nickname-input');
  const roomCodeInput = document.getElementById('room-code-input');

  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom = document.getElementById('btn-join-room');
  const btnToggleOrientation = document.getElementById('btn-toggle-orientation');
  const btnSettings = document.getElementById('btn-settings');
  const btnLeaveRoom = document.getElementById('btn-leave-room');
  const btnQuickInvite = document.getElementById('btn-quick-invite');
  const btnRules = document.getElementById('btn-rules');
  const btnSound = document.getElementById('btn-sound');

  // 牌桌中央罗盘
  const compassNorth = document.getElementById('compass-north');
  const compassWest = document.getElementById('compass-west');
  const compassEast = document.getElementById('compass-east');
  const compassSouth = document.getElementById('compass-south');
  const turnCountdown = document.getElementById('turn-countdown');
  const remainTilesCount = document.getElementById('remain-tiles-count');
  const tableRulesCapsule = document.getElementById('table-rules-capsule');
  const tableBannerAlert = document.getElementById('table-banner-alert');
  const bannerText = document.getElementById('banner-text');

  // 特效层
  const vfxWind = document.getElementById('vfx-wind');
  const vfxRain = document.getElementById('vfx-rain');
  const vfxHu = document.getElementById('vfx-hu');
  const toastContainer = document.getElementById('toast-container');

  // 4 方玩家槽位
  const pTop = {
    avatar: document.getElementById('p-top-avatar'),
    name: document.getElementById('p-top-name'),
    chips: document.getElementById('p-top-chips'),
    que: document.getElementById('p-top-que'),
    ready: document.getElementById('p-top-ready'),
    hu: document.getElementById('p-top-hu'),
    melds: document.getElementById('p-top-melds'),
    discards: document.getElementById('p-top-discards'),
    handBack: document.getElementById('p-top-hand-back')
  };

  const pLeft = {
    avatar: document.getElementById('p-left-avatar'),
    name: document.getElementById('p-left-name'),
    chips: document.getElementById('p-left-chips'),
    que: document.getElementById('p-left-que'),
    ready: document.getElementById('p-left-ready'),
    hu: document.getElementById('p-left-hu'),
    melds: document.getElementById('p-left-melds'),
    discards: document.getElementById('p-left-discards'),
    handBack: document.getElementById('p-left-hand-back')
  };

  const pRight = {
    avatar: document.getElementById('p-right-avatar'),
    name: document.getElementById('p-right-name'),
    chips: document.getElementById('p-right-chips'),
    que: document.getElementById('p-right-que'),
    ready: document.getElementById('p-right-ready'),
    hu: document.getElementById('p-right-hu'),
    melds: document.getElementById('p-right-melds'),
    discards: document.getElementById('p-right-discards'),
    handBack: document.getElementById('p-right-hand-back')
  };

  const pMy = {
    avatar: document.getElementById('my-avatar'),
    name: document.getElementById('my-name'),
    chips: document.getElementById('my-chips'),
    que: document.getElementById('my-que'),
    streak: document.getElementById('my-streak'),
    melds: document.getElementById('p-my-melds'),
    discards: document.getElementById('p-my-discards'),
    handContainer: document.getElementById('my-hand-container')
  };

  // 交互控制条
  const huanThreeBar = document.getElementById('huan-three-bar');
  const huanCount = document.getElementById('huan-count');
  const btnConfirmHuan = document.getElementById('btn-confirm-huan');

  const dingQueBar = document.getElementById('ding-que-bar');
  const recomWan = document.getElementById('recom-wan');
  const recomTong = document.getElementById('recom-tong');
  const recomTiao = document.getElementById('recom-tiao');

  const actionPromptsBar = document.getElementById('action-prompts-bar');
  const btnActionHu = document.getElementById('btn-action-hu');
  const btnActionGang = document.getElementById('btn-action-gang');
  const btnActionPeng = document.getElementById('btn-action-peng');
  const btnActionPass = document.getElementById('btn-action-pass');

  const lobbyControlBar = document.getElementById('lobby-control-bar');
  const btnToggleReady = document.getElementById('btn-toggle-ready');
  const btnAddAi = document.getElementById('btn-add-ai');
  const btnStartGame = document.getElementById('btn-start-game');

  const tingHelperPill = document.getElementById('ting-helper-pill');
  const tingTilesList = document.getElementById('ting-tiles-list');
  const btnDiscardSelected = document.getElementById('btn-discard-selected');
  const actionGuideText = document.getElementById('action-guide-text');

  // 弹窗
  const modalSettings = document.getElementById('modal-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const settingBaseScore = document.getElementById('setting-base-score');
  const settingMode = document.getElementById('setting-mode');
  const settingMaxFan = document.getElementById('setting-max-fan');
  const settingSwapThree = document.getElementById('setting-swap-three');
  const settingsHostHint = document.getElementById('settings-host-hint');

  const modalRules = document.getElementById('modal-rules');
  const btnCloseRules = document.getElementById('btn-close-rules');

  const modalShare = document.getElementById('modal-share');
  const btnCloseShare = document.getElementById('btn-close-share');
  const shareLinkInput = document.getElementById('share-link-input');
  const btnCopyShareLink = document.getElementById('btn-copy-share-link');
  const shareNetworkOptions = document.getElementById('share-network-options');

  const modalSettle = document.getElementById('modal-settle');
  const btnCloseSettle = document.getElementById('btn-close-settle');
  const settleScoresGrid = document.getElementById('settle-scores-grid');
  const settleRevealedHands = document.getElementById('settle-revealed-hands');
  const btnPlayAgain = document.getElementById('btn-play-again');
  const btnSettleLeave = document.getElementById('btn-settle-leave');

  function showToast(msg, duration = 2200) {
    if (!toastContainer) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'all 0.3s ease';
      t.style.opacity = '0';
      t.style.transform = 'translateY(-15px)';
      setTimeout(() => t.remove(), 300);
    }, duration);
  }

  // 初始化头像选择
  function initProfileUI() {
    nicknameInput.value = myNickname;
    avatarListContainer.innerHTML = '';
    AVATARS.forEach(av => {
      const el = document.createElement('div');
      el.className = `avatar-option ${av === myAvatar ? 'selected' : ''}`;
      el.textContent = av;
      el.addEventListener('click', () => {
        document.querySelectorAll('.avatar-option').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
        myAvatar = av;
        localStorage.setItem('mj_avatar', av);
      });
      avatarListContainer.appendChild(el);
    });

    nicknameInput.addEventListener('change', () => {
      const val = nicknameInput.value.trim() || `雀友${Math.floor(100 + Math.random() * 900)}`;
      myNickname = val;
      localStorage.setItem('mj_name', val);
    });
  }

  // 获取服务器网络信息
  fetch('/api/server-info')
    .then(res => res.json())
    .then(info => { serverInfo = info; })
    .catch(() => {});

  // 渲染麻将房间桌面状态
  function renderRoom(room) {
    currentRoom = room;

    viewHome.classList.add('hidden');
    viewTable.classList.remove('hidden');
    roomCodeTag.classList.remove('hidden');
    if (btnLeaveRoom) btnLeaveRoom.classList.remove('hidden');
    currentRoomCodeEl.textContent = room.code;

    const mySeat = room.mySeatIndex;
    const seats = room.seats;

    // 四方相对座位映射 (以我为底/南家):
    // 右边下家: (my+1)%4, 对面上家: (my+2)%4, 左边上家: (my+3)%4
    const rightIdx = (mySeat !== -1) ? (mySeat + 1) % 4 : 1;
    const topIdx = (mySeat !== -1) ? (mySeat + 2) % 4 : 2;
    const leftIdx = (mySeat !== -1) ? (mySeat + 3) % 4 : 3;

    // 1. 渲染中央罗盘
    remainTilesCount.textContent = `余 ${room.gameState.remainingTileCount} 张`;
    const modeName = room.settings.mode === 'xueliu' ? '血流成河' : '血战到底';
    const fanCap = room.settings.maxFan ? `${room.settings.maxFan}番封顶` : '不封顶';
    tableRulesCapsule.textContent = `底分: ${room.settings.baseScore} · ${modeName} · ${fanCap}`;

    // 更新当前行动方的高亮指示
    [compassSouth, compassEast, compassNorth, compassWest].forEach(el => el.classList.remove('turn-active'));
    if (room.gameState.currentTurnSeat !== null) {
      const cur = room.gameState.currentTurnSeat;
      if (cur === mySeat) compassSouth.classList.add('turn-active');
      else if (cur === rightIdx) compassEast.classList.add('turn-active');
      else if (cur === topIdx) compassNorth.classList.add('turn-active');
      else if (cur === leftIdx) compassWest.classList.add('turn-active');
    }

    // 2. 渲染三方对手
    renderOpponentSlot(seats[topIdx], pTop, room, topIdx);
    renderOpponentSlot(seats[leftIdx], pLeft, room, leftIdx);
    renderOpponentSlot(seats[rightIdx], pRight, room, rightIdx);

    // 3. 渲染我自己的信息与手牌
    const myData = (mySeat !== -1) ? seats[mySeat] : null;
    if (myData) {
      pMy.avatar.textContent = myData.avatar;
      pMy.name.textContent = myData.name;
      pMy.chips.textContent = `🪙 ${(myData.chips || 1000).toLocaleString()}`;

      // 定缺徽章
      if (myData.queSuit) {
        pMy.que.classList.remove('hidden');
        pMy.que.textContent = `缺${window.MahjongRules ? window.MahjongRules.SUIT_NAMES[myData.queSuit] : myData.queSuit}`;
      } else {
        pMy.que.classList.add('hidden');
      }

      // 连胜徽章
      if (myData.currentStreak >= 2) {
        pMy.streak.classList.remove('hidden');
        pMy.streak.textContent = `🔥 ${myData.currentStreak}连胜`;
      } else {
        pMy.streak.classList.add('hidden');
      }

      // 渲染我的副露与弃牌
      renderMelds(pMy.melds, myData.melds);
      renderDiscards(pMy.discards, myData.discards);

      // 渲染我的手牌
      renderMyHand(myData.handCards || [], myData.queSuit);
    }

    // 4. 控制各阶段交互条
    renderPhaseBars(room, mySeat);
  }

  function renderOpponentSlot(seatData, dom, room, seatIdx) {
    if (!seatData) {
      dom.avatar.textContent = '🪑';
      dom.name.textContent = '空座位';
      dom.chips.textContent = '';
      dom.que.classList.add('hidden');
      dom.ready.classList.add('hidden');
      dom.hu.classList.add('hidden');
      dom.melds.innerHTML = '';
      dom.discards.innerHTML = '';
      dom.handBack.innerHTML = '';
      dom.avatar.parentElement?.classList.remove('turn-active');
      return;
    }

    dom.avatar.textContent = seatData.avatar;
    dom.name.textContent = seatData.name;
    dom.chips.textContent = `🪙 ${(seatData.chips || 1000).toLocaleString()}`;

    // 准备状态
    if (room.gameState.phase === 'LOBBY') {
      dom.ready.classList.remove('hidden');
      dom.ready.textContent = seatData.isReady ? '已准备' : '未准备';
      dom.ready.style.background = seatData.isReady ? '#10b981' : '#6b7280';
    } else {
      dom.ready.classList.add('hidden');
    }

    // 定缺状态
    if (seatData.queSuit) {
      dom.que.classList.remove('hidden');
      dom.que.textContent = `缺${window.MahjongRules ? window.MahjongRules.SUIT_NAMES[seatData.queSuit] : seatData.queSuit}`;
    } else {
      dom.que.classList.add('hidden');
    }

    // 胡牌状态
    if (seatData.hasHu) {
      dom.hu.classList.remove('hidden');
    } else {
      dom.hu.classList.add('hidden');
    }

    // 行牌光环
    if (room.gameState.currentTurnSeat === seatIdx) {
      dom.avatar.parentElement?.classList.add('turn-active');
    } else {
      dom.avatar.parentElement?.classList.remove('turn-active');
    }

    // 副露与弃牌
    renderMelds(dom.melds, seatData.melds);
    renderDiscards(dom.discards, seatData.discards);

    // 手牌牌背：大厅未开局时不渲染手牌背，开局后按实际持牌张数渲染
    dom.handBack.innerHTML = '';
    if (room.gameState.phase !== 'LOBBY') {
      const count = seatData.handCount || 0;
      for (let i = 0; i < count; i++) {
        if (window.MahjongTiles) {
          dom.handBack.appendChild(window.MahjongTiles.createTileElement(null, { size: 'back', isBack: true }));
        }
      }
    }
  }

  function renderMelds(container, melds = []) {
    container.innerHTML = '';
    melds.forEach(m => {
      const group = document.createElement('div');
      group.className = 'meld-group';
      (m.tiles || []).forEach(t => {
        if (window.MahjongTiles) {
          group.appendChild(window.MahjongTiles.createTileElement(t, { size: 'discard' }));
        }
      });
      container.appendChild(group);
    });
  }

  function renderDiscards(container, discards = []) {
    container.innerHTML = '';
    discards.forEach(t => {
      if (window.MahjongTiles) {
        container.appendChild(window.MahjongTiles.createTileElement(t, { size: 'discard' }));
      }
    });
  }

  // 渲染我的手牌
  function renderMyHand(tiles, queSuit) {
    pMy.handContainer.innerHTML = '';

    const isPlaying = (currentRoom && currentRoom.gameState.phase === 'PLAYING');
    const isMyTurn = (isPlaying && currentRoom.gameState.currentTurnSeat === currentRoom.mySeatIndex);
    const hasQue = window.MahjongRules ? window.MahjongRules.hasQueSuit(tiles, queSuit) : false;

    // 检查是否有选中的牌在当前手中
    const selectedTile = (tiles || []).find(t => t.id === selectedTileId);
    if (!selectedTile) {
      selectedTileId = null;
    }

    // 更新出牌按钮状态
    if (btnDiscardSelected) {
      if (isMyTurn && selectedTileId && selectedTile) {
        btnDiscardSelected.classList.remove('hidden');
        btnDiscardSelected.textContent = `📤 打出 ${selectedTile.rank}${window.MahjongRules ? window.MahjongRules.SUIT_NAMES[selectedTile.suit] : ''}`;
      } else {
        btnDiscardSelected.classList.add('hidden');
      }
    }

    if (!tiles || tiles.length === 0) {
      if (currentRoom && currentRoom.gameState && currentRoom.gameState.phase !== 'LOBBY') {
        pMy.handContainer.innerHTML = '<div style="color: rgba(255,255,255,0.45); font-size: 13px; align-self: center; padding: 22px;">牌局正在进行中...</div>';
      }
      return;
    }

    tiles.forEach((tile, idx) => {
      const isQue = (tile.suit === queSuit);
      const isSelected = (tile.id === selectedTileId) || selectedSwapIds.has(tile.id);
      const isNewDraw = (tiles.length % 3 === 2 && idx === tiles.length - 1);

      const tileEl = window.MahjongTiles.createTileElement(tile, {
        size: 'normal',
        isSelected,
        isQue,
        isNewDraw
      });

      // 单击选中 / 双击出牌
      let lastTap = 0;
      tileEl.addEventListener('click', () => {
        const now = Date.now();
        window.sfx && window.sfx.playTileClick();

        // 换三张阶段的多选逻辑
        if (currentRoom && currentRoom.gameState.phase === 'SWAP_THREE') {
          handleSwapSelection(tile);
          return;
        }

        // 常规出牌阶段
        if (now - lastTap < 350 && now - lastTap > 0) {
          // 双击出牌
          lastTap = 0;
          attemptDiscard(tile);
          return;
        }
        lastTap = now;

        // 单击选中
        selectedTileId = (selectedTileId === tile.id) ? null : tile.id;
        document.querySelectorAll('#my-hand-container .mj-tile').forEach(el => el.classList.remove('selected'));
        if (selectedTileId) tileEl.classList.add('selected');

        if (btnDiscardSelected) {
          if (isMyTurn && selectedTileId) {
            btnDiscardSelected.classList.remove('hidden');
            btnDiscardSelected.textContent = `📤 打出 ${tile.rank}${window.MahjongRules ? window.MahjongRules.SUIT_NAMES[tile.suit] : ''}`;
          } else {
            btnDiscardSelected.classList.add('hidden');
          }
        }

        // 计算此牌打出后的听牌提示
        updateTingHelper(tile, tiles, queSuit);
      });

      pMy.handContainer.appendChild(tileEl);
    });
  }

  function handleSwapSelection(tile) {
    // 换三张必须同门花色
    if (selectedSwapIds.has(tile.id)) {
      selectedSwapIds.delete(tile.id);
    } else {
      if (selectedSwapIds.size >= 3) {
        showToast('已选满 3 张，请取消部分再选');
        return;
      }
      // 验证花色一致性
      const myHand = currentRoom.seats[currentRoom.mySeatIndex].handCards || [];
      const firstTile = myHand.find(t => selectedSwapIds.has(t.id));
      if (firstTile && firstTile.suit !== tile.suit) {
        showToast('换三张必须选择同一门花色！');
        return;
      }
      selectedSwapIds.add(tile.id);
    }

    huanCount.textContent = selectedSwapIds.size;
    btnConfirmHuan.disabled = (selectedSwapIds.size !== 3);
    renderMyHand(currentRoom.seats[currentRoom.mySeatIndex].handCards || [], null);
  }

  function attemptDiscard(tile) {
    if (!currentRoom || currentRoom.gameState.phase !== 'PLAYING') return;
    if (currentRoom.gameState.currentTurnSeat !== currentRoom.mySeatIndex) {
      showToast('还没轮到你出牌哦');
      return;
    }

    const myData = currentRoom.seats[currentRoom.mySeatIndex];
    const hasQue = window.MahjongRules ? window.MahjongRules.hasQueSuit(myData.handCards, myData.queSuit) : false;

    if (hasQue && tile.suit !== myData.queSuit) {
      showToast('⚠️ 定缺牌未打完，必须先出定缺牌！');
      window.sfx && window.sfx.playTileClick();
      return;
    }

    socket.emit('discard_tile', tile.id, (res) => {
      if (res && res.success) {
        selectedTileId = null;
        tingHelperPill.classList.add('hidden');
        window.sfx && window.sfx.playTileDiscard();
      } else {
        showToast((res && res.message) || '出牌失败');
      }
    });
  }

  function updateTingHelper(candidateTile, allTiles, queSuit) {
    if (!window.MahjongRules) return;
    const remaining = allTiles.filter(t => t.id !== candidateTile.id);
    const tingInfo = window.MahjongRules.getTingInfo(remaining, [], queSuit);

    if (tingInfo.isTing && tingInfo.huTiles.length > 0) {
      tingHelperPill.classList.remove('hidden');
      tingTilesList.innerHTML = '';
      tingInfo.huTiles.forEach(h => {
        const item = document.createElement('span');
        item.style.cssText = 'padding: 1px 5px; background: rgba(16,185,129,0.25); border-radius: 4px; font-weight: 800;';
        item.textContent = `${h.rank}${window.MahjongRules.SUIT_NAMES[h.suit]}`;
        tingTilesList.appendChild(item);
      });
    } else {
      tingHelperPill.classList.add('hidden');
    }
  }

  // 阶段操作面板控制
  function renderPhaseBars(room, mySeat) {
    lobbyControlBar.classList.add('hidden');
    huanThreeBar.classList.add('hidden');
    dingQueBar.classList.add('hidden');

    if (mySeat === -1) return;
    const myData = room.seats[mySeat];
    const isHost = (room.hostId === myPlayerId);

    if (room.gameState.phase === 'LOBBY') {
      lobbyControlBar.classList.remove('hidden');
      btnToggleReady.textContent = myData.isReady ? '取消准备' : '准备';

      const hasEmptySeat = room.seats.some(s => s === null);
      if (isHost && hasEmptySeat) {
        btnAddAi.classList.remove('hidden');
      } else {
        btnAddAi.classList.add('hidden');
      }

      const allSeated = room.seats.every(s => s !== null);
      if (isHost && allSeated) {
        btnStartGame.classList.remove('hidden');
      } else {
        btnStartGame.classList.add('hidden');
      }

      if (actionGuideText) {
        if (allSeated && isHost) {
          actionGuideText.textContent = '👥 4人已就位，请点击【👑 开始洗牌发牌】开局！';
        } else if (isHost) {
          actionGuideText.textContent = '⏳ 等待雀友加入，或点击【🤖 补齐电脑陪练】！';
        } else {
          actionGuideText.textContent = myData.isReady ? '✅ 已准备，等待房主开局...' : '💡 请点击【准备】进入就绪状态';
        }
      }
    } else if (room.gameState.phase === 'SWAP_THREE') {
      huanThreeBar.classList.remove('hidden');
      const hasChosen = !!(room.gameState.swapSelections && room.gameState.swapSelections[mySeat]);
      const tip = huanThreeBar.querySelector('.bar-tip');
      if (hasChosen) {
        if (tip) tip.innerHTML = '⏳ <strong>已确认换三张</strong>，等待其他雀友完成...';
        btnConfirmHuan.classList.add('hidden');
      } else {
        if (tip) tip.innerHTML = `🔀 请在手牌中选择 <strong>3 张相同花色</strong> 进行互换 (已选 <span id="huan-count">${selectedSwapIds.size}</span>/3 张)`;
        btnConfirmHuan.classList.remove('hidden');
        btnConfirmHuan.disabled = (selectedSwapIds.size !== 3);
      }
      if (actionGuideText) {
        actionGuideText.textContent = hasChosen ? '⏳ 等待其他雀友换牌...' : '🔀 点击手牌选中3张同门花色，再点击确认';
      }
    } else if (room.gameState.phase === 'DING_QUE') {
      dingQueBar.classList.remove('hidden');
      const queGroup = dingQueBar.querySelector('.que-buttons-group');
      const tip = dingQueBar.querySelector('.bar-tip');
      if (myData.queSuit) {
        if (tip) tip.innerHTML = `🎯 已定缺【<strong>${window.MahjongRules ? window.MahjongRules.SUIT_NAMES[myData.queSuit] : myData.queSuit}</strong>】，等待其他雀友...`;
        if (queGroup) queGroup.classList.add('hidden');
        if (actionGuideText) actionGuideText.textContent = '⏳ 等待其他雀友完成定缺...';
      } else {
        if (tip) tip.innerHTML = '🎯 请选择定缺花色 (开局必须先打光此花色):';
        if (queGroup) queGroup.classList.remove('hidden');
        if (actionGuideText) actionGuideText.textContent = '🎯 点击上方选择一门定缺花色';
        if (window.MahjongRules) {
          const recom = window.MahjongRules.recommendQueSuit(myData.handCards);
          recomWan.classList.toggle('hidden', recom !== 'wan');
          recomTong.classList.toggle('hidden', recom !== 'tong');
          recomTiao.classList.toggle('hidden', recom !== 'tiao');
        }
      }
    } else if (room.gameState.phase === 'PLAYING') {
      const isMyTurn = (room.gameState.currentTurnSeat === mySeat);
      if (actionGuideText) {
        if (isMyTurn) {
          actionGuideText.textContent = '👉 轮到你出牌：点选后双击或点击【打出】';
        } else {
          actionGuideText.textContent = '⏳ 其他玩家正在行牌...';
        }
      }
    }
  }

  // 倒计时
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!currentRoom || !currentRoom.gameState.turnDeadline) return;
    const remain = Math.max(0, Math.ceil((currentRoom.gameState.turnDeadline - Date.now()) / 1000));
    turnCountdown.textContent = remain;
  }, 1000);

  // 初始化设置与事件绑定
  initProfileUI();

  btnCreateRoom.addEventListener('click', () => {
    socket.emit('create_room', {
      id: myPlayerId,
      name: myNickname,
      avatar: myAvatar
    }, (res) => {
      if (res && res.success) {
        window.history.replaceState(null, '', `?room=${res.roomCode}`);
      }
    });
  });

  btnJoinRoom.addEventListener('click', () => {
    const code = roomCodeInput.value.trim();
    if (code.length !== 4) {
      showToast('请输入 4 位房间号');
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
        showToast((res && res.message) || '加入房间失败');
      }
    });
  }

  btnToggleReady.addEventListener('click', () => socket.emit('toggle_ready'));
  btnAddAi.addEventListener('click', () => socket.emit('add_ai'));
  btnStartGame.addEventListener('click', () => socket.emit('host_start_game'));

  // 快捷打出选中手牌
  if (btnDiscardSelected) {
    btnDiscardSelected.addEventListener('click', () => {
      if (!currentRoom || currentRoom.gameState.phase !== 'PLAYING') return;
      if (currentRoom.gameState.currentTurnSeat !== currentRoom.mySeatIndex) {
        showToast('还没轮到你出牌哦');
        return;
      }
      const myHand = currentRoom.seats[currentRoom.mySeatIndex]?.handCards || [];
      const tile = myHand.find(t => t.id === selectedTileId);
      if (tile) {
        attemptDiscard(tile);
      } else {
        showToast('请先点击选中一张手牌');
      }
    });
  }

  // 换三张提交
  btnConfirmHuan.addEventListener('click', () => {
    if (selectedSwapIds.size === 3) {
      socket.emit('submit_swap_three', Array.from(selectedSwapIds), () => {
        huanThreeBar.classList.add('hidden');
        showToast('🔀 已选择完毕，等待其他玩家...');
      });
    }
  });

  // 定缺按钮绑定
  document.querySelectorAll('.btn-que-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const suit = btn.dataset.suit;
      if (suit) {
        socket.emit('submit_ding_que', suit, () => {
          dingQueBar.classList.add('hidden');
          showToast(`🎯 已定缺【${window.MahjongRules.SUIT_NAMES[suit]}】！`);
        });
      }
    });
  });

  // 碰杠胡反应操作
  btnActionHu.addEventListener('click', () => {
    actionPromptsBar.classList.add('hidden');
    socket.emit('respond_prompt', 'hu');
  });

  btnActionGang.addEventListener('click', () => {
    actionPromptsBar.classList.add('hidden');
    socket.emit('respond_prompt', 'gang');
  });

  btnActionPeng.addEventListener('click', () => {
    actionPromptsBar.classList.add('hidden');
    socket.emit('respond_prompt', 'peng');
  });

  btnActionPass.addEventListener('click', () => {
    actionPromptsBar.classList.add('hidden');
    socket.emit('respond_prompt', 'pass');
  });

  // 规则设置弹窗
  btnSettings.addEventListener('click', () => {
    if (!currentRoom) return;
    const isHost = (currentRoom.hostId === myPlayerId);
    const isLobby = (currentRoom.gameState.phase === 'LOBBY');
    const canEdit = isHost && isLobby;

    btnSaveSettings.style.display = canEdit ? 'block' : 'none';
    settingsHostHint.classList.toggle('hidden', canEdit);
    modalSettings.classList.remove('hidden');
  });

  btnCloseSettings.addEventListener('click', () => modalSettings.classList.add('hidden'));

  btnSaveSettings.addEventListener('click', () => {
    const baseScore = Number(document.querySelector('#setting-base-score .active')?.dataset.value || 1);
    const mode = document.querySelector('#setting-mode .active')?.dataset.value || 'xuezhan';
    const maxFan = Number(document.querySelector('#setting-max-fan .active')?.dataset.value || 4);
    const enableSwapThree = settingSwapThree.checked;

    socket.emit('update_room_settings', {
      baseScore,
      mode,
      maxFan,
      enableSwapThree
    }, (res) => {
      if (res && res.success) {
        modalSettings.classList.add('hidden');
        showToast('⚙️ 麻将规则设置已更新！');
      }
    });
  });

  // 分段控件选择
  ['setting-base-score', 'setting-mode', 'setting-max-fan'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('.segment-btn');
        if (btn) {
          el.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    }
  });

  btnRules.addEventListener('click', () => modalRules.classList.remove('hidden'));
  btnCloseRules.addEventListener('click', () => modalRules.classList.add('hidden'));

  btnSound.addEventListener('click', () => {
    const enabled = window.sfx && window.sfx.toggleSound();
    btnSound.textContent = enabled ? '🔊' : '🔇';
    showToast(enabled ? '🔊 音效与语音已开启' : '🔇 音效已静音');
  });

  // 邀请弹窗
  btnQuickInvite.addEventListener('click', () => {
    if (!currentRoom) return;
    modalShare.classList.remove('hidden');
    const url = `${window.location.origin}/mahjong/?room=${currentRoom.code}`;
    shareLinkInput.value = url;
    const qrc = document.getElementById('qrcode-container');
    qrc.innerHTML = '';
    if (window.QRCode) {
      new window.QRCode(qrc, { text: url, width: 160, height: 160 });
    }
  });

  btnCloseShare.addEventListener('click', () => modalShare.classList.add('hidden'));
  btnCopyShareLink.addEventListener('click', () => {
    shareLinkInput.select();
    navigator.clipboard.writeText(shareLinkInput.value);
    showToast('房间链接已复制！');
  });

  // 退出房间
  function exitToHome() {
    currentRoom = null;
    viewHome.classList.remove('hidden');
    viewTable.classList.add('hidden');
    roomCodeTag.classList.add('hidden');
    modalSettle.classList.add('hidden');
  }

  btnLeaveRoom.addEventListener('click', () => {
    if (confirm('确定要退出麻将房间吗？')) {
      socket.emit('leave_room');
      exitToHome();
    }
  });

  btnSettleLeave.addEventListener('click', () => {
    socket.emit('leave_room');
    exitToHome();
  });

  btnPlayAgain.addEventListener('click', () => {
    modalSettle.classList.add('hidden');
    socket.emit('play_again');
  });

  btnCloseSettle.addEventListener('click', () => modalSettle.classList.add('hidden'));

  // Socket 核心响应监听
  socket.on('room_update', (room) => {
    renderRoom(room);
  });

  socket.on('tile_drawn', ({ tile, canZimo, gangOptions }) => {
    window.sfx && window.sfx.playTileClick();
    if (canZimo) {
      btnActionHu.classList.remove('hidden');
      actionPromptsBar.classList.remove('hidden');
      btnActionHu.onclick = () => {
        actionPromptsBar.classList.add('hidden');
        socket.emit('action_zimo');
      };
    }
    if (gangOptions && gangOptions.length > 0) {
      btnActionGang.classList.remove('hidden');
      actionPromptsBar.classList.remove('hidden');
      btnActionGang.onclick = () => {
        actionPromptsBar.classList.add('hidden');
        socket.emit('action_my_gang', gangOptions[0]);
      };
    }
  });

  socket.on('action_prompt', ({ tile, actions }) => {
    actionPromptsBar.classList.remove('hidden');
    btnActionHu.classList.toggle('hidden', !actions.canHu);
    btnActionGang.classList.toggle('hidden', !actions.canGang);
    btnActionPeng.classList.toggle('hidden', !actions.canPeng);
    window.sfx && window.sfx.playTileClick();
  });

  socket.on('action_peng_announced', ({ seatIndex, fromSeat, tile }) => {
    window.sfx && window.sfx.playPeng();
    bannerText.textContent = '✨ 碰牌！';
    tableBannerAlert.classList.remove('hidden');
    setTimeout(() => tableBannerAlert.classList.add('hidden'), 2000);
  });

  socket.on('gang_announced', ({ type, seatIndex, tile }) => {
    const isXiayu = (type === 'an_gang');
    window.sfx && window.sfx.playGang(isXiayu);
    if (isXiayu) {
      vfxRain.classList.remove('hidden');
      setTimeout(() => vfxRain.classList.add('hidden'), 1500);
      bannerText.textContent = '🌧️ 暗杠！下雨咯！全场出资！';
    } else {
      vfxWind.classList.remove('hidden');
      setTimeout(() => vfxWind.classList.add('hidden'), 1500);
      bannerText.textContent = '🌪️ 直杠！刮风咯！点杠全包！';
    }
    tableBannerAlert.classList.remove('hidden');
    setTimeout(() => tableBannerAlert.classList.add('hidden'), 2500);
  });

  socket.on('player_hu_announced', ({ winnerSeat, isZimo, fanInfo, score, huOrder }) => {
    const isMe = (currentRoom && currentRoom.mySeatIndex === winnerSeat);
    window.sfx && window.sfx.playHu(isZimo);

    vfxHu.classList.remove('hidden');
    setTimeout(() => vfxHu.classList.add('hidden'), 2000);

    const title = isZimo ? '🎉 自摸胡牌！' : '🎉 点炮胡牌！';
    bannerText.textContent = `${title} (第${huOrder}位胡牌 · ${fanInfo.totalFan}番)`;
    tableBannerAlert.classList.remove('hidden');
    setTimeout(() => tableBannerAlert.classList.add('hidden'), 3500);

    showToast(isMe ? '👑 恭喜你胡牌！' : '🀄 有玩家胡牌啦！', 3500);
  });

  socket.on('game_over_announced', ({ reason, revealedSeats }) => {
    settleScoresGrid.innerHTML = '';
    (revealedSeats || []).forEach(s => {
      if (!s) return;
      const col = document.createElement('div');
      col.className = `score-col ${s.hasHu ? 'winner' : ''}`;
      col.innerHTML = `
        <div style="font-size:24px;">${s.avatar}</div>
        <div style="font-size:12px; font-weight:700;">${s.name}</div>
        <div class="score-val ${(s.totalScore >= 0) ? 'positive' : 'negative'}">${s.totalScore >= 0 ? '+' : ''}${s.totalScore}</div>
        <div style="font-size:11px; color:#fbbf24; margin-top:2px;">🪙 ${(s.chips || 1000).toLocaleString()}</div>
      `;
      settleScoresGrid.appendChild(col);
    });

    settleRevealedHands.innerHTML = '<div style="font-weight:700; color:#cbd5e1; margin-bottom:6px;">全员手牌揭示:</div>';
    (revealedSeats || []).forEach(s => {
      if (!s) return;
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:8px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;';
      row.innerHTML = `<span style="font-size:12px; font-weight:700;">${s.name}:</span>`;
      (s.handCards || []).forEach(t => {
        if (window.MahjongTiles) {
          row.appendChild(window.MahjongTiles.createTileElement(t, { size: 'discard' }));
        }
      });
      settleRevealedHands.appendChild(row);
    });

    setTimeout(() => {
      modalSettle.classList.remove('hidden');
    }, 600);
  });

  // URL 自动入房检测
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam && roomParam.length === 4) {
    roomCodeInput.value = roomParam;
    joinRoomByCode(roomParam);
  }
})();
