// 间谍危机 (Spyfall) - 客户端核心网络通信与状态交互引擎
(function (global) {
  'use strict';

  class SpyfallClient {
    constructor() {
      // 依赖服务安全容错代理
      this.sfx = (typeof window !== 'undefined' && window.sfx) || global.sfx || {
        play: () => {},
        vibrate: () => {}
      };

      // 本地状态
      this.playerId = null;
      this.playerName = '';
      this.playerAvatar = '🤠';
      this.currentRoomCode = null;
      this.selectedDuration = 8;
      this.isHost = false;

      // 游戏状态缓存
      this.self = null;
      this.players = [];
      this.allLocations = [];
      this.gameState = null;
      this.currentAccuse = null;
      this.settlement = null;

      // 排查板三态字典 (locationId -> 'normal' | 'strikethrough' | 'starred')
      this.scratchpadStates = new Map();

      // 指控与投票临时选择
      this.selectedSuspectId = null;
      this.selectedGuessLocationId = null;

      // 定时器引用
      this.timerInterval = null;
      this.lastTickSecond = null;

      // 屏幕常亮 Wake Lock
      this.wakeLockSentinel = null;
      this.isWakeLockRequested = false;

      // Socket 连接
      this.socket = null;

      // DOM 元素引用
      this.dom = {};

      this.init();
    }

    /**
     * 初始化：绑定 DOM、读取本地存储、建立 Socket 连接
     */
    init() {
      if (typeof document === 'undefined') return;

      this.cacheDomElements();
      this.loadLocalStorage();
      this.checkUrlForRoomCode();
      this.setupSocket();
      this.bindEvents();
      this.bindCardRevealEvents();
      this.bindModalEvents();
      this.setupWakeLock();
    }

    /**
     * 缓存核心 DOM 节点
     */
    cacheDomElements() {
      const get = (id) => (typeof document !== 'undefined' && document.getElementById(id)) || null;

      this.dom = {
        // 屏幕容器
        screenLobby: get('screen-lobby'),
        screenPlaying: get('screen-playing'),

        // 大厅输入及操作
        avatarSelector: get('avatar-selector'),
        inputName: get('input-name'),
        inputRoomCode: get('input-room-code'),
        btnCreateRoom: get('btn-create-room'),
        btnJoinRoom: get('btn-join-room'),

        // 大厅房间信息
        lobbyRoomDetails: get('lobby-room-details'),
        lobbyRoomCode: get('lobby-room-code'),
        btnShare: get('btn-share'),
        selectDuration: get('select-duration'),
        lobbyPlayerCount: get('lobby-player-count'),
        waitingPlayers: get('waiting-players'),
        btnStartGame: get('btn-start-game'),

        // 对局主屏幕顶部
        roomCodeDisplay: get('room-code-display'),
        onlineCount: get('online-count'),
        btnWakelock: get('btn-wakelock'),
        wakelockLabel: get('wakelock-label'),
        btnGuide: get('btn-guide'),

        // 倒计时
        timerDisplay: get('timer-display'),
        timerBadge: get('timer-badge'),

        // 绝密身份卡 (Hold-to-Reveal)
        cardSecret: get('card-secret'),
        cardSecretCover: get('card-secret-cover'),
        cardSecretContent: get('card-secret-content'),
        secretBadge: get('secret-badge'),
        secretLocationTitle: get('secret-location-title'),
        secretLocationIcon: get('secret-location-icon'),
        secretLocationName: get('secret-location-name'),
        secretRoleDesc: get('secret-role-desc'),
        secretRoleName: get('secret-role-name'),

        // 操作按钮
        btnSpyGuess: get('btn-spy-guess'),
        btnAccuse: get('btn-accuse'),

        // 排查板与席位
        locationScratchpad: get('location-scratchpad'),
        seatsBar: get('seats-bar'),

        // 弹窗 1: 指南
        modalGuide: get('modal-guide'),

        // 弹窗 2: 指控与表决
        modalAccuse: get('modal-accuse'),
        accuseStepSelect: get('accuse-step-select'),
        suspectList: get('suspect-list'),
        accuseStepVote: get('accuse-step-vote'),
        accuserName: get('accuser-name'),
        suspectName: get('suspect-name'),
        btnVoteAgree: get('btn-vote-agree'),
        btnVoteDisagree: get('btn-vote-disagree'),
        voteStatusText: get('vote-status-text'),
        accuseFooterSelect: get('accuse-footer-select'),
        btnConfirmAccuse: get('btn-confirm-accuse'),

        // 弹窗 3: 间谍指认地点
        modalGuess: get('modal-guess'),
        guessGrid: get('guess-grid'),
        btnConfirmGuess: get('btn-confirm-guess'),

        // 弹窗 4: 结算复盘
        modalSettlement: get('modal-settlement'),
        settlementWinnerText: get('settlement-winner-text'),
        settlementReasonText: get('settlement-reason-text'),
        settlementLocation: get('settlement-location'),
        settlementSpy: get('settlement-spy'),
        settlementPlayersList: get('settlement-players-list'),
        btnRestart: get('btn-restart')
      };
    }

    /**
     * 读取与写入 localStorage 持久化数据
     */
    loadLocalStorage() {
      const storage = (typeof window !== 'undefined' && window.localStorage) || global.localStorage;
      if (!storage) return;

      try {
        // 读取玩家 ID，不存在则新建
        let pid = storage.getItem('spyfall_player_id') || storage.getItem('player_id');
        if (!pid) {
          pid = `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          storage.setItem('spyfall_player_id', pid);
        }
        this.playerId = pid;

        // 读取玩家昵称
        let name = storage.getItem('spyfall_player_name') || storage.getItem('name');
        if (!name) {
          name = `特工${Math.floor(100 + Math.random() * 900)}`;
          storage.setItem('spyfall_player_name', name);
          storage.setItem('name', name);
        }
        this.playerName = name;
        if (this.dom.inputName) {
          this.dom.inputName.value = name;
        }

        // 读取玩家头像
        let avatar = storage.getItem('spyfall_avatar') || storage.getItem('avatar');
        if (!avatar) {
          avatar = '🤠';
          storage.setItem('spyfall_avatar', avatar);
          storage.setItem('avatar', avatar);
        }
        this.playerAvatar = avatar;
        this.updateAvatarSelectionUI(avatar);

        // 读取上次加入的房间代码
        const lastRoom = storage.getItem('spyfall_last_room_code') || storage.getItem('last_room_code');
        if (lastRoom && this.dom.inputRoomCode) {
          this.dom.inputRoomCode.value = lastRoom;
        }
      } catch (err) {
        console.warn('[Spyfall] localStorage error:', err);
      }
    }

    /**
     * 保存玩家资料到本地缓存
     */
    savePlayerData() {
      const storage = (typeof window !== 'undefined' && window.localStorage) || global.localStorage;
      if (!storage) return;

      try {
        if (this.playerId) storage.setItem('spyfall_player_id', this.playerId);
        if (this.playerName) {
          storage.setItem('spyfall_player_name', this.playerName);
          storage.setItem('name', this.playerName);
        }
        if (this.playerAvatar) {
          storage.setItem('spyfall_avatar', this.playerAvatar);
          storage.setItem('avatar', this.playerAvatar);
        }
        if (this.currentRoomCode) {
          storage.setItem('spyfall_last_room_code', this.currentRoomCode);
          storage.setItem('last_room_code', this.currentRoomCode);
        }
      } catch (e) {}
    }

    /**
     * 检查 URL query 是否携带 room 参数
     */
    checkUrlForRoomCode() {
      if (typeof window === 'undefined' || !window.location) return;
      try {
        const params = new URLSearchParams(window.location.search);
        const codeFromUrl = params.get('room') || window.location.hash.replace('#', '');
        if (codeFromUrl && /^\d{4}$/.test(codeFromUrl.trim()) && this.dom.inputRoomCode) {
          this.dom.inputRoomCode.value = codeFromUrl.trim();
        }
      } catch (e) {}
    }

    /**
     * 初始化 Socket.IO 通信链路与事件监听
     */
    setupSocket() {
      const ioFn = (typeof window !== 'undefined' && window.io) || global.io;
      if (!ioFn) return;

      this.socket = ioFn('/spyfall');

      this.socket.on('connect', () => {
        // 若有活跃房间号则自动重新加入
        if (this.currentRoomCode) {
          this.joinRoom(this.currentRoomCode);
        }
      });

      // 核心全量房间脱敏数据同步
      this.socket.on('room_update', (data) => {
        this.handleRoomUpdate(data);
      });

      // 紧急指控开启广播
      this.socket.on('accuse_started', (data) => {
        this.handleAccuseStarted(data);
      });

      // 指控表决结果
      this.socket.on('accuse_result', (data) => {
        this.handleAccuseResult(data);
      });

      // 游戏结束胜负与档案解密
      this.socket.on('game_over_reveal', (settlementData) => {
        this.handleGameOverReveal(settlementData);
      });
    }

    /**
     * 绑定基础 DOM 操作与交互事件
     */
    bindEvents() {
      // 头像选择
      if (this.dom.avatarSelector) {
        this.dom.avatarSelector.addEventListener('click', (e) => {
          const opt = e.target.closest ? e.target.closest('.avatar-option') : (e.target.classList && e.target.classList.contains('avatar-option') ? e.target : null);
          if (!opt) return;
          const av = opt.dataset.avatar;
          if (av) {
            this.playerAvatar = av;
            this.updateAvatarSelectionUI(av);
            this.savePlayerData();
            this.sfx.play('click');
          }
        });
      }

      // 昵称输入失焦与输入
      if (this.dom.inputName) {
        this.dom.inputName.addEventListener('change', () => {
          const val = this.dom.inputName.value.trim().substring(0, 10);
          if (val) {
            this.playerName = val;
            this.savePlayerData();
          }
        });
      }

      // 时长选择分段器
      if (this.dom.selectDuration) {
        this.dom.selectDuration.addEventListener('click', (e) => {
          const opt = e.target.closest ? e.target.closest('.duration-option') : (e.target.classList && e.target.classList.contains('duration-option') ? e.target : null);
          if (!opt) return;
          const mins = parseInt(opt.dataset.minutes, 10);
          if (mins) {
            this.selectedDuration = mins;
            const allOpts = this.dom.selectDuration.querySelectorAll('.duration-option');
            allOpts.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            this.sfx.play('click');
          }
        });
      }

      // 创建房间按钮
      if (this.dom.btnCreateRoom) {
        this.dom.btnCreateRoom.addEventListener('click', () => {
          this.createRoom();
        });
      }

      // 加入房间按钮
      if (this.dom.btnJoinRoom) {
        this.dom.btnJoinRoom.addEventListener('click', () => {
          const code = this.dom.inputRoomCode ? this.dom.inputRoomCode.value.trim() : '';
          if (!code || code.length !== 4) {
            this.notify('请输入 4 位有效行动代码');
            return;
          }
          this.joinRoom(code);
        });
      }

      // 房主开启游戏按钮
      if (this.dom.btnStartGame) {
        this.dom.btnStartGame.addEventListener('click', () => {
          this.startGame();
        });
      }

      // 玩法指南按钮
      if (this.dom.btnGuide) {
        this.dom.btnGuide.addEventListener('click', () => {
          this.openModal(this.dom.modalGuide);
          this.sfx.play('click');
        });
      }

      // 屏幕常亮按钮
      if (this.dom.btnWakelock) {
        this.dom.btnWakelock.addEventListener('click', () => {
          this.toggleWakeLock();
        });
      }

      // 房间分享按钮
      if (this.dom.btnShare) {
        this.dom.btnShare.addEventListener('click', () => {
          this.shareRoom();
        });
      }

      // 指控按钮
      if (this.dom.btnAccuse) {
        this.dom.btnAccuse.addEventListener('click', () => {
          this.openAccuseModal();
        });
      }

      // 间谍自曝猜地点按钮
      if (this.dom.btnSpyGuess) {
        this.dom.btnSpyGuess.addEventListener('click', () => {
          this.openSpyGuessModal();
        });
      }

      // 再来一局重开按钮
      if (this.dom.btnRestart) {
        this.dom.btnRestart.addEventListener('click', () => {
          this.restartGame();
        });
      }
    }

    /**
     * 更新头像选择器界面高亮
     */
    updateAvatarSelectionUI(avatar) {
      if (!this.dom.avatarSelector) return;
      const opts = this.dom.avatarSelector.querySelectorAll('.avatar-option');
      opts.forEach(opt => {
        if (opt.dataset.avatar === avatar) {
          opt.classList.add('selected');
        } else {
          opt.classList.remove('selected');
        }
      });
    }

    /**
     * 绝密防偷窥身份卡 (Hold-to-Reveal) 事件绑定
     * - 按住翻开并播放音效
     * - 松开、移开手指、滑动页面、窗口失焦立刻闭锁隐匿
     */
    bindCardRevealEvents() {
      const card = this.dom.cardSecret;
      if (!card) return;

      const reveal = (e) => {
        card.classList.add('revealed');
        this.sfx.play('card');
      };

      const conceal = () => {
        card.classList.remove('revealed');
      };

      // 鼠标事件
      card.addEventListener('mousedown', reveal);
      card.addEventListener('mouseup', conceal);
      card.addEventListener('mouseleave', conceal);

      // 触摸事件
      card.addEventListener('touchstart', reveal, { passive: true });
      card.addEventListener('touchend', conceal, { passive: true });
      card.addEventListener('touchcancel', conceal, { passive: true });

      // 防偷窥安全防御：滑动屏幕、窗口滚动、失焦、切后台立刻隐匿身份
      const win = (typeof window !== 'undefined' ? window : global.window) || {};
      if (typeof win.addEventListener === 'function') {
        win.addEventListener('scroll', conceal, { passive: true });
        win.addEventListener('blur', conceal);
      }
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('touchmove', conceal, { passive: true });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') {
            conceal();
          }
        });
      }
    }

    /**
     * 模态弹窗系统统合管理与事件绑定
     */
    bindModalEvents() {
      // 全局 data-close 按钮绑定
      if (typeof document !== 'undefined') {
        const closeBtns = document.querySelectorAll('[data-close]');
        closeBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            const targetId = btn.dataset.close;
            const modal = document.getElementById(targetId);
            if (modal) {
              this.closeModal(modal);
              this.sfx.play('click');
            }
          });
        });
      }

      // 指控弹窗：选择嫌疑人
      if (this.dom.suspectList) {
        this.dom.suspectList.addEventListener('click', (e) => {
          const item = e.target.closest ? e.target.closest('.suspect-option') : (e.target.classList && e.target.classList.contains('suspect-option') ? e.target : null);
          if (!item) return;

          const pid = item.dataset.playerId;
          if (!pid) return;

          this.selectedSuspectId = pid;
          const allOptions = this.dom.suspectList.querySelectorAll('.suspect-option');
          allOptions.forEach(opt => opt.classList.remove('selected'));
          item.classList.add('selected');

          if (this.dom.btnConfirmAccuse) {
            this.dom.btnConfirmAccuse.disabled = false;
          }
          this.sfx.play('click');
        });
      }

      // 确认发起全员公决
      if (this.dom.btnConfirmAccuse) {
        this.dom.btnConfirmAccuse.addEventListener('click', () => {
          if (!this.selectedSuspectId) return;
          this.confirmAccuse(this.selectedSuspectId);
        });
      }

      // 表决赞成 / 反对
      if (this.dom.btnVoteAgree) {
        this.dom.btnVoteAgree.addEventListener('click', () => {
          this.voteAccuse(true);
        });
      }
      if (this.dom.btnVoteDisagree) {
        this.dom.btnVoteDisagree.addEventListener('click', () => {
          this.voteAccuse(false);
        });
      }

      // 间谍指认地点：候选网格选择
      if (this.dom.guessGrid) {
        this.dom.guessGrid.addEventListener('click', (e) => {
          const card = e.target.closest ? e.target.closest('.guess-card') : (e.target.classList && e.target.classList.contains('guess-card') ? e.target : null);
          if (!card) return;

          const locId = card.dataset.locationId;
          if (!locId) return;

          this.selectedGuessLocationId = locId;
          const allCards = this.dom.guessGrid.querySelectorAll('.guess-card');
          allCards.forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');

          if (this.dom.btnConfirmGuess) {
            this.dom.btnConfirmGuess.disabled = false;
          }
          this.sfx.play('click');
        });
      }

      // 确认指认地点
      if (this.dom.btnConfirmGuess) {
        this.dom.btnConfirmGuess.addEventListener('click', () => {
          if (!this.selectedGuessLocationId) return;
          this.confirmSpyGuess(this.selectedGuessLocationId);
        });
      }
    }

    openModal(modal) {
      if (modal) {
        modal.classList.add('active');
      }
    }

    closeModal(modal) {
      if (modal) {
        modal.classList.remove('active');
      }
    }

    /**
     * 网络操作：创建房间
     */
    createRoom() {
      if (!this.socket) return;
      const player = {
        id: this.playerId,
        name: this.playerName,
        avatar: this.playerAvatar
      };
      const settings = {
        durationMinutes: this.selectedDuration
      };

      this.socket.emit('create_room', { player, settings }, (res) => {
        if (res && res.success) {
          this.currentRoomCode = res.roomCode;
          this.savePlayerData();
          this.sfx.play('click');
        } else {
          this.notify((res && res.message) || '创建房间失败');
        }
      });
    }

    /**
     * 网络操作：加入房间
     */
    joinRoom(roomCode) {
      if (!this.socket) return;
      const player = {
        id: this.playerId,
        name: this.playerName,
        avatar: this.playerAvatar
      };

      this.socket.emit('join_room', { roomCode, player }, (res) => {
        if (res && res.success) {
          this.currentRoomCode = res.roomCode;
          this.savePlayerData();
          this.sfx.play('click');
        } else {
          this.notify((res && res.message) || '加入房间失败');
        }
      });
    }

    /**
     * 网络操作：房主开启游戏
     */
    startGame() {
      if (!this.socket || !this.currentRoomCode) return;
      this.socket.emit('start_game', {
        roomCode: this.currentRoomCode,
        settings: { durationMinutes: this.selectedDuration }
      }, (res) => {
        if (res && !res.success) {
          this.notify(res.message || '开启任务失败');
        }
      });
    }

    /**
     * 网络操作：发起指控
     */
    confirmAccuse(targetPlayerId) {
      if (!this.socket) return;
      this.socket.emit('initiate_accuse', { targetPlayerId }, (res) => {
        if (res && !res.success) {
          this.notify(res.message || '发起指控失败');
        }
      });
    }

    /**
     * 网络操作：投票表决
     */
    voteAccuse(agree) {
      if (!this.socket) return;
      this.socket.emit('vote_accuse', { agree }, (res) => {
        if (res && res.success) {
          if (this.dom.btnVoteAgree) this.dom.btnVoteAgree.disabled = true;
          if (this.dom.btnVoteDisagree) this.dom.btnVoteDisagree.disabled = true;
          if (this.dom.voteStatusText) {
            this.dom.voteStatusText.textContent = agree ? '已投【赞成】票，等待其他玩家...' : '已投【反对】票，等待其他玩家...';
          }
        } else {
          this.notify((res && res.message) || '投票失败');
        }
      });
    }

    /**
     * 网络操作：间谍提交指认地点
     */
    confirmSpyGuess(locationId) {
      if (!this.socket) return;
      const win = (typeof window !== 'undefined' ? window : global.window) || {};
      const confirmFn = win.confirm || global.confirm;
      const confirmed = confirmFn ? confirmFn('确认指认该地点为行动目标？指认后将立即判定胜负！') : true;
      if (!confirmed) return;

      this.socket.emit('spy_guess_location', { locationId }, (res) => {
        this.closeModal(this.dom.modalGuess);
        if (res && !res.success) {
          this.notify(res.message || '指认失败');
        }
      });
    }

    /**
     * 网络操作：房主重开新对局
     */
    restartGame() {
      if (!this.socket) return;
      this.socket.emit('restart_game', {}, (res) => {
        if (res && !res.success) {
          this.notify(res.message || '重新开局失败');
        }
      });
    }

    /**
     * 处理服务端广播的 room_update 事件并同步全端状态机
     */
    handleRoomUpdate(data) {
      if (!data) return;

      this.currentRoomCode = data.roomCode;
      this.self = data.self;
      this.players = data.players || [];
      this.allLocations = data.allLocations || [];
      this.gameState = data.gameState || data.timer || {};
      this.currentAccuse = data.currentAccuse || null;
      this.settlement = data.settlement || null;

      if (this.self) {
        this.isHost = !!this.self.isHost;
      }

      const phase = this.gameState.phase || 'LOBBY';

      if (phase === 'LOBBY') {
        this.renderLobbyPhase();
      } else {
        this.renderPlayingPhase();
      }

      // 同步倒计时时钟
      this.syncTimer();
    }

    /**
     * 渲染大厅状态
     */
    renderLobbyPhase() {
      // 屏幕展示切换
      if (this.dom.screenLobby) this.dom.screenLobby.classList.remove('hidden');
      if (this.dom.screenPlaying) this.dom.screenPlaying.classList.add('hidden');

      // 关闭所有模态弹窗
      this.closeModal(this.dom.modalGuide);
      this.closeModal(this.dom.modalAccuse);
      this.closeModal(this.dom.modalGuess);
      this.closeModal(this.dom.modalSettlement);

      // 清空旧对局的排查板与选择
      this.scratchpadStates.clear();
      this.selectedSuspectId = null;
      this.selectedGuessLocationId = null;

      // 展现等待面板
      if (this.dom.lobbyRoomDetails) {
        this.dom.lobbyRoomDetails.style.display = 'block';
      }
      if (this.dom.lobbyRoomCode) {
        this.dom.lobbyRoomCode.textContent = this.currentRoomCode || '----';
      }
      if (this.dom.lobbyPlayerCount) {
        this.dom.lobbyPlayerCount.textContent = String(this.players.length);
      }

      // 渲染等待玩家列表
      if (this.dom.waitingPlayers) {
        this.dom.waitingPlayers.innerHTML = this.players.map(p => `
          <div class="player-item">
            <div class="player-item-left">
              <span class="player-avatar">${p.avatar}</span>
              <span class="player-name">${p.name}</span>
            </div>
            ${p.isHost ? '<span class="badge-host">局长/房主</span>' : ''}
          </div>
        `).join('');
      }

      // 开始游戏按钮权限
      if (this.dom.btnStartGame) {
        const canStart = this.isHost && this.players.length >= 3;
        this.dom.btnStartGame.style.display = this.isHost ? 'block' : 'none';
        this.dom.btnStartGame.disabled = !canStart;
        this.dom.btnStartGame.innerHTML = canStart
          ? '<span>🚀</span> 开启绝密任务 (立即出发)'
          : `<span>🚀</span> 开启绝密任务 (至少3人，当前${this.players.length}人)`;
      }
    }

    /**
     * 渲染游戏中状态 (PLAYING, PAUSED_ACCUSE, SPY_GUESSING, GAME_OVER)
     */
    renderPlayingPhase() {
      if (this.dom.screenLobby) this.dom.screenLobby.classList.add('hidden');
      if (this.dom.screenPlaying) this.dom.screenPlaying.classList.remove('hidden');

      // 顶部信息
      if (this.dom.roomCodeDisplay) this.dom.roomCodeDisplay.textContent = this.currentRoomCode || '----';
      const onlineList = this.players.filter(p => p.isOnline !== false);
      if (this.dom.onlineCount) this.dom.onlineCount.textContent = String(onlineList.length);

      // 渲染防偷窥身份卡脱敏数据
      if (this.self) {
        const isSpy = !!this.self.isSpy;
        if (this.dom.cardSecret) {
          this.dom.cardSecret.classList.toggle('is-spy', isSpy);
        }
        if (this.dom.secretBadge) {
          this.dom.secretBadge.textContent = isSpy ? '间谍潜伏档案' : '特工身份档案';
        }
        if (this.dom.secretLocationIcon) {
          this.dom.secretLocationIcon.textContent = this.self.locationIcon || (isSpy ? '❓' : '🏢');
        }
        if (this.dom.secretLocationName) {
          this.dom.secretLocationName.textContent = isSpy ? '地点未知（需刺探）' : (this.self.location || '未知地点');
        }
        if (this.dom.secretRoleName) {
          this.dom.secretRoleName.textContent = this.self.role || (isSpy ? '间谍 (Spy)' : '特工成员');
        }
      }

      // 渲染候选地点排查板
      this.renderLocationScratchpad();

      // 渲染底部席位轮播栏
      this.renderSeatsBar();

      // 结算自动弹出
      if (this.gameState && this.gameState.phase === 'GAME_OVER' && this.settlement) {
        this.handleGameOverReveal(this.settlement);
      }
    }

    /**
     * 渲染候选地点排查板并保持客户端 3 态标记
     */
    renderLocationScratchpad() {
      if (!this.dom.locationScratchpad || !this.allLocations) return;

      const container = this.dom.locationScratchpad;
      container.innerHTML = '';

      this.allLocations.forEach(loc => {
        const currentState = this.scratchpadStates.get(loc.id) || 'normal';
        let card = null;
        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
          card = document.createElement('div');
        } else {
          card = {
            tagName: 'DIV',
            classList: {
              classes: new Set([`location-card`, `state-${currentState}`]),
              add(...n) { n.forEach(c => this.classes.add(c)); },
              remove(...n) { n.forEach(c => this.classes.delete(c)); },
              contains(c) { return this.classes.has(c); }
            },
            dataset: { locationId: loc.id },
            listeners: {},
            addEventListener(e, cb) { (this.listeners[e] = this.listeners[e] || []).push(cb); },
            click() { (this.listeners['click'] || []).forEach(cb => cb({ target: this })); }
          };
        }

        if (!card) return;

        card.className = `location-card state-${currentState}`;
        if (card.classList && typeof card.classList.add === 'function') {
          card.classList.add('location-card', `state-${currentState}`);
        }
        card.dataset = card.dataset || {};
        card.dataset.locationId = loc.id;
        card.innerHTML = `
          <span class="location-icon">${loc.icon || '📍'}</span>
          <div class="location-info">
            <span class="location-name">${loc.name}</span>
            <span class="location-category">${loc.category || ''}</span>
          </div>
        `;

        // 点击 3 态循环切换：normal -> strikethrough -> starred -> normal
        card.addEventListener('click', () => {
          let nextState = 'normal';
          if (card.classList.contains('state-normal')) {
            card.classList.remove('state-normal');
            card.classList.add('state-strikethrough');
            nextState = 'strikethrough';
          } else if (card.classList.contains('state-strikethrough')) {
            card.classList.remove('state-strikethrough');
            card.classList.add('state-starred');
            nextState = 'starred';
          } else {
            card.classList.remove('state-starred');
            card.classList.add('state-normal');
            nextState = 'normal';
          }
          this.scratchpadStates.set(loc.id, nextState);
          this.sfx.play('click');
        });

        container.appendChild(card);
      });
    }

    /**
     * 渲染底部特工席位状态
     */
    renderSeatsBar() {
      if (!this.dom.seatsBar) return;
      const myId = this.self ? this.self.id : this.playerId;
      const firstId = this.gameState ? this.gameState.firstQuestionerId : null;

      this.dom.seatsBar.innerHTML = this.players.map(p => {
        const isSelf = p.id === myId;
        const hasAccused = !!p.hasAccused;
        const isFirst = p.id === firstId;

        return `
          <div class="seat-pill ${isSelf ? 'is-self' : ''} ${hasAccused ? 'has-accused' : ''}">
            <span class="player-avatar">${p.avatar}</span>
            <span class="player-name">${p.name}</span>
            ${p.isHost ? '<span class="badge-host">房主</span>' : ''}
            ${isFirst ? '<span style="color: var(--color-amber); font-weight: 700; font-size: 11px;">[首问]</span>' : ''}
          </div>
        `;
      }).join('');
    }

    /**
     * 倒计时计算与定时器同步
     */
    syncTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      const timerData = this.gameState || {};
      const phase = timerData.phase || 'LOBBY';

      const updateClock = () => {
        if (!this.dom.timerDisplay) return;

        if (phase === 'LOBBY') {
          this.dom.timerDisplay.textContent = '08:00';
          if (this.dom.timerBadge) {
            this.dom.timerBadge.textContent = '准备中';
            this.dom.timerBadge.classList.remove('paused');
          }
          return;
        }

        const now = Date.now();
        let remainingMs = 0;

        if (timerData.isPaused) {
          remainingMs = (typeof timerData.remainingMs === 'number')
            ? timerData.remainingMs
            : Math.max(0, (timerData.expiresAt || now) - now);
        } else {
          remainingMs = Math.max(0, (timerData.expiresAt || now) - now);
        }

        const totalSeconds = Math.ceil(remainingMs / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        this.dom.timerDisplay.textContent = formatted;

        // 紧张倒计时状态 (<= 60秒)
        const isUrgent = totalSeconds <= 60 && totalSeconds > 0 && !timerData.isPaused;
        this.dom.timerDisplay.classList.toggle('urgent', isUrgent);

        if (isUrgent && this.lastTickSecond !== totalSeconds) {
          this.lastTickSecond = totalSeconds;
          this.sfx.play('tick');
        }

        // 状态徽章
        if (this.dom.timerBadge) {
          if (timerData.isPaused || phase === 'PAUSED_ACCUSE' || phase === 'SPY_GUESSING') {
            this.dom.timerBadge.textContent = '已暂停';
            this.dom.timerBadge.classList.add('paused');
          } else if (phase === 'GAME_OVER') {
            this.dom.timerBadge.textContent = '已结算';
            this.dom.timerBadge.classList.remove('paused');
          } else {
            this.dom.timerBadge.textContent = '进行中';
            this.dom.timerBadge.classList.remove('paused');
          }
        }
      };

      updateClock();

      if (phase === 'PLAYING' && !timerData.isPaused) {
        this.timerInterval = setInterval(updateClock, 500);
        if (this.timerInterval && typeof this.timerInterval.unref === 'function') {
          this.timerInterval.unref();
        }
      }
    }

    /**
     * 销毁与资源释放
     */
    destroy() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      if (this.wakeLockSentinel) {
        this.releaseWakeLock();
      }
    }

    /**
     * 打开指控弹窗并列出除自己外的所有嫌疑人
     */
    openAccuseModal() {
      if (this.self && this.self.hasAccused) {
        this.notify('你本局已使用过唯一一次指控机会');
        return;
      }
      if (!this.gameState || this.gameState.phase !== 'PLAYING') {
        this.notify('当前阶段无法发起指控');
        return;
      }

      this.selectedSuspectId = null;
      if (this.dom.accuseStepSelect) this.dom.accuseStepSelect.style.display = 'block';
      if (this.dom.accuseStepVote) this.dom.accuseStepVote.style.display = 'none';
      if (this.dom.accuseFooterSelect) this.dom.accuseFooterSelect.style.display = 'flex';
      if (this.dom.btnConfirmAccuse) this.dom.btnConfirmAccuse.disabled = true;

      // 渲染嫌疑人选项
      if (this.dom.suspectList) {
        this.dom.suspectList.innerHTML = '';
        const myId = this.self ? this.self.id : this.playerId;
        const suspects = this.players.filter(p => p.id !== myId);

        suspects.forEach(p => {
          let opt = null;
          if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
            opt = document.createElement('div');
          } else {
            opt = {
              tagName: 'DIV',
              classList: {
                classes: new Set(['suspect-option']),
                add(c) { this.classes.add(c); },
                remove(c) { this.classes.delete(c); },
                contains(c) { return this.classes.has(c); }
              },
              dataset: { playerId: p.id },
              listeners: {},
              addEventListener(e, cb) { (this.listeners[e] = this.listeners[e] || []).push(cb); },
              click() {
                // 冒泡给 suspectList
                if (this.parentElement) {
                  this.parentElement.dispatchEvent({ type: 'click', target: this });
                }
              }
            };
          }
          if (!opt) return;

          opt.className = 'suspect-option';
          if (opt.classList && typeof opt.classList.add === 'function') {
            opt.classList.add('suspect-option');
          }
          opt.dataset = opt.dataset || {};
          opt.dataset.playerId = p.id;
          opt.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">${p.avatar}</span>
              <span style="font-weight: 700; color: #ffffff;">${p.name}</span>
            </div>
            <span style="font-size: 12px; color: var(--text-muted);">怀疑是间谍</span>
          `;
          this.dom.suspectList.appendChild(opt);
        });
      }

      this.openModal(this.dom.modalAccuse);
      this.sfx.play('click');
    }

    /**
     * 指控开始广播处理：全员进入紧急表决
     */
    handleAccuseStarted(data) {
      if (!data) return;
      this.sfx.play('alarm');

      if (this.dom.accuseStepSelect) this.dom.accuseStepSelect.style.display = 'none';
      if (this.dom.accuseFooterSelect) this.dom.accuseFooterSelect.style.display = 'none';
      if (this.dom.accuseStepVote) this.dom.accuseStepVote.style.display = 'block';

      if (this.dom.accuserName) this.dom.accuserName.textContent = data.accuser ? data.accuser.name : '未知特工';
      if (this.dom.suspectName) this.dom.suspectName.textContent = data.suspect ? data.suspect.name : '未知目标';

      const myId = this.self ? this.self.id : this.playerId;
      const isSuspect = data.suspect && (data.suspect.id === myId);

      if (isSuspect) {
        if (this.dom.btnVoteAgree) this.dom.btnVoteAgree.disabled = true;
        if (this.dom.btnVoteDisagree) this.dom.btnVoteDisagree.disabled = true;
        if (this.dom.voteStatusText) {
          this.dom.voteStatusText.textContent = '⚠️ 你是被指控人，无法参与表决，等待其他特工公决...';
        }
      } else {
        if (this.dom.btnVoteAgree) this.dom.btnVoteAgree.disabled = false;
        if (this.dom.btnVoteDisagree) this.dom.btnVoteDisagree.disabled = false;
        if (this.dom.voteStatusText) {
          this.dom.voteStatusText.textContent = '请进行紧急表决（全票赞成方可定罪）';
        }
      }

      this.openModal(this.dom.modalAccuse);
    }

    /**
     * 指控表决结果处理
     */
    handleAccuseResult(data) {
      this.closeModal(this.dom.modalAccuse);
      if (data && data.message) {
        this.notify(data.message);
      }
    }

    /**
     * 打开间谍自曝猜地点弹窗
     */
    openSpyGuessModal() {
      if (!this.self || !this.self.isSpy) {
        this.notify('只有间谍可以自曝指认地点！');
        return;
      }

      this.selectedGuessLocationId = null;
      if (this.dom.btnConfirmGuess) this.dom.btnConfirmGuess.disabled = true;

      if (this.dom.guessGrid) {
        this.dom.guessGrid.innerHTML = '';
        this.allLocations.forEach(loc => {
          let card = null;
          if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
            card = document.createElement('div');
          } else {
            card = {
              tagName: 'DIV',
              classList: {
                classes: new Set(['guess-card']),
                add(c) { this.classes.add(c); },
                remove(c) { this.classes.delete(c); },
                contains(c) { return this.classes.has(c); }
              },
              dataset: { locationId: loc.id },
              listeners: {},
              addEventListener(e, cb) { (this.listeners[e] = this.listeners[e] || []).push(cb); },
              click() {
                if (this.parentElement) {
                  this.parentElement.dispatchEvent({ type: 'click', target: this });
                }
              }
            };
          }
          if (!card) return;

          card.className = 'guess-card';
          if (card.classList && typeof card.classList.add === 'function') {
            card.classList.add('guess-card');
          }
          card.dataset = card.dataset || {};
          card.dataset.locationId = loc.id;
          card.innerHTML = `
            <div style="font-size: 22px;">${loc.icon || '📍'}</div>
            <div style="font-size: 12px; font-weight: 700; color: #ffffff; margin-top: 4px;">${loc.name}</div>
          `;
          this.dom.guessGrid.appendChild(card);
        });
      }

      this.openModal(this.dom.modalGuess);
      this.sfx.play('click');
    }

    /**
     * 结算与全员身份揭晓展示
     */
    handleGameOverReveal(settlementData) {
      if (!settlementData) return;
      this.settlement = settlementData;

      // 判断自身输赢
      const isSpy = this.self && this.self.isSpy;
      const isVictory = (settlementData.winner === 'SPY' && isSpy) || (settlementData.winner === 'CIVILIAN' && !isSpy);
      if (isVictory) {
        this.sfx.play('victory');
      } else {
        this.sfx.play('defeat');
      }

      // 胜负横幅
      if (this.dom.settlementWinnerText) {
        if (settlementData.winner === 'SPY') {
          this.dom.settlementWinnerText.textContent = '间谍获胜！';
          this.dom.settlementWinnerText.className = 'settlement-winner spy';
          if (this.dom.settlementWinnerText.classList && typeof this.dom.settlementWinnerText.classList.add === 'function') {
            this.dom.settlementWinnerText.classList.remove('civilians');
            this.dom.settlementWinnerText.classList.add('settlement-winner', 'spy');
          }
        } else {
          this.dom.settlementWinnerText.textContent = '平民阵营获胜！';
          this.dom.settlementWinnerText.className = 'settlement-winner civilians';
          if (this.dom.settlementWinnerText.classList && typeof this.dom.settlementWinnerText.classList.add === 'function') {
            this.dom.settlementWinnerText.classList.remove('spy');
            this.dom.settlementWinnerText.classList.add('settlement-winner', 'civilians');
          }
        }
      }

      if (this.dom.settlementReasonText) {
        this.dom.settlementReasonText.textContent = settlementData.winReason || '';
      }

      // 真实地点与间谍
      if (this.dom.settlementLocation && settlementData.targetLocation) {
        this.dom.settlementLocation.innerHTML = `${settlementData.targetLocation.icon || '🏢'} ${settlementData.targetLocation.name}`;
      }
      if (this.dom.settlementSpy && settlementData.spy) {
        this.dom.settlementSpy.innerHTML = `${settlementData.spy.avatar || '🕵️'} ${settlementData.spy.name}`;
      }

      // 全员档案揭晓
      if (this.dom.settlementPlayersList && this.players) {
        this.dom.settlementPlayersList.innerHTML = this.players.map(p => `
          <div class="player-item">
            <div class="player-item-left">
              <span class="player-avatar">${p.avatar}</span>
              <span class="player-name">${p.name} ${p.isSpy ? '【间谍】' : ''}</span>
            </div>
            <span style="font-size: 13px; font-weight: 700; color: ${p.isSpy ? 'var(--color-crimson)' : 'var(--color-cyan)'};">
              ${p.role || (p.isSpy ? '间谍 (Spy)' : '平民')}
            </span>
          </div>
        `).join('');
      }

      // 房主重开按钮权限
      if (this.dom.btnRestart) {
        if (this.isHost) {
          this.dom.btnRestart.disabled = false;
          this.dom.btnRestart.innerHTML = '<span>🔄</span> 开启新一轮对局 (再来一局)';
        } else {
          this.dom.btnRestart.disabled = true;
          this.dom.btnRestart.innerHTML = '<span>⏳</span> 等待局长/房主重新开局...';
        }
      }

      this.openModal(this.dom.modalSettlement);
    }

    /**
     * 屏幕常亮 Wake Lock 控制
     */
    async setupWakeLock() {
      if (typeof document === 'undefined') return;
      document.addEventListener('visibilitychange', async () => {
        if (this.isWakeLockRequested && document.visibilityState === 'visible') {
          await this.requestWakeLock();
        }
      });
    }

    async toggleWakeLock() {
      if (this.wakeLockSentinel) {
        await this.releaseWakeLock();
      } else {
        await this.requestWakeLock();
      }
      this.sfx.play('click');
    }

    async requestWakeLock() {
      const nav = (typeof window !== 'undefined' && window.navigator) || global.navigator;
      if (nav && nav.wakeLock && typeof nav.wakeLock.request === 'function') {
        try {
          this.wakeLockSentinel = await nav.wakeLock.request('screen');
          this.isWakeLockRequested = true;
          if (this.dom.btnWakelock) this.dom.btnWakelock.classList.add('active');
          if (this.dom.wakelockLabel) this.dom.wakelockLabel.textContent = '已常亮';
        } catch (err) {
          console.warn('[Spyfall] Wake Lock request error:', err);
        }
      }
    }

    async releaseWakeLock() {
      if (this.wakeLockSentinel && typeof this.wakeLockSentinel.release === 'function') {
        try {
          await this.wakeLockSentinel.release();
        } catch (e) {}
      }
      this.wakeLockSentinel = null;
      this.isWakeLockRequested = false;
      if (this.dom.btnWakelock) this.dom.btnWakelock.classList.remove('active');
      if (this.dom.wakelockLabel) this.dom.wakelockLabel.textContent = '常亮';
    }

    /**
     * 原生分享与剪贴板回退
     */
    shareRoom() {
      if (!this.currentRoomCode) return;
      const win = (typeof window !== 'undefined' ? window : global.window) || {};
      const loc = win.location || { origin: '', pathname: '' };
      const shareUrl = `${loc.origin || ''}${loc.pathname || ''}?room=${this.currentRoomCode}`;
      const nav = (typeof window !== 'undefined' && window.navigator) || global.navigator;

      if (nav && nav.share && typeof nav.share === 'function') {
        nav.share({
          title: '间谍危机 (Spyfall)',
          text: `绝密行动代码：${this.currentRoomCode}，速来集结！`,
          url: shareUrl
        }).catch(() => {});
      } else if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        nav.clipboard.writeText(shareUrl).then(() => {
          this.notify('房间邀请链接已复制到剪贴板！');
        }).catch(() => {
          this.notify(`房间号：${this.currentRoomCode}`);
        });
      } else {
        this.notify(`房间号：${this.currentRoomCode}`);
      }
      this.sfx.play('click');
    }

    /**
     * 轻量提示信息
     */
    notify(message) {
      const win = (typeof window !== 'undefined' ? window : global.window) || {};
      const alertFn = win.alert || global.alert;
      if (alertFn) {
        alertFn(message);
      } else {
        console.log(`[Spyfall Notify] ${message}`);
      }
    }
  }

  // 浏览器环境自动实例化
  let clientInstance = null;
  function initClient() {
    clientInstance = new SpyfallClient();
    return clientInstance;
  }

  if (typeof window !== 'undefined') {
    window.SpyfallClient = SpyfallClient;
    window.initClient = initClient;
    if (typeof document !== 'undefined') {
      if (!document.readyState || document.readyState === 'complete' || document.readyState === 'interactive') {
        window.spyfallClient = initClient();
      } else if (typeof window.addEventListener === 'function') {
        window.addEventListener('DOMContentLoaded', () => {
          window.spyfallClient = initClient();
        });
      }
    }
  }

  // Node.js CommonJS 模块导出 (供单元测试调用)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      SpyfallClient,
      initClient,
      get client() {
        return initClient();
      }
    };
  }
})(typeof window !== 'undefined' ? window : global);
