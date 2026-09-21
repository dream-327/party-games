// 害你在心口难开 - 客户端逻辑引擎

(function() {
  // 1. 初始化基础状态
  const socket = io('/trapwords');
  const sfx = window.sfx;

  let myPlayerId = localStorage.getItem('trapwords_player_id');
  if (!myPlayerId) {
    myPlayerId = 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    localStorage.setItem('trapwords_player_id', myPlayerId);
  }

  let myPlayerName = localStorage.getItem('trapwords_player_name') || '';
  let myPlayerAvatar = localStorage.getItem('trapwords_player_avatar') || '😎';
  let currentRoomCode = null;
  let currentRoomData = null;
  let lastCaughtTimestamp = null;

  // DOM 元素缓存
  const views = {
    lobby: document.getElementById('view-lobby'),
    playing: document.getElementById('view-playing'),
    myDock: document.getElementById('my-mystery-dock'),
    preRoom: document.getElementById('section-pre-room'),
    inRoom: document.getElementById('section-in-room')
  };

  const navElements = {
    roomBadge: document.getElementById('nav-room-badge'),
    btnShare: document.getElementById('btn-share'),
    btnSound: document.getElementById('btn-sound-toggle'),
    btnRules: document.getElementById('btn-rules')
  };

  const lobbyElements = {
    inputName: document.getElementById('input-player-name'),
    inputRoomCode: document.getElementById('input-room-code'),
    btnRandomName: document.getElementById('btn-random-name'),
    avatarSelector: document.getElementById('avatar-selector'),
    btnCreateRoom: document.getElementById('btn-create-room'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    btnAddAi: document.getElementById('btn-add-ai'),
    btnRemoveAi: document.getElementById('btn-remove-ai'),
    categoryChips: document.getElementById('category-chips'),
    playerCount: document.getElementById('player-count'),
    roomPlayersList: document.getElementById('room-players-list'),
    hostControls: document.getElementById('host-controls'),
    btnStartGame: document.getElementById('btn-start-game'),
    inputCustomWord: document.getElementById('input-custom-word'),
    btnAddCustomWord: document.getElementById('btn-add-custom-word'),
    customWordsBadge: document.getElementById('custom-words-badge'),
    customTagsContainer: document.getElementById('custom-tags-container'),
    btnClearCustomWords: document.getElementById('btn-clear-custom-words')
  };

  const playingElements = {
    cardsGrid: document.getElementById('playing-cards-grid'),
    btnHostReset: document.getElementById('btn-host-reset'),
    dockAvatar: document.getElementById('my-dock-avatar'),
    dockName: document.getElementById('my-dock-name')
  };

  const modalCaught = {
    el: document.getElementById('modal-caught'),
    avatar: document.getElementById('modal-caught-avatar'),
    title: document.getElementById('modal-caught-title'),
    subtitle: document.getElementById('modal-caught-subtitle'),
    word: document.getElementById('modal-caught-word'),
    punishment: document.getElementById('modal-caught-punishment'),
    btnReroll: document.getElementById('btn-modal-reroll'),
    btnNext: document.getElementById('btn-modal-next')
  };

  const modalShare = {
    el: document.getElementById('modal-share'),
    qrcodeCanvas: document.getElementById('qrcode-canvas'),
    inputUrl: document.getElementById('input-share-url'),
    btnCopy: document.getElementById('btn-copy-url'),
    btnClose: document.getElementById('btn-close-share')
  };

  const modalRules = {
    el: document.getElementById('modal-rules'),
    btnClose: document.getElementById('btn-close-rules')
  };

  const RANDOM_NAMES = ['戏精本精', '麦霸小王子', '摸鱼大师', '干饭第一名', '八卦吃瓜群众', '绝绝子本子', '聊天鬼才', '社牛天花板'];

  // 2. 初始化个人资料
  if (!myPlayerName) {
    myPlayerName = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    localStorage.setItem('trapwords_player_name', myPlayerName);
  }
  lobbyElements.inputName.value = myPlayerName;

  // 头像选择回填
  const avatarOpts = lobbyElements.avatarSelector.querySelectorAll('.avatar-opt');
  avatarOpts.forEach(opt => {
    if (opt.dataset.avatar === myPlayerAvatar) {
      avatarOpts.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    }
    opt.addEventListener('click', () => {
      sfx.playClick();
      avatarOpts.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      myPlayerAvatar = opt.dataset.avatar;
      localStorage.setItem('trapwords_player_avatar', myPlayerAvatar);
    });
  });

  // 随机名字
  lobbyElements.btnRandomName.addEventListener('click', () => {
    sfx.playClick();
    myPlayerName = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    lobbyElements.inputName.value = myPlayerName;
    localStorage.setItem('trapwords_player_name', myPlayerName);
  });

  lobbyElements.inputName.addEventListener('change', () => {
    const val = lobbyElements.inputName.value.trim();
    if (val) {
      myPlayerName = val;
      localStorage.setItem('trapwords_player_name', myPlayerName);
    }
  });

  // 3. 房间路由与 URL 参数处理 (支持扫码直接进房)
  function checkUrlForRoom() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room') || window.location.hash.replace('#', '');
    if (roomFromUrl && /^\d{4}$/.test(roomFromUrl)) {
      lobbyElements.inputRoomCode.value = roomFromUrl;
      // 延迟自动加入
      setTimeout(() => {
        joinRoom(roomFromUrl);
      }, 300);
    }
  }

  // 4. 音效开关
  function updateSoundButton() {
    navElements.btnSound.textContent = sfx.enabled ? '🔊' : '🔇';
  }
  updateSoundButton();
  navElements.btnSound.addEventListener('click', () => {
    sfx.toggle();
    updateSoundButton();
    if (sfx.enabled) sfx.playClick();
  });

  // 规则弹窗
  navElements.btnRules.addEventListener('click', () => {
    sfx.playClick();
    modalRules.el.classList.add('active');
  });
  modalRules.btnClose.addEventListener('click', () => {
    sfx.playClick();
    modalRules.el.classList.remove('active');
  });

  // 分享弹窗
  navElements.btnShare.addEventListener('click', () => {
    sfx.playClick();
    showShareModal();
  });
  modalShare.btnClose.addEventListener('click', () => {
    sfx.playClick();
    modalShare.el.classList.remove('active');
  });
  modalShare.btnCopy.addEventListener('click', () => {
    sfx.playClick();
    modalShare.inputUrl.select();
    navigator.clipboard.writeText(modalShare.inputUrl.value).then(() => {
      modalShare.btnCopy.textContent = '✅ 已复制';
      setTimeout(() => {
        modalShare.btnCopy.textContent = '复制链接';
      }, 2000);
    }).catch(() => {
      document.execCommand('copy');
      modalShare.btnCopy.textContent = '✅ 已复制';
    });
  });

  function showShareModal() {
    if (!currentRoomCode) return;
    const shareUrl = `${window.location.origin}/trapwords/?room=${currentRoomCode}`;
    modalShare.inputUrl.value = shareUrl;
    modalShare.qrcodeCanvas.innerHTML = '';
    if (window.QRCode) {
      new QRCode(modalShare.qrcodeCanvas, {
        text: shareUrl,
        width: 170,
        height: 170,
        colorDark: '#0b0f19',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }
    modalShare.el.classList.add('active');
  }

  // 5. 房间操作：创建与加入
  function getMyProfile() {
    return {
      id: myPlayerId,
      name: myPlayerName || '好基友',
      avatar: myPlayerAvatar || '😎'
    };
  }

  lobbyElements.btnCreateRoom.addEventListener('click', () => {
    sfx.playClick();
    const activeCatEl = lobbyElements.categoryChips.querySelector('.category-chip.active');
    const category = activeCatEl ? activeCatEl.dataset.cat : 'all';

    socket.emit('create_room', {
      player: getMyProfile(),
      settings: { category }
    }, (res) => {
      if (res && res.success) {
        currentRoomCode = res.roomCode;
        sfx.playFanfare();
        handleRoomUpdate(res.roomData);
      } else {
        alert(res ? res.message : '创建房间失败');
      }
    });
  });

  lobbyElements.btnJoinRoom.addEventListener('click', () => {
    sfx.playClick();
    const code = lobbyElements.inputRoomCode.value.trim();
    if (!code || !/^\d{4}$/.test(code)) {
      alert('请输入4位有效房间号');
      return;
    }
    joinRoom(code);
  });

  function joinRoom(code) {
    socket.emit('join_room', {
      roomCode: code,
      player: getMyProfile()
    }, (res) => {
      if (res && res.success) {
        currentRoomCode = res.roomCode;
        sfx.playFanfare();
        handleRoomUpdate(res.roomData);
      } else {
        alert(res ? res.message : '加入房间失败');
      }
    });
  }

  // 电脑端测试加电脑
  lobbyElements.btnAddAi.addEventListener('click', () => {
    sfx.playClick();
    socket.emit('add_ai');
  });
  lobbyElements.btnRemoveAi.addEventListener('click', () => {
    sfx.playClick();
    socket.emit('remove_ai');
  });

  // 词库类别切换 (房主)
  lobbyElements.categoryChips.querySelectorAll('.category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      sfx.playClick();
      lobbyElements.categoryChips.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      if (currentRoomData && currentRoomData.hostId === myPlayerId) {
        socket.emit('update_settings', {
          category: chip.dataset.cat
        });
      }
    });
  });

  // 自定义词添加与操作
  function submitCustomWord() {
    const val = lobbyElements.inputCustomWord.value.trim();
    if (!val) return;
    sfx.playClick();
    socket.emit('add_custom_word', { word: val }, (res) => {
      if (res && res.success) {
        lobbyElements.inputCustomWord.value = '';
      }
    });
  }

  lobbyElements.btnAddCustomWord.addEventListener('click', submitCustomWord);
  lobbyElements.inputCustomWord.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCustomWord();
    }
  });

  // 快捷预设词点击添加
  document.querySelectorAll('.preset-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      sfx.playClick();
      socket.emit('add_custom_word', { word: tag.dataset.word });
    });
  });

  // 清空自定义词
  lobbyElements.btnClearCustomWords.addEventListener('click', () => {
    if (confirm('确定要清空房间内所有自定义禁忌词吗？')) {
      sfx.playClick();
      socket.emit('clear_custom_words');
    }
  });

  // 房主开始游戏
  lobbyElements.btnStartGame.addEventListener('click', () => {
    sfx.playClick();
    socket.emit('start_game', {}, (res) => {
      if (res && !res.success) {
        alert(res.message);
      }
    });
  });

  // 房主重置回大厅
  playingElements.btnHostReset.addEventListener('click', () => {
    if (confirm('确定要结束当前对局并返回大厅吗？')) {
      sfx.playClick();
      socket.emit('back_to_lobby');
    }
  });

  // 6. Socket 事件接收与渲染分发
  socket.on('room_update', (roomData) => {
    handleRoomUpdate(roomData);
  });

  socket.on('public_notice', (notice) => {
    if (notice && notice.type === 'caught') {
      sfx.playCaught();
      if (navigator.vibrate) {
        try { navigator.vibrate([100, 80, 250]); } catch (e) {}
      }
    }
  });

  socket.on('punishment_rerolled', (data) => {
    sfx.playDice();
  });

  function handleRoomUpdate(data) {
    if (!data) return;
    currentRoomData = data;
    currentRoomCode = data.code;

    // 更新顶部栏
    navElements.roomBadge.style.display = 'block';
    navElements.roomBadge.textContent = `房间: ${data.code}`;
    navElements.btnShare.style.display = 'inline-flex';

    // 状态机分流：LOBBY vs PLAYING
    if (data.gameState.phase === 'LOBBY') {
      renderLobby(data);
    } else if (data.gameState.phase === 'PLAYING') {
      renderPlaying(data);
    }

    // 中招弹窗处理
    renderCaughtModal(data);
  }

  // 7. 渲染大厅
  function renderLobby(data) {
    views.lobby.style.display = 'flex';
    views.playing.style.display = 'none';
    views.myDock.style.display = 'none';

    views.preRoom.style.display = 'none';
    views.inRoom.style.display = 'flex';

    // 玩家数量
    lobbyElements.playerCount.textContent = data.players.length;

    // 渲染房间玩家列表 (支持给特定好友指定专属词)
    lobbyElements.roomPlayersList.innerHTML = '';
    data.players.forEach(p => {
      const item = document.createElement('div');
      item.className = 'room-player-item';
      let badges = '';
      if (p.isHost) badges += '<span class="badge-host">👑 房主</span>';
      if (p.isAi) badges += '<span class="badge-ai">🤖 电脑</span>';

      const isMe = (p.id === myPlayerId);
      let assignedHtml = '';

      if (isMe) {
        // 当事人自己：对当事人严格保密，防止提前偷看剧透！
        assignedHtml = `
          <div class="assigned-section">
            <div class="assigned-box-self">
              🔒 专属词由好友密谋中<br><span style="font-size: 0.7rem; opacity: 0.85;">（留空则系统随机发牌）</span>
            </div>
          </div>
        `;
      } else {
        // 其他人：可公开指定专属词，下套整蛊！
        const hasAssigned = p.assignedWord && p.assignedWord.text;
        assignedHtml = `
          <div class="assigned-section">
            <div class="assigned-box-other">
              <div class="assigned-label">
                <span>🎯 指定专属禁忌:</span>
                ${hasAssigned ? '<span class="assigned-status-badge">✅ 已指定</span>' : '<span style="font-size: 0.7rem; color: var(--text-muted);">留空随机</span>'}
              </div>
              <div class="assigned-input-wrap">
                <input type="text" class="assigned-input" placeholder="输入为ta指定的词" value="${hasAssigned ? escapeHtml(p.assignedWord.text) : ''}" maxlength="30" data-player-id="${p.id}">
                <button class="btn-save-assign" data-player-id="${p.id}" title="保存专属词">💾</button>
              </div>
            </div>
          </div>
        `;
      }

      item.innerHTML = `
        ${badges}
        <div class="item-avatar">${p.avatar}</div>
        <div class="item-name">${escapeHtml(p.name)}</div>
        ${assignedHtml}
      `;

      // 绑定给他人指定词事件
      if (!isMe) {
        const input = item.querySelector('.assigned-input');
        const saveBtn = item.querySelector('.btn-save-assign');

        const doAssign = () => {
          const val = input.value.trim();
          sfx.playClick();
          socket.emit('assign_player_word', { targetId: p.id, word: val });
        };

        saveBtn.addEventListener('click', doAssign);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            doAssign();
          }
        });
      }

      lobbyElements.roomPlayersList.appendChild(item);
    });

    // 房主按钮与权限控制
    const isHost = (data.hostId === myPlayerId);
    lobbyElements.hostControls.style.display = isHost ? 'flex' : 'none';
    lobbyElements.btnStartGame.disabled = (data.players.length < 2);
    if (data.players.length < 2) {
      lobbyElements.btnStartGame.textContent = '等待至少 2 人加入 (可点右上角添加电脑测试)';
      lobbyElements.btnStartGame.style.opacity = '0.6';
    } else {
      lobbyElements.btnStartGame.textContent = '🎬 秘密发牌，开始对决！';
      lobbyElements.btnStartGame.style.opacity = '1';
    }

    // 词库选中同步
    if (data.settings && data.settings.category) {
      lobbyElements.categoryChips.querySelectorAll('.category-chip').forEach(c => {
        if (c.dataset.cat === data.settings.category) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });
    }

    // 渲染自定义词列表
    const customWords = (data.settings && data.settings.customWords) || [];
    lobbyElements.customWordsBadge.textContent = customWords.length;
    lobbyElements.btnClearCustomWords.style.display = (customWords.length > 0) ? 'inline-block' : 'none';

    lobbyElements.customTagsContainer.innerHTML = '';
    if (customWords.length === 0) {
      lobbyElements.customTagsContainer.innerHTML = `
        <div class="custom-tags-empty">暂未添加专属词。输入后任何模式都会混入，选“✨ 纯自定义”则仅用这些词！</div>
      `;
    } else {
      customWords.forEach((word, idx) => {
        const chip = document.createElement('div');
        chip.className = 'custom-tag-chip';
        chip.innerHTML = `
          <span>${escapeHtml(word)}</span>
          <span class="custom-tag-del" data-index="${idx}" title="删除此词">✕</span>
        `;
        chip.querySelector('.custom-tag-del').addEventListener('click', (e) => {
          e.stopPropagation();
          sfx.playClick();
          socket.emit('remove_custom_word', { word, index: idx });
        });
        lobbyElements.customTagsContainer.appendChild(chip);
      });
    }
  }

  // 8. 渲染对局对战界面
  function renderPlaying(data) {
    views.lobby.style.display = 'none';
    views.playing.style.display = 'flex';
    views.myDock.style.display = 'block';

    const isHost = (data.hostId === myPlayerId);
    playingElements.btnHostReset.style.display = isHost ? 'inline-block' : 'none';

    // 寻找自己与其他人
    const me = data.players.find(p => p.id === myPlayerId) || getMyProfile();
    const others = data.players.filter(p => p.id !== myPlayerId);

    // 渲染底部我的神秘卡
    playingElements.dockAvatar.textContent = me.avatar || '🤠';
    playingElements.dockName.textContent = me.name || '我自己';

    // 渲染其他玩家监控卡片
    playingElements.cardsGrid.innerHTML = '';
    if (others.length === 0) {
      playingElements.cardsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px 10px; color: var(--text-muted);">
          目前只有你一个人在场，请使用房主权限返回大厅添加电脑，或邀请好友扫码进房！
        </div>
      `;
      return;
    }

    others.forEach(p => {
      const card = document.createElement('div');
      card.className = 'player-card';

      // 禁忌词卡片文案
      let wordDisplay = '???';
      let typeDisplay = '禁忌陷阱';
      if (p.word && p.word.text) {
        wordDisplay = p.word.text;
        typeDisplay = p.word.type || '禁忌';
      }

      card.innerHTML = `
        <div class="player-card-header">
          <div class="player-identity">
            <div class="player-avatar-box">${p.avatar}</div>
            <div class="player-name-col">
              <span class="player-name-text">${escapeHtml(p.name)}</span>
              <span class="player-caught-stat">${p.caughtCount > 0 ? `中招 ${p.caughtCount} 次 💥` : '暂未中招 😇'}</span>
            </div>
          </div>
          <span class="card-type-pill">${typeDisplay}</span>
        </div>

        <div class="taboo-word-box">
          <div class="taboo-word-text">${escapeHtml(wordDisplay)}</div>
          <div class="taboo-word-hint">可设法套话诱使ta做出该言行</div>
        </div>

        <button class="btn-catch" data-target-id="${p.id}">
          💥 抓包中招！
        </button>
      `;

      // 绑定抓包点击事件
      const catchBtn = card.querySelector('.btn-catch');
      catchBtn.addEventListener('click', () => {
        sfx.playClick();
        socket.emit('trigger_caught', { targetId: p.id });
      });

      playingElements.cardsGrid.appendChild(card);
    });
  }

  // 9. 渲染中招爆笑整蛊弹窗
  function renderCaughtModal(data) {
    const ev = data.gameState.caughtEvent;
    if (!ev) {
      modalCaught.el.classList.remove('active');
      return;
    }

    // 触发新中招事件音效与振动
    if (ev.timestamp !== lastCaughtTimestamp) {
      lastCaughtTimestamp = ev.timestamp;
      sfx.playCaught();
      if (navigator.vibrate) {
        try { navigator.vibrate([100, 60, 200]); } catch (e) {}
      }
    }

    modalCaught.avatar.textContent = ev.targetAvatar || '🤡';
    modalCaught.title.textContent = `🚨【${ev.targetName}】中招啦！`;
    modalCaught.subtitle.textContent = `被【${ev.caughtByName || '全场朋友'}】现场抓包，恭喜光荣受罚！`;
    modalCaught.word.textContent = `【${ev.word ? ev.word.text : '未知禁忌'}】`;
    modalCaught.punishment.textContent = ev.punishment || '自罚半杯饮料！';

    modalCaught.el.classList.add('active');
  }

  // 中招弹窗按钮事件
  modalCaught.btnReroll.addEventListener('click', () => {
    sfx.playClick();
    socket.emit('reroll_punishment');
  });

  modalCaught.btnNext.addEventListener('click', () => {
    sfx.playClick();
    sfx.playDeal();
    socket.emit('deal_new_word');
  });

  // 工具函数
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 启动检查 URL 参数
  checkUrlForRoom();

})();
