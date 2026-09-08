// 欢乐斗地主 - 客户端核心逻辑 (沉浸感与丝滑对战体验版)
(function() {
  const socket = io('/doudizhu');

  const AVATARS = [
    '😎', '🤠', '🧐', '🥳', '🥷', '🦸‍♂️',
    '🐱', '🐶', '🦊', '🐼', '🦁', '🐯',
    '🐸', '🦄', '🐲', '🤖', '👾', '🚀'
  ];

  // 本地玩家信息持久化
  let myPlayerId = localStorage.getItem('doudizhu_pid');
  if (!myPlayerId) {
    myPlayerId = 'p_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('doudizhu_pid', myPlayerId);
  }

  let myNickname = localStorage.getItem('doudizhu_name') || `玩家${Math.floor(100 + Math.random() * 900)}`;
  let myAvatar = localStorage.getItem('doudizhu_avatar') || AVATARS[Math.floor(Math.random() * AVATARS.length)];

  let currentRoom = null;
  let selectedCards = new Set(); // 选中的卡牌 ID 集合
  let hintCandidates = []; // 智能提示候选出牌列表
  let hintIndex = 0;
  let timerInterval = null;
  let serverInfo = null;

  // 滑牌选牌手势状态
  let isPointerDragging = false;
  let draggedCardIds = new Set();

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
  const btnQuickInvite = document.getElementById('btn-quick-invite');
  const btnAutoToggle = document.getElementById('btn-auto-toggle');
  const btnRules = document.getElementById('btn-rules');
  const btnSound = document.getElementById('btn-sound');
  const btnLeaveRoom = document.getElementById('btn-leave-room');
  const btnSettleLeave = document.getElementById('btn-settle-leave');

  // 牌桌元素
  const gameTableFelt = document.querySelector('.game-table-felt');
  const bottomCardsContainer = document.getElementById('bottom-cards-container');
  const tableMultiplierNum = document.getElementById('table-multiplier-num');
  const tableBannerAlert = document.getElementById('table-banner-alert');
  const bannerText = document.getElementById('banner-text');

  // 全屏动画元素
  const airplaneAnim = document.getElementById('airplane-anim');
  const rocketAnim = document.getElementById('rocket-anim');
  const bombAnim = document.getElementById('bomb-anim');
  const toastContainer = document.getElementById('toast-container');

  // 互动聊天元素
  const btnOpenChat = document.getElementById('btn-open-chat');
  const panelChatPopup = document.getElementById('panel-chat-popup');
  const btnCloseChat = document.getElementById('btn-close-chat');

  // 左右玩家
  const pLeft = {
    avatar: document.getElementById('p-left-avatar'),
    name: document.getElementById('p-left-name'),
    role: document.getElementById('p-left-role'),
    auto: document.getElementById('p-left-auto'),
    ready: document.getElementById('p-left-ready'),
    count: document.getElementById('p-left-count'),
    played: document.getElementById('p-left-played'),
    bubble: document.getElementById('p-left-bubble'),
    timer: document.getElementById('p-left-timer')
  };

  const pRight = {
    avatar: document.getElementById('p-right-avatar'),
    name: document.getElementById('p-right-name'),
    role: document.getElementById('p-right-role'),
    auto: document.getElementById('p-right-auto'),
    ready: document.getElementById('p-right-ready'),
    count: document.getElementById('p-right-count'),
    played: document.getElementById('p-right-played'),
    bubble: document.getElementById('p-right-bubble'),
    timer: document.getElementById('p-right-timer')
  };

  // 我自己
  const pMy = {
    avatar: document.getElementById('my-avatar'),
    name: document.getElementById('my-name'),
    role: document.getElementById('my-role-badge'),
    auto: document.getElementById('my-auto-status'),
    played: document.getElementById('p-my-played'),
    bubble: document.getElementById('p-my-bubble'),
    cardsContainer: document.getElementById('my-cards-container')
  };

  // 控制操作面板
  const panelLobby = document.getElementById('panel-lobby-actions');
  const btnToggleReady = document.getElementById('btn-toggle-ready');
  const btnAddAi = document.getElementById('btn-add-ai');
  const btnStartGame = document.getElementById('btn-start-game');

  const panelBid = document.getElementById('panel-bid-actions');
  const bidTimer = document.getElementById('bid-timer');
  const btnPassBid = document.getElementById('btn-pass-bid');
  const btnCallBid = document.getElementById('btn-call-bid');

  const panelPlay = document.getElementById('panel-play-actions');
  const playTimer = document.getElementById('play-timer');
  const selectedCardTypeTag = document.getElementById('selected-card-type-tag');
  const btnPassPlay = document.getElementById('btn-pass-play');
  const btnHintPlay = document.getElementById('btn-hint-play');
  const btnSubmitPlay = document.getElementById('btn-submit-play');
  const btnResetCards = document.getElementById('btn-reset-cards-selection');

  const panelGameover = document.getElementById('panel-gameover-actions');
  const btnShowSettleModal = document.getElementById('btn-show-settle-modal');
  const btnQuickPlayAgain = document.getElementById('btn-quick-play-again');

  // 弹窗元素
  const modalShare = document.getElementById('modal-share');
  const btnCloseShare = document.getElementById('btn-close-share');
  const shareLinkInput = document.getElementById('share-link-input');
  const btnCopyShareLink = document.getElementById('btn-copy-share-link');
  const shareNetworkOptions = document.getElementById('share-network-options');

  const modalRules = document.getElementById('modal-rules');
  const btnCloseRules = document.getElementById('btn-close-rules');

  const modalSettle = document.getElementById('modal-settle');
  const btnCloseSettle = document.getElementById('btn-close-settle');
  const settleTitle = document.getElementById('settle-title');
  const settleSubtitle = document.getElementById('settle-subtitle');
  const settleScoresGrid = document.getElementById('settle-scores-grid');
  const settleRevealedHands = document.getElementById('settle-revealed-hands');
  const btnPlayAgain = document.getElementById('btn-play-again');

  // 优雅轻量级浮动 Toast 提示
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
        localStorage.setItem('doudizhu_avatar', av);
      });
      avatarListContainer.appendChild(el);
    });

    nicknameInput.addEventListener('change', () => {
      const val = nicknameInput.value.trim() || `玩家${Math.floor(100 + Math.random() * 900)}`;
      myNickname = val;
      localStorage.setItem('doudizhu_name', val);
    });
  }

  // 获取服务器网络信息
  fetch('/api/server-info')
    .then(res => res.json())
    .then(info => { serverInfo = info; })
    .catch(() => {});

  // 渲染单张卡牌 DOM 组件
  function createCardElement(card, isSmall = false, isSelected = false) {
    const el = document.createElement('div');
    const isRed = ['♥', '♦'].includes(card.suit) || card.rank === 'RJ';
    const isJoker = card.rank === 'BJ' || card.rank === 'RJ';

    el.className = `card-item ${isSmall ? 'mini-card' : ''} ${isSelected ? 'selected' : ''} ${isRed ? 'red' : 'black'} ${isJoker ? 'joker' : ''}`;
    el.dataset.id = card.id;

    let displayRank = card.rank;
    let displaySuit = card.suit;
    let centerLabel = card.suit;

    if (card.rank === 'BJ') {
      displayRank = '小';
      displaySuit = '王';
      centerLabel = '小王';
    } else if (card.rank === 'RJ') {
      displayRank = '大';
      displaySuit = '王';
      centerLabel = '大王';
    }

    el.innerHTML = `
      <div class="card-corner">
        <span class="card-rank">${displayRank}</span>
        <span class="card-suit">${displaySuit}</span>
      </div>
      <div class="card-center-suit">${centerLabel}</div>
    `;

    return el;
  }

  // 渲染整个房间状态
  function renderRoom(room) {
    currentRoom = room;

    viewHome.classList.add('hidden');
    viewTable.classList.remove('hidden');
    roomCodeTag.classList.remove('hidden');
    btnAutoToggle.classList.remove('hidden');
    if (btnLeaveRoom) btnLeaveRoom.classList.remove('hidden');
    currentRoomCodeEl.textContent = room.code;

    const mySeat = room.mySeatIndex;
    const seats = room.seats;

    // 相对座位计算：以我为底，左侧为下家 (my+1)%3，右侧为上家 (my+2)%3
    const leftSeatIndex = (mySeat !== -1) ? (mySeat + 1) % 3 : 1;
    const rightSeatIndex = (mySeat !== -1) ? (mySeat + 2) % 3 : 2;

    const leftData = seats[leftSeatIndex];
    const rightData = seats[rightSeatIndex];
    const myData = (mySeat !== -1) ? seats[mySeat] : null;

    // 1. 渲染倍数
    tableMultiplierNum.textContent = room.gameState.multiplier;

    // 2. 渲染3张底牌
    bottomCardsContainer.innerHTML = '';
    if (room.gameState.bottomCards && room.gameState.bottomCards.length > 0) {
      room.gameState.bottomCards.forEach(c => {
        if (c.rank) {
          bottomCardsContainer.appendChild(createCardElement(c, true));
        } else {
          const back = document.createElement('div');
          back.className = 'bottom-card-item card-back';
          back.textContent = '?';
          bottomCardsContainer.appendChild(back);
        }
      });
    }

    // 3. 渲染左侧玩家
    renderSeatSlot(leftData, pLeft, room, leftSeatIndex);

    // 4. 渲染右侧玩家
    renderSeatSlot(rightData, pRight, room, rightSeatIndex);

    // 5. 渲染我自己的信息与手牌
    if (myData) {
      pMy.avatar.textContent = myData.avatar;
      pMy.name.textContent = myData.name;

      if (room.gameState.landlordSeat !== null) {
        pMy.role.classList.remove('hidden');
        if (room.gameState.landlordSeat === mySeat) {
          pMy.role.textContent = '👑 地主';
          pMy.role.className = 'role-badge landlord';
        } else {
          pMy.role.textContent = '👨‍🌾 农民';
          pMy.role.className = 'role-badge farmer';
        }
      } else {
        pMy.role.classList.add('hidden');
      }

      if (myData.isAuto) {
        pMy.auto.classList.remove('hidden');
        btnAutoToggle.style.color = '#06b6d4';
      } else {
        pMy.auto.classList.add('hidden');
        btnAutoToggle.style.color = '#fff';
      }

      // 渲染我的手牌
      renderMyHandCards(myData.handCards || []);
    }

    // 6. 渲染桌面上一手出的有效牌
    renderTableLastPlay(room);

    // 7. 渲染当前阶段的操作控制条
    renderControlPanels(room, mySeat);
  }

  function renderSeatSlot(seatData, domElements, room, seatIdx) {
    if (!seatData) {
      domElements.avatar.textContent = '🪑';
      domElements.name.textContent = '空座位';
      domElements.role.classList.add('hidden');
      domElements.auto.classList.add('hidden');
      domElements.ready.classList.add('hidden');
      domElements.count.classList.add('hidden');
      domElements.played.innerHTML = '';
      domElements.bubble.classList.add('hidden');
      domElements.timer.classList.add('hidden');
      return;
    }

    domElements.avatar.textContent = seatData.avatar;
    domElements.name.textContent = seatData.name;

    // 准备状态
    if (room.gameState.phase === 'LOBBY') {
      domElements.ready.classList.remove('hidden');
      domElements.ready.textContent = seatData.isReady ? '已准备' : '未准备';
      domElements.ready.style.background = seatData.isReady ? '#10b981' : '#6b7280';
    } else {
      domElements.ready.classList.add('hidden');
    }

    // 角色状态
    if (room.gameState.landlordSeat !== null) {
      domElements.role.classList.remove('hidden');
      if (room.gameState.landlordSeat === seatIdx) {
        domElements.role.textContent = '👑 地主';
        domElements.role.className = 'role-badge landlord';
      } else {
        domElements.role.textContent = '👨‍🌾 农民';
        domElements.role.className = 'role-badge farmer';
      }
    } else {
      domElements.role.classList.add('hidden');
    }

    // 托管状态
    if (seatData.isAuto) {
      domElements.auto.classList.remove('hidden');
    } else {
      domElements.auto.classList.add('hidden');
    }

    // 手牌张数与报单报双警报
    if (room.gameState.phase !== 'LOBBY') {
      domElements.count.classList.remove('hidden');
      if (seatData.cardCount === 1) {
        domElements.count.className = 'card-count-badge danger-single';
        domElements.count.textContent = '⚠️ 剩 1 张!';
      } else if (seatData.cardCount === 2) {
        domElements.count.className = 'card-count-badge danger-double';
        domElements.count.textContent = '⚠️ 剩 2 张';
      } else {
        domElements.count.className = 'card-count-badge';
        domElements.count.textContent = `${seatData.cardCount} 张`;
      }
    } else {
      domElements.count.classList.add('hidden');
    }

    // 轮到此人回合时的光环与倒计时
    const isCurrentTurn = (room.gameState.phase === 'PLAYING' && room.gameState.currentTurnSeat === seatIdx) ||
                          (room.gameState.phase === 'BIDDING' && room.gameState.bidState.currentBidder === seatIdx);

    if (isCurrentTurn) {
      domElements.timer.classList.remove('hidden');
      domElements.avatar.parentElement.style.boxShadow = '0 0 18px #fbbf24';
    } else {
      domElements.timer.classList.add('hidden');
      domElements.avatar.parentElement.style.boxShadow = 'none';
    }
  }

  function renderTableLastPlay(room) {
    pLeft.played.innerHTML = '';
    pRight.played.innerHTML = '';
    pMy.played.innerHTML = '';

    const last = room.gameState.lastValidPlay;
    if (last && last.cards && room.gameState.passCount < 2) {
      const mySeat = room.mySeatIndex;
      let targetContainer = pMy.played;

      if (last.seat === (mySeat + 1) % 3) targetContainer = pLeft.played;
      else if (last.seat === (mySeat + 2) % 3) targetContainer = pRight.played;

      last.cards.forEach(c => {
        targetContainer.appendChild(createCardElement(c, true));
      });
    }
  }

  // 渲染我的手牌 (自适应扇形间距与滑选)
  function renderMyHandCards(cards) {
    pMy.cardsContainer.innerHTML = '';
    const total = cards.length;
    const containerWidth = pMy.cardsContainer.clientWidth || 360;
    const cardWidth = 58;

    // 响应式负边距自适应排列
    let marginOffset = -22;
    if (total > 1) {
      const maxSpan = Math.max(220, containerWidth - cardWidth - 24);
      const step = Math.max(14, Math.min(32, maxSpan / (total - 1)));
      marginOffset = -(cardWidth - step);
    }

    cards.forEach((c, idx) => {
      const isSelected = selectedCards.has(c.id);
      const cardEl = createCardElement(c, false, isSelected);
      if (idx > 0) {
        cardEl.style.marginLeft = `${marginOffset}px`;
      }
      cardEl.dataset.id = c.id;

      // 单击单选
      cardEl.addEventListener('click', (e) => {
        if (selectedCards.has(c.id)) {
          selectedCards.delete(c.id);
          cardEl.classList.remove('selected');
        } else {
          selectedCards.add(c.id);
          cardEl.classList.add('selected');
        }
        window.sfx && window.sfx.playCardSelect();
        updateSelectedCardHUD();
      });

      pMy.cardsContainer.appendChild(cardEl);
    });

    updateSelectedCardHUD();
  }

  // 实时分析当前选牌的牌型，更新底部徽章与出牌按钮激活状态
  function updateSelectedCardHUD() {
    if (!currentRoom || currentRoom.mySeatIndex === -1) return;
    const mySeat = currentRoom.mySeatIndex;
    const myHand = (currentRoom.seats[mySeat] && currentRoom.seats[mySeat].handCards) || [];
    const selectedList = myHand.filter(c => selectedCards.has(c.id));

    if (selectedList.length === 0) {
      selectedCardTypeTag.classList.add('hidden');
      selectedCardTypeTag.className = 'card-type-pill hidden';
      btnSubmitPlay.disabled = true;
      btnSubmitPlay.classList.remove('can-play');
      return;
    }

    selectedCardTypeTag.classList.remove('hidden');

    if (!window.DouDizhuRules) {
      selectedCardTypeTag.textContent = `已选 ${selectedList.length} 张`;
      btnSubmitPlay.disabled = false;
      return;
    }

    const parsed = window.DouDizhuRules.parseHand(selectedList);
    const hasTable = currentRoom.gameState.lastValidPlay && currentRoom.gameState.passCount < 2;
    const tableHand = hasTable ? currentRoom.gameState.lastValidPlay.parsed : null;

    if (parsed.type === window.DouDizhuRules.CARD_TYPES.INVALID) {
      selectedCardTypeTag.textContent = '❌ 不合规则';
      selectedCardTypeTag.className = 'card-type-pill invalid';
      btnSubmitPlay.disabled = true;
      btnSubmitPlay.classList.remove('can-play');
    } else {
      const canBeat = window.DouDizhuRules.canBeat(parsed, tableHand);
      if (canBeat) {
        selectedCardTypeTag.textContent = `✨ ${parsed.name}`;
        selectedCardTypeTag.className = 'card-type-pill valid';
        btnSubmitPlay.disabled = false;
        btnSubmitPlay.classList.add('can-play');
      } else {
        selectedCardTypeTag.textContent = `⚠️ 压不过 (${parsed.name})`;
        selectedCardTypeTag.className = 'card-type-pill warning';
        btnSubmitPlay.disabled = true;
        btnSubmitPlay.classList.remove('can-play');
      }
    }
  }

  // 手牌容器绑定滑动划选（Swipe Drag Selection）
  pMy.cardsContainer.addEventListener('pointerdown', (e) => {
    const cardEl = e.target.closest('.card-item');
    if (!cardEl) return;
    isPointerDragging = true;
    draggedCardIds.clear();
    const id = cardEl.dataset.id;
    if (id) {
      draggedCardIds.add(id);
      cardEl.classList.add('in-drag-select');
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!isPointerDragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el) {
      const cardEl = el.closest('.card-item');
      if (cardEl && cardEl.parentElement === pMy.cardsContainer) {
        const id = cardEl.dataset.id;
        if (id && !draggedCardIds.has(id)) {
          draggedCardIds.add(id);
          cardEl.classList.add('in-drag-select');
        }
      }
    }
  });

  window.addEventListener('pointerup', () => {
    if (!isPointerDragging) return;
    isPointerDragging = false;

    if (draggedCardIds.size > 1) {
      // 多选划牌生效
      draggedCardIds.forEach(id => {
        if (selectedCards.has(id)) selectedCards.delete(id);
        else selectedCards.add(id);
      });
      window.sfx && window.sfx.playCardSelect();
      if (currentRoom && currentRoom.mySeatIndex !== -1) {
        renderMyHandCards(currentRoom.seats[currentRoom.mySeatIndex].handCards || []);
      }
    }

    document.querySelectorAll('.card-item.in-drag-select').forEach(el => {
      el.classList.remove('in-drag-select');
    });
    draggedCardIds.clear();
  });

  // 点击绿色桌面空白处自动取消选牌
  gameTableFelt.addEventListener('click', (e) => {
    if (!e.target.closest('.card-item') &&
        !e.target.closest('.my-controls-bar') &&
        !e.target.closest('.chat-popup') &&
        !e.target.closest('.floating-chat-btn')) {
      if (selectedCards.size > 0) {
        selectedCards.clear();
        if (currentRoom && currentRoom.mySeatIndex !== -1) {
          renderMyHandCards(currentRoom.seats[currentRoom.mySeatIndex].handCards || []);
        }
      }
    }
  });

  function renderControlPanels(room, mySeat) {
    panelLobby.classList.add('hidden');
    panelBid.classList.add('hidden');
    panelPlay.classList.add('hidden');
    if (panelGameover) panelGameover.classList.add('hidden');

    if (mySeat === -1) return; // 观战者不显示操作按钮

    const myData = room.seats[mySeat];
    const isHost = myData.isHost;

    if (room.gameState.phase === 'LOBBY') {
      panelLobby.classList.remove('hidden');
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
    } else if (room.gameState.phase === 'BIDDING') {
      const isMyBid = room.gameState.bidState.currentBidder === mySeat;
      if (isMyBid) {
        panelBid.classList.remove('hidden');
        const isCalling = (room.gameState.bidState.calledSeat === null);
        btnCallBid.textContent = isCalling ? '叫地主' : '抢地主';
        btnPassBid.textContent = isCalling ? '不叫' : '不抢';
      }
    } else if (room.gameState.phase === 'PLAYING') {
      const isMyTurn = room.gameState.currentTurnSeat === mySeat;
      if (isMyTurn) {
        panelPlay.classList.remove('hidden');
        const mustPlay = !room.gameState.lastValidPlay || room.gameState.passCount >= 2;
        btnPassPlay.disabled = mustPlay;
        btnPassPlay.style.opacity = mustPlay ? '0.4' : '1';
        updateSelectedCardHUD();
      }
    } else if (room.gameState.phase === 'GAME_OVER') {
      if (panelGameover) panelGameover.classList.remove('hidden');
    }
  }

  // 倒计时更新与音效提醒
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!currentRoom || !currentRoom.gameState.turnDeadline) return;
    const remain = Math.max(0, Math.ceil((currentRoom.gameState.turnDeadline - Date.now()) / 1000));

    if (currentRoom.gameState.phase === 'BIDDING') {
      bidTimer.textContent = `${remain}s`;
    } else if (currentRoom.gameState.phase === 'PLAYING') {
      playTimer.textContent = `${remain}s`;
    }

    const isMyAction = (currentRoom.gameState.phase === 'PLAYING' && currentRoom.gameState.currentTurnSeat === currentRoom.mySeatIndex) ||
                       (currentRoom.gameState.phase === 'BIDDING' && currentRoom.gameState.bidState.currentBidder === currentRoom.mySeatIndex);

    if (remain <= 5 && remain > 0 && isMyAction) {
      window.sfx && window.sfx.playUrgentTick();
    }
  }, 1000);

  // 动画触发辅助函数
  function triggerScreenShake() {
    if (!gameTableFelt) return;
    gameTableFelt.classList.add('screen-shake');
    setTimeout(() => gameTableFelt.classList.remove('screen-shake'), 600);
  }

  function triggerAirplaneAnim() {
    if (!airplaneAnim) return;
    airplaneAnim.classList.remove('hidden');
    setTimeout(() => airplaneAnim.classList.add('hidden'), 2000);
  }

  function triggerRocketAnim() {
    if (!rocketAnim) return;
    rocketAnim.classList.remove('hidden');
    setTimeout(() => rocketAnim.classList.add('hidden'), 1800);
  }

  function triggerBombAnim() {
    if (!bombAnim) return;
    bombAnim.classList.remove('hidden');
    setTimeout(() => bombAnim.classList.add('hidden'), 1400);
  }

  // 绑定交互事件
  initProfileUI();

  // 创建房间
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

  // 加入房间
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

  // 准备
  btnToggleReady.addEventListener('click', () => {
    socket.emit('toggle_ready');
  });

  // 房主添加电脑
  btnAddAi.addEventListener('click', () => {
    socket.emit('add_ai', (res) => {
      if (res && !res.success) showToast(res.message);
    });
  });

  // 房主开始发牌
  btnStartGame.addEventListener('click', () => {
    socket.emit('host_start_game');
  });

  // 叫地主 / 抢地主
  btnCallBid.addEventListener('click', () => {
    socket.emit('bid', true);
  });

  btnPassBid.addEventListener('click', () => {
    socket.emit('bid', false);
  });

  // 出牌
  btnSubmitPlay.addEventListener('click', () => {
    const cardIds = Array.from(selectedCards);
    if (cardIds.length === 0) {
      showToast('请先选择要出的卡牌');
      return;
    }
    socket.emit('play_cards', cardIds, (res) => {
      if (res && res.success) {
        selectedCards.clear();
        hintCandidates = [];
        updateSelectedCardHUD();
      } else {
        showToast('选牌不符合规则或无法压过上家！');
      }
    });
  });

  // 不出 (Pass)
  btnPassPlay.addEventListener('click', () => {
    socket.emit('pass_turn', (res) => {
      if (res && res.success) {
        selectedCards.clear();
        hintCandidates = [];
        updateSelectedCardHUD();
      }
    });
  });

  // 智能提示功能 (全牌型循环推荐)
  btnHintPlay.addEventListener('click', () => {
    if (!currentRoom || currentRoom.mySeatIndex === -1) return;
    const mySeat = currentRoom.mySeatIndex;
    const myHand = (currentRoom.seats[mySeat] && currentRoom.seats[mySeat].handCards) || [];
    const lastPlay = currentRoom.gameState.lastValidPlay;
    const hasTable = lastPlay && currentRoom.gameState.passCount < 2;
    const tableHand = hasTable ? lastPlay.parsed : null;

    if (!window.DouDizhuRules) return;

    hintCandidates = window.DouDizhuRules.findBeatingHands(myHand, tableHand);
    if (!hintCandidates || hintCandidates.length === 0) {
      showToast('没有牌大过上家，请点不出！');
      btnPassPlay.style.boxShadow = '0 0 16px #f59e0b';
      setTimeout(() => { btnPassPlay.style.boxShadow = 'none'; }, 1500);
      return;
    }

    const choice = hintCandidates[hintIndex % hintCandidates.length];
    hintIndex++;

    selectedCards.clear();
    choice.forEach(c => selectedCards.add(c.id));
    renderMyHandCards(myHand);
    window.sfx && window.sfx.playCardSelect();
  });

  // 重置选牌
  btnResetCards.addEventListener('click', () => {
    selectedCards.clear();
    if (currentRoom && currentRoom.mySeatIndex !== -1) {
      renderMyHandCards(currentRoom.seats[currentRoom.mySeatIndex].handCards || []);
    }
  });

  // 快捷互动弹窗开关
  btnOpenChat.addEventListener('click', () => {
    panelChatPopup.classList.toggle('hidden');
  });

  btnCloseChat.addEventListener('click', () => {
    panelChatPopup.classList.add('hidden');
  });

  document.querySelectorAll('.chat-emoji-btn, .chat-phrase-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.text;
      if (text) {
        socket.emit('send_reaction', text);
        panelChatPopup.classList.add('hidden');
      }
    });
  });

  // 托管开关
  btnAutoToggle.addEventListener('click', () => {
    socket.emit('toggle_auto');
  });

  // 音效开关
  btnSound.addEventListener('click', () => {
    const enabled = window.sfx && window.sfx.toggleSound();
    btnSound.textContent = enabled ? '🔊' : '🔇';
    showToast(enabled ? '🔊 音效与国语配音已开启' : '🔇 音效已静音');
  });

  // 规则弹窗
  btnRules.addEventListener('click', () => modalRules.classList.remove('hidden'));
  btnCloseRules.addEventListener('click', () => modalRules.classList.add('hidden'));

  // 再来一局 (弹窗按钮)
  btnPlayAgain.addEventListener('click', () => {
    modalSettle.classList.add('hidden');
    socket.emit('play_again');
    showToast('🔄 正在开启新对局...');
  });

  // 牌桌底部的结算与再来一局快捷按钮
  if (btnShowSettleModal) {
    btnShowSettleModal.addEventListener('click', () => {
      modalSettle.classList.remove('hidden');
    });
  }

  if (btnQuickPlayAgain) {
    btnQuickPlayAgain.addEventListener('click', () => {
      modalSettle.classList.add('hidden');
      socket.emit('play_again');
      showToast('🔄 正在开启新对局...');
    });
  }

  if (btnCloseSettle) {
    btnCloseSettle.addEventListener('click', () => {
      modalSettle.classList.add('hidden');
    });
  }

  // 扫码邀请弹窗
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
      showToast('房间链接已复制到剪贴板');
    });
  });

  function openShareModal(roomCode) {
    modalShare.classList.remove('hidden');
    shareNetworkOptions.innerHTML = '';

    const isPublicOrigin = window.location.protocol === 'https:' ||
      (!['localhost', '127.0.0.1'].includes(window.location.hostname) &&
       !window.location.hostname.startsWith('192.168.') &&
       !window.location.hostname.startsWith('10.') &&
       !window.location.hostname.startsWith('172.'));

    const basePath = '/doudizhu';
    let primaryUrl = window.location.origin;

    function buildUrl(base) {
      return `${base}${basePath}/?room=${roomCode}`;
    }

    if (isPublicOrigin) {
      const pubUrl = buildUrl(window.location.origin);
      const card = document.createElement('div');
      card.style.cssText = `padding: 12px; background: rgba(168,85,247,0.12); border: 1px solid rgba(168,85,247,0.35); border-radius: 8px; text-align: center; margin-bottom: 8px;`;
      card.innerHTML = `
        <div style="font-weight:700; color:#d8b4fe; font-size:13px; word-break: break-all;">${pubUrl}</div>
        <div style="font-size:11px; color:#9ca3af; margin-top: 4px;">✨ 专属房间链接已生成 · 微信或手机扫码即入</div>
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
            <div style="font-size:11px; color:#9ca3af;">${item.name}</div>
          </div>
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;">生成此码</button>
        `;
        card.addEventListener('click', () => drawQR(itemUrl));
        shareNetworkOptions.appendChild(card);
      });
    }

    drawQR(buildUrl(primaryUrl));
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

  // Socket 核心消息接收
  socket.on('room_update', (room) => {
    renderRoom(room);
  });

  socket.on('cards_dealt', () => {
    modalSettle.classList.add('hidden');
    window.sfx && window.sfx.playDeal();
    showToast('🎴 开始发牌！理牌中...');
  });

  socket.on('bid_action_broadcast', ({ seatIndex, actionText, wantBid, multiplier }) => {
    tableMultiplierNum.textContent = multiplier;
    const bubble = getBubbleBySeat(seatIndex);
    if (bubble) {
      bubble.textContent = actionText;
      bubble.classList.remove('hidden');
      setTimeout(() => bubble.classList.add('hidden'), 2000);
    }

    if (actionText === '叫地主') {
      window.sfx && window.sfx.playCallBid();
    } else if (actionText === '不叫') {
      window.sfx && window.sfx.playPassBid();
    } else if (actionText === '抢地主') {
      window.sfx && window.sfx.playRobBid();
    } else if (actionText === '不抢') {
      window.sfx && window.sfx.playPassRob();
    }
  });

  socket.on('landlord_decided', ({ landlordSeat, multiplier }) => {
    tableMultiplierNum.textContent = multiplier;
    const isMe = (currentRoom && currentRoom.mySeatIndex === landlordSeat);
    bannerText.textContent = isMe ? '👑 你成为了地主！底牌已收入！' : '👑 地主已诞生！进入对局！';
    tableBannerAlert.classList.remove('hidden');
    setTimeout(() => tableBannerAlert.classList.add('hidden'), 2500);
    window.sfx && window.sfx.speak(isMe ? '你是地主！' : '进入对局！');
  });

  socket.on('action_played', ({ seatIndex, isBomb, isRocket, cardType, cards, remainingCount }) => {
    window.sfx && window.sfx.playCardCombo(cardType, cards ? cards.length : 0);

    if (isRocket) {
      bannerText.textContent = '🚀 王炸！秒杀一切！倍数翻倍！';
      tableBannerAlert.classList.remove('hidden');
      triggerRocketAnim();
      triggerScreenShake();
      setTimeout(() => tableBannerAlert.classList.add('hidden'), 2500);
    } else if (isBomb) {
      bannerText.textContent = '💣 炸弹！倍数翻倍！';
      tableBannerAlert.classList.remove('hidden');
      triggerBombAnim();
      triggerScreenShake();
      setTimeout(() => tableBannerAlert.classList.add('hidden'), 2500);
    } else if (cardType && cardType.includes('AIRPLANE')) {
      triggerAirplaneAnim();
    }

    // 报单与报双预警
    if (remainingCount === 1) {
      window.sfx && window.sfx.playAlertSingle();
      showToast('⚠️ 警报：有玩家只剩 1 张牌了！');
    } else if (remainingCount === 2) {
      window.sfx && window.sfx.playAlertDouble();
      showToast('⚠️ 注意：有玩家只剩 2 张牌了！');
    }
  });

  socket.on('action_passed', ({ seatIndex }) => {
    const bubble = getBubbleBySeat(seatIndex);
    if (bubble) {
      bubble.textContent = '不出';
      bubble.classList.remove('hidden');
      setTimeout(() => bubble.classList.add('hidden'), 1500);
    }
    window.sfx && window.sfx.playPass();
  });

  socket.on('reaction_received', ({ senderId, name, avatar, content }) => {
    if (!currentRoom) return;
    const seatIdx = currentRoom.seats.findIndex(s => s && s.id === senderId);
    if (seatIdx !== -1) {
      const bubble = getBubbleBySeat(seatIdx);
      if (bubble) {
        bubble.textContent = `${content}`;
        bubble.classList.remove('hidden');
        setTimeout(() => bubble.classList.add('hidden'), 3500);
      }
    }
    if (content && content.length > 1 && window.sfx) {
      window.sfx.speak(content);
    }
  });

  socket.on('game_over_announced', ({ winnerSeat, winnerRole, spring, springType, multiplier, scores, revealedSeats }) => {
    const isMeWinner = (currentRoom && currentRoom.mySeatIndex === winnerSeat) ||
      (winnerRole === 'FARMER' && currentRoom && currentRoom.mySeatIndex !== currentRoom.gameState.landlordSeat);

    if (isMeWinner) {
      window.sfx && window.sfx.playWin();
    } else {
      window.sfx && window.sfx.playLose();
    }

    if (spring) {
      window.sfx && window.sfx.playSpring();
    }

    // 牌桌中央横幅提示
    const winTitle = winnerRole === 'LANDLORD' ? '👑 游戏结束！地主获胜！' : '👨‍🌾 游戏结束！农民获胜！';
    if (bannerText && tableBannerAlert) {
      bannerText.textContent = spring ? `${winTitle} (${springType})` : winTitle;
      tableBannerAlert.classList.remove('hidden');
      setTimeout(() => tableBannerAlert.classList.add('hidden'), 3500);
    }
    showToast(winTitle, 3500);

    // 渲染结算弹窗
    settleTitle.textContent = winnerRole === 'LANDLORD' ? '👑 地主获胜' : '👨‍🌾 农民获胜';
    settleSubtitle.textContent = spring ? `${springType} · ${multiplier}倍结算` : `经典结算 · ${multiplier}倍底分`;

    // 使用服务端打包的 revealedSeats，若没有则回退到 currentRoom.seats
    const seatList = revealedSeats || (currentRoom && currentRoom.seats) || [];

    settleScoresGrid.innerHTML = '';
    seatList.forEach((s, idx) => {
      if (!s) return;
      const score = (scores && scores[idx] !== undefined) ? scores[idx] : (s.score || 0);
      const col = document.createElement('div');
      col.className = `score-col ${idx === winnerSeat ? 'winner' : ''}`;
      col.innerHTML = `
        <div style="font-size:24px;">${s.avatar || '👤'}</div>
        <div style="font-size:12px; font-weight:700; margin-top:2px;">${s.name || `玩家${idx+1}`}${s.isLandlord ? ' (地主)' : ''}</div>
        <div class="score-val ${score >= 0 ? 'positive' : 'negative'}">${score >= 0 ? '+' : ''}${score}</div>
      `;
      settleScoresGrid.appendChild(col);
    });

    // 揭示全员手牌复盘
    settleRevealedHands.innerHTML = '<div style="font-weight:700; margin-bottom:6px; color:#cbd5e1;">全员手牌复盘:</div>';
    seatList.forEach((s, idx) => {
      if (!s) return;
      const row = document.createElement('div');
      row.className = 'revealed-row';
      const cardsDiv = document.createElement('div');
      cardsDiv.className = 'revealed-row-cards';
      const handCards = s.handCards || [];
      if (handCards.length === 0) {
        cardsDiv.innerHTML = '<span style="color:#4ade80; font-size:12px; font-weight:700;">🎉 手牌已全部出完</span>';
      } else {
        handCards.forEach(c => cardsDiv.appendChild(createCardElement(c, true)));
      }

      row.innerHTML = `<div><strong>${s.name || `玩家${idx+1}`}</strong> (${handCards.length}张):</div>`;
      row.appendChild(cardsDiv);
      settleRevealedHands.appendChild(row);
    });

    // 500ms 丝滑平滑过渡后弹出结算弹窗，确保最后一张牌的出牌动画和桌面渲染完毕
    setTimeout(() => {
      modalSettle.classList.remove('hidden');
    }, 500);
  });

  function getBubbleBySeat(seatIndex) {
    if (!currentRoom) return null;
    const mySeat = currentRoom.mySeatIndex;
    if (seatIndex === mySeat) return pMy.bubble;
    if (seatIndex === (mySeat + 1) % 3) return pLeft.bubble;
    if (seatIndex === (mySeat + 2) % 3) return pRight.bubble;
    return null;
  }

  // 退出房间处理
  function exitToHome() {
    currentRoom = null;
    sessionStorage.removeItem('doudizhu_room');
    viewHome.classList.remove('hidden');
    viewTable.classList.add('hidden');
    roomCodeTag.classList.add('hidden');
    btnAutoToggle.classList.add('hidden');
    if (btnLeaveRoom) btnLeaveRoom.classList.add('hidden');
    if (modalSettle) modalSettle.classList.add('hidden');
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function confirmLeaveRoom() {
    window.sfx && window.sfx.playClick();
    if (confirm('确定要退出当前斗地主房间吗？')) {
      socket.emit('leave_room', () => {});
      exitToHome();
    }
  }

  if (btnLeaveRoom) btnLeaveRoom.addEventListener('click', confirmLeaveRoom);
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

  // 检查 URL 是否带房间号自动加入
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam && roomParam.length === 4) {
    roomCodeInput.value = roomParam;
    joinRoomByCode(roomParam);
  }
})();
