// 欢乐斗地主 - 客户端核心逻辑
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

  // 牌桌元素
  const bottomCardsContainer = document.getElementById('bottom-cards-container');
  const tableMultiplierNum = document.getElementById('table-multiplier-num');
  const tableBannerAlert = document.getElementById('table-banner-alert');
  const bannerText = document.getElementById('banner-text');

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
  const btnPassPlay = document.getElementById('btn-pass-play');
  const btnHintPlay = document.getElementById('btn-hint-play');
  const btnSubmitPlay = document.getElementById('btn-submit-play');
  const btnResetCards = document.getElementById('btn-reset-cards-selection');

  // 弹窗元素
  const modalShare = document.getElementById('modal-share');
  const btnCloseShare = document.getElementById('btn-close-share');
  const shareLinkInput = document.getElementById('share-link-input');
  const btnCopyShareLink = document.getElementById('btn-copy-share-link');
  const shareNetworkOptions = document.getElementById('share-network-options');

  const modalRules = document.getElementById('modal-rules');
  const btnCloseRules = document.getElementById('btn-close-rules');

  const modalSettle = document.getElementById('modal-settle');
  const settleTitle = document.getElementById('settle-title');
  const settleSubtitle = document.getElementById('settle-subtitle');
  const settleScoresGrid = document.getElementById('settle-scores-grid');
  const settleRevealedHands = document.getElementById('settle-revealed-hands');
  const btnPlayAgain = document.getElementById('btn-play-again');

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

  // 渲染卡牌 DOM 组件
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

    // 托管
    if (seatData.isAuto) {
      domElements.auto.classList.remove('hidden');
    } else {
      domElements.auto.classList.add('hidden');
    }

    // 手牌张数
    if (room.gameState.phase !== 'LOBBY') {
      domElements.count.classList.remove('hidden');
      domElements.count.textContent = `${seatData.cardCount} 张`;
    } else {
      domElements.count.classList.add('hidden');
    }

    // 轮到此人回合时的倒计时
    const isCurrentTurn = (room.gameState.phase === 'PLAYING' && room.gameState.currentTurnSeat === seatIdx) ||
                          (room.gameState.phase === 'BIDDING' && room.gameState.bidState.currentBidder === seatIdx);

    if (isCurrentTurn) {
      domElements.timer.classList.remove('hidden');
      domElements.avatar.parentElement.style.boxShadow = '0 0 15px #fbbf24';
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

  function renderMyHandCards(cards) {
    pMy.cardsContainer.innerHTML = '';
    cards.forEach(c => {
      const isSelected = selectedCards.has(c.id);
      const cardEl = createCardElement(c, false, isSelected);

      cardEl.addEventListener('click', () => {
        if (selectedCards.has(c.id)) {
          selectedCards.delete(c.id);
          cardEl.classList.remove('selected');
        } else {
          selectedCards.add(c.id);
          cardEl.classList.add('selected');
        }
        window.sfx && window.sfx.playCardSelect();
      });

      pMy.cardsContainer.appendChild(cardEl);
    });
  }

  function renderControlPanels(room, mySeat) {
    panelLobby.classList.add('hidden');
    panelBid.classList.add('hidden');
    panelPlay.classList.add('hidden');

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
        // 若桌面无牌或已连续两次不出，我必须主动出牌，禁用“不出”
        const mustPlay = !room.gameState.lastValidPlay || room.gameState.passCount >= 2;
        btnPassPlay.disabled = mustPlay;
        btnPassPlay.style.opacity = mustPlay ? '0.4' : '1';
      }
    }
  }

  // 倒计时更新定时器
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!currentRoom || !currentRoom.gameState.turnDeadline) return;
    const remain = Math.max(0, Math.ceil((currentRoom.gameState.turnDeadline - Date.now()) / 1000));

    if (currentRoom.gameState.phase === 'BIDDING') {
      bidTimer.textContent = `${remain}s`;
    } else if (currentRoom.gameState.phase === 'PLAYING') {
      playTimer.textContent = `${remain}s`;
    }

    if (remain <= 4 && remain > 0 && (currentRoom.gameState.currentTurnSeat === currentRoom.mySeatIndex || currentRoom.gameState.bidState.currentBidder === currentRoom.mySeatIndex)) {
      window.sfx && window.sfx.playUrgentTick();
    }
  }, 1000);

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
        alert((res && res.message) || '加入房间失败');
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
      if (res && !res.success) alert(res.message);
    });
  });

  // 房主开始发牌
  btnStartGame.addEventListener('click', () => {
    socket.emit('host_start_game');
  });

  // 叫地主 / 抢地主
  btnCallBid.addEventListener('click', () => {
    window.sfx && window.sfx.playBid();
    socket.emit('bid', true);
  });

  btnPassBid.addEventListener('click', () => {
    window.sfx && window.sfx.playPass();
    socket.emit('bid', false);
  });

  // 出牌
  btnSubmitPlay.addEventListener('click', () => {
    const cardIds = Array.from(selectedCards);
    if (cardIds.length === 0) {
      alert('请先选择要出的卡牌');
      return;
    }
    socket.emit('play_cards', cardIds, (res) => {
      if (res && res.success) {
        selectedCards.clear();
        hintCandidates = [];
      } else {
        alert('选牌不符合规则或无法压过上家！');
      }
    });
  });

  // 不出 (Pass)
  btnPassPlay.addEventListener('click', () => {
    socket.emit('pass_turn', (res) => {
      if (res && res.success) {
        selectedCards.clear();
        hintCandidates = [];
        window.sfx && window.sfx.playPass();
      }
    });
  });

  // 智能提示功能
  btnHintPlay.addEventListener('click', () => {
    if (!currentRoom) return;
    const mySeat = currentRoom.mySeatIndex;
    const myHand = currentRoom.seats[mySeat].handCards || [];
    const lastPlay = currentRoom.gameState.lastValidPlay;
    const hasTable = lastPlay && currentRoom.gameState.passCount < 2;

    // 前端直接调用匹配逻辑
    hintCandidates = findClientBeatingHands(myHand, hasTable ? lastPlay.parsed : null);
    if (hintCandidates.length === 0) {
      alert('没有可以大过上家的牌');
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

  // 托管开关
  btnAutoToggle.addEventListener('click', () => {
    socket.emit('toggle_auto');
  });

  // 音效开关
  btnSound.addEventListener('click', () => {
    const enabled = window.sfx && window.sfx.toggleSound();
    btnSound.textContent = enabled ? '🔊' : '🔇';
  });

  // 规则弹窗
  btnRules.addEventListener('click', () => modalRules.classList.remove('hidden'));
  btnCloseRules.addEventListener('click', () => modalRules.classList.add('hidden'));

  // 再来一局
  btnPlayAgain.addEventListener('click', () => {
    modalSettle.classList.add('hidden');
    socket.emit('play_again');
  });

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
    window.sfx && window.sfx.playDeal();
  });

  socket.on('bid_action_broadcast', ({ seatIndex, actionText, wantBid, multiplier }) => {
    tableMultiplierNum.textContent = multiplier;
    const bubble = getBubbleBySeat(seatIndex);
    if (bubble) {
      bubble.textContent = actionText;
      bubble.classList.remove('hidden');
      setTimeout(() => bubble.classList.add('hidden'), 2000);
    }
  });

  socket.on('landlord_decided', ({ landlordSeat, multiplier }) => {
    tableMultiplierNum.textContent = multiplier;
    bannerText.textContent = `👑 地主已诞生！进入对局！`;
    tableBannerAlert.classList.remove('hidden');
    setTimeout(() => tableBannerAlert.classList.add('hidden'), 2500);
    window.sfx && window.sfx.playBid();
  });

  socket.on('action_played', ({ seatIndex, isBomb, isRocket, cardType }) => {
    window.sfx && window.sfx.playCardPlay();

    if (isRocket) {
      bannerText.textContent = '🚀 王炸！秒杀一切！倍数翻倍！';
      tableBannerAlert.classList.remove('hidden');
      window.sfx && window.sfx.playRocket();
      setTimeout(() => tableBannerAlert.classList.add('hidden'), 2500);
    } else if (isBomb) {
      bannerText.textContent = '💣 炸弹！倍数翻倍！';
      tableBannerAlert.classList.remove('hidden');
      window.sfx && window.sfx.playBomb();
      setTimeout(() => tableBannerAlert.classList.add('hidden'), 2500);
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

  socket.on('game_over_announced', ({ winnerSeat, winnerRole, spring, springType, multiplier, scores }) => {
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

    // 渲染结算弹窗
    settleTitle.textContent = winnerRole === 'LANDLORD' ? '👑 地主获胜' : '👨‍🌾 农民获胜';
    settleSubtitle.textContent = spring ? `${springType} · ${multiplier}倍结算` : `经典结算 · ${multiplier}倍底分`;

    settleScoresGrid.innerHTML = '';
    currentRoom.seats.forEach((s, idx) => {
      if (!s) return;
      const score = scores[idx] || 0;
      const col = document.createElement('div');
      col.className = `score-col ${idx === winnerSeat ? 'winner' : ''}`;
      col.innerHTML = `
        <div style="font-size:20px;">${s.avatar}</div>
        <div style="font-size:12px; font-weight:700; margin-top:2px;">${s.name}</div>
        <div class="score-val ${score >= 0 ? 'positive' : 'negative'}">${score >= 0 ? '+' : ''}${score}</div>
      `;
      settleScoresGrid.appendChild(col);
    });

    // 揭示全员手牌
    settleRevealedHands.innerHTML = '<div style="font-weight:700; margin-bottom:6px; color:#cbd5e1;">全员手牌复盘:</div>';
    currentRoom.seats.forEach((s, idx) => {
      if (!s) return;
      const row = document.createElement('div');
      row.className = 'revealed-row';
      const cardsDiv = document.createElement('div');
      cardsDiv.className = 'revealed-row-cards';
      (s.handCards || []).forEach(c => cardsDiv.appendChild(createCardElement(c, true)));

      row.innerHTML = `<div><strong>${s.name}</strong> (${(s.handCards || []).length}张):</div>`;
      row.appendChild(cardsDiv);
      settleRevealedHands.appendChild(row);
    });

    modalSettle.classList.remove('hidden');
  });

  function getBubbleBySeat(seatIndex) {
    if (!currentRoom) return null;
    const mySeat = currentRoom.mySeatIndex;
    if (seatIndex === mySeat) return pMy.bubble;
    if (seatIndex === (mySeat + 1) % 3) return pLeft.bubble;
    if (seatIndex === (mySeat + 2) % 3) return pRight.bubble;
    return null;
  }

  // 简易客户端提示匹配 (寻找能压过桌面的牌型)
  function findClientBeatingHands(myHand, tableHand) {
    if (!myHand || myHand.length === 0) return [];
    // 桌面无牌，返回最小单张或对子
    if (!tableHand) {
      return [[myHand[myHand.length - 1]]];
    }
    // 简易寻找单张或对子比 tableHand.value 大的牌
    const res = [];
    if (tableHand.type === 'SINGLE') {
      for (let i = myHand.length - 1; i >= 0; i--) {
        if (myHand[i].value > tableHand.value) {
          res.push([myHand[i]]);
        }
      }
    } else if (tableHand.type === 'PAIR') {
      const map = {};
      myHand.forEach(c => { map[c.value] = map[c.value] || []; map[c.value].push(c); });
      Object.keys(map).sort((a, b) => Number(a) - Number(b)).forEach(val => {
        if (Number(val) > tableHand.value && map[val].length >= 2) {
          res.push(map[val].slice(0, 2));
        }
      });
    }
    return res.length > 0 ? res : [];
  }

  // 检查 URL 是否带房间号自动加入
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam && roomParam.length === 4) {
    roomCodeInput.value = roomParam;
    joinRoomByCode(roomParam);
  }
})();
