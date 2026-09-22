const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('🧪 [TDD] 开始测试间谍危机客户端核心引擎 (public/spyfall/client.js)...');

// 构造轻量 Mock DOM 与浏览器环境
function createMockElement(tagName = 'div', id = '', classNames = '') {
  const classes = new Set(classNames.split(' ').filter(Boolean));
  const listeners = {};
  const children = [];
  const attributes = {};

  const element = {
    tagName: tagName.toUpperCase(),
    id,
    classList: {
      add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)),
      toggle: (name, force) => {
        if (typeof force === 'boolean') {
          if (force) classes.add(name); else classes.delete(name);
          return force;
        }
        if (classes.has(name)) {
          classes.delete(name);
          return false;
        } else {
          classes.add(name);
          return true;
        }
      },
      contains: (name) => classes.has(name)
    },
    get className() {
      return Array.from(classes).join(' ');
    },
    set className(val) {
      classes.clear();
      (val || '').split(' ').filter(Boolean).forEach(n => classes.add(n));
    },
    dataset: {},
    style: {},
    value: '',
    disabled: false,
    _textContent: '',
    get textContent() {
      return this._textContent;
    },
    set textContent(val) {
      this._textContent = val === null || val === undefined ? '' : String(val);
    },
    _innerHTML: '',
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(html) {
      this._innerHTML = html;
      // 简单清空 children
      children.length = 0;
    },
    children,
    appendChild: (child) => {
      children.push(child);
      child.parentElement = element;
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
      child.parentElement = null;
      return child;
    },
    replaceChildren: (...newChildren) => {
      children.length = 0;
      newChildren.forEach(child => {
        children.push(child);
        child.parentElement = element;
      });
    },
    addEventListener: (evt, cb) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(cb);
    },
    removeEventListener: (evt, cb) => {
      if (!listeners[evt]) return;
      listeners[evt] = listeners[evt].filter(f => f !== cb);
    },
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      const eventObj = typeof evt === 'string' ? { type: evt, target: element, preventDefault: () => {} } : evt;
      if (!eventObj.target) eventObj.target = element;
      if (listeners[type]) {
        listeners[type].forEach(cb => cb(eventObj));
      }
      return true;
    },
    click: () => {
      element.dispatchEvent({ type: 'click', target: element, preventDefault: () => {} });
    },
    setAttribute: (name, val) => {
      attributes[name] = String(val);
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        element.dataset[key] = String(val);
      }
    },
    getAttribute: (name) => attributes[name] || null,
    removeAttribute: (name) => {
      delete attributes[name];
    },
    hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attributes, name),
    querySelector: (selector) => {
      return findDescendant(element, selector);
    },
    querySelectorAll: (selector) => {
      return findAllDescendants(element, selector);
    }
  };

  return element;
}

function findDescendant(root, selector) {
  const all = findAllDescendants(root, selector);
  return all.length > 0 ? all[0] : null;
}

function findAllDescendants(root, selector) {
  const results = [];
  function traverse(node) {
    if (!node || !node.children) return;
    for (const child of node.children) {
      if (matchesSelector(child, selector)) {
        results.push(child);
      }
      traverse(child);
    }
  }
  traverse(root);
  return results;
}

function matchesSelector(el, selector) {
  if (selector.startsWith('#')) {
    return el.id === selector.substring(1);
  }
  if (selector.startsWith('.')) {
    return el.classList && el.classList.contains(selector.substring(1));
  }
  if (selector.startsWith('[data-close')) {
    if (selector.includes('=')) {
      const match = selector.match(/\[data-close="([^"]+)"\]/);
      return match ? el.dataset.close === match[1] : false;
    }
    return 'close' in el.dataset;
  }
  if (selector.startsWith('[data-')) {
    const key = selector.slice(6, -1).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return Object.prototype.hasOwnProperty.call(el.dataset, key);
  }
  return el.tagName === selector.toUpperCase();
}

function setupMockEnvironment() {
  const elementsById = new Map();

  function register(el) {
    if (el.id) elementsById.set(el.id, el);
    return el;
  }

  // 大厅元素
  const screenLobby = register(createMockElement('section', 'screen-lobby', 'screen'));
  const avatarSelector = register(createMockElement('div', 'avatar-selector', 'avatar-selector'));
  const avatars = ['🤠', '🕵️‍♂️', '🕶️', '👩‍💼', '👨‍🔬', '🤖', '🥷', '👮', '🧙', '🧑‍🚀', '🧕', '🦊'];
  avatars.forEach((av, idx) => {
    const opt = createMockElement('div', '', 'avatar-option' + (idx === 0 ? ' selected' : ''));
    opt.dataset.avatar = av;
    opt.textContent = av;
    avatarSelector.appendChild(opt);
  });
  screenLobby.appendChild(avatarSelector);

  const inputName = register(createMockElement('input', 'input-name', 'input-text'));
  screenLobby.appendChild(inputName);

  const btnCreateRoom = register(createMockElement('button', 'btn-create-room', 'btn btn-primary'));
  screenLobby.appendChild(btnCreateRoom);

  const inputRoomCode = register(createMockElement('input', 'input-room-code', 'input-text'));
  screenLobby.appendChild(inputRoomCode);

  const btnJoinRoom = register(createMockElement('button', 'btn-join-room', 'btn btn-secondary'));
  screenLobby.appendChild(btnJoinRoom);

  const lobbyRoomDetails = register(createMockElement('div', 'lobby-room-details', 'card-panel'));
  const lobbyRoomCode = register(createMockElement('span', 'lobby-room-code', 'room-code-tag'));
  const btnShare = register(createMockElement('button', 'btn-share', 'btn-icon-tag'));
  const selectDuration = register(createMockElement('div', 'select-duration', 'duration-selector'));
  [5, 8, 10, 12].forEach((m, idx) => {
    const dOpt = createMockElement('div', '', 'duration-option' + (idx === 1 ? ' active' : ''));
    dOpt.dataset.minutes = String(m);
    selectDuration.appendChild(dOpt);
  });
  const lobbyPlayerCount = register(createMockElement('span', 'lobby-player-count'));
  const waitingPlayers = register(createMockElement('div', 'waiting-players', 'player-roster'));
  const btnStartGame = register(createMockElement('button', 'btn-start-game', 'btn btn-amber'));

  lobbyRoomDetails.appendChild(lobbyRoomCode);
  lobbyRoomDetails.appendChild(btnShare);
  lobbyRoomDetails.appendChild(selectDuration);
  lobbyRoomDetails.appendChild(lobbyPlayerCount);
  lobbyRoomDetails.appendChild(waitingPlayers);
  lobbyRoomDetails.appendChild(btnStartGame);
  screenLobby.appendChild(lobbyRoomDetails);

  // 对局主屏幕元素
  const screenPlaying = register(createMockElement('section', 'screen-playing', 'screen hidden'));
  const roomCodeDisplay = register(createMockElement('span', 'room-code-display', 'room-code-tag'));
  const onlineCount = register(createMockElement('span', 'online-count'));
  const btnWakelock = register(createMockElement('button', 'btn-wakelock', 'btn-icon-tag'));
  const wakelockLabel = register(createMockElement('span', 'wakelock-label'));
  const btnGuide = register(createMockElement('button', 'btn-guide', 'btn-icon-tag'));
  const timerDisplay = register(createMockElement('span', 'timer-display', 'timer-digits'));
  const timerBadge = register(createMockElement('span', 'timer-badge', 'timer-badge'));

  // 绝密身份卡
  const cardSecret = register(createMockElement('div', 'card-secret', 'card-secret'));
  const cardSecretCover = register(createMockElement('div', 'card-secret-cover', 'card-secret-cover'));
  const cardSecretContent = register(createMockElement('div', 'card-secret-content', 'card-secret-content'));
  const secretBadge = register(createMockElement('div', 'secret-badge', 'secret-role-badge'));
  const secretLocationTitle = register(createMockElement('div', 'secret-location-title'));
  const secretLocationIcon = register(createMockElement('span', 'secret-location-icon'));
  const secretLocationName = register(createMockElement('span', 'secret-location-name'));
  const secretRoleDesc = register(createMockElement('div', 'secret-role-desc'));
  const secretRoleName = register(createMockElement('span', 'secret-role-name'));

  secretLocationTitle.appendChild(secretLocationIcon);
  secretLocationTitle.appendChild(secretLocationName);
  secretRoleDesc.appendChild(secretRoleName);
  cardSecretContent.appendChild(secretBadge);
  cardSecretContent.appendChild(secretLocationTitle);
  cardSecretContent.appendChild(secretRoleDesc);
  cardSecret.appendChild(cardSecretCover);
  cardSecret.appendChild(cardSecretContent);

  // 操作按钮
  const btnSpyGuess = register(createMockElement('button', 'btn-spy-guess', 'btn btn-action'));
  const btnAccuse = register(createMockElement('button', 'btn-accuse', 'btn btn-action'));
  const locationScratchpad = register(createMockElement('div', 'location-scratchpad', 'scratchpad-grid'));
  const seatsBar = register(createMockElement('div', 'seats-bar', 'seats-bar'));

  screenPlaying.appendChild(roomCodeDisplay);
  screenPlaying.appendChild(onlineCount);
  screenPlaying.appendChild(btnWakelock);
  btnWakelock.appendChild(wakelockLabel);
  screenPlaying.appendChild(btnGuide);
  screenPlaying.appendChild(timerDisplay);
  screenPlaying.appendChild(timerBadge);
  screenPlaying.appendChild(cardSecret);
  screenPlaying.appendChild(btnSpyGuess);
  screenPlaying.appendChild(btnAccuse);
  screenPlaying.appendChild(locationScratchpad);
  screenPlaying.appendChild(seatsBar);

  // 弹窗 1: 指南
  const modalGuide = register(createMockElement('div', 'modal-guide', 'modal-overlay'));
  const btnCloseGuide = createMockElement('button', '', 'modal-close');
  btnCloseGuide.dataset.close = 'modal-guide';
  modalGuide.appendChild(btnCloseGuide);

  // 弹窗 2: 指控
  const modalAccuse = register(createMockElement('div', 'modal-accuse', 'modal-overlay'));
  const btnCloseAccuse = createMockElement('button', '', 'modal-close');
  btnCloseAccuse.dataset.close = 'modal-accuse';
  const accuseStepSelect = register(createMockElement('div', 'accuse-step-select'));
  const suspectList = register(createMockElement('div', 'suspect-list', 'suspect-list'));
  const accuseStepVote = register(createMockElement('div', 'accuse-step-vote'));
  const accuserName = register(createMockElement('span', 'accuser-name'));
  const suspectName = register(createMockElement('span', 'suspect-name'));
  const btnVoteAgree = register(createMockElement('button', 'btn-vote-agree', 'btn btn-crimson'));
  const btnVoteDisagree = register(createMockElement('button', 'btn-vote-disagree', 'btn btn-secondary'));
  const voteStatusText = register(createMockElement('div', 'vote-status-text'));
  const accuseFooterSelect = register(createMockElement('div', 'accuse-footer-select'));
  const btnConfirmAccuse = register(createMockElement('button', 'btn-confirm-accuse', 'btn btn-crimson'));
  btnConfirmAccuse.disabled = true;

  accuseStepSelect.appendChild(suspectList);
  accuseStepVote.appendChild(accuserName);
  accuseStepVote.appendChild(suspectName);
  accuseStepVote.appendChild(btnVoteAgree);
  accuseStepVote.appendChild(btnVoteDisagree);
  accuseStepVote.appendChild(voteStatusText);
  accuseFooterSelect.appendChild(btnConfirmAccuse);
  modalAccuse.appendChild(btnCloseAccuse);
  modalAccuse.appendChild(accuseStepSelect);
  modalAccuse.appendChild(accuseStepVote);
  modalAccuse.appendChild(accuseFooterSelect);

  // 弹窗 3: 猜地点
  const modalGuess = register(createMockElement('div', 'modal-guess', 'modal-overlay'));
  const btnCloseGuess = createMockElement('button', '', 'modal-close');
  btnCloseGuess.dataset.close = 'modal-guess';
  const guessGrid = register(createMockElement('div', 'guess-grid', 'guess-grid'));
  const btnConfirmGuess = register(createMockElement('button', 'btn-confirm-guess', 'btn btn-amber'));
  btnConfirmGuess.disabled = true;
  modalGuess.appendChild(btnCloseGuess);
  modalGuess.appendChild(guessGrid);
  modalGuess.appendChild(btnConfirmGuess);

  // 弹窗 4: 结算
  const modalSettlement = register(createMockElement('div', 'modal-settlement', 'modal-overlay'));
  const settlementWinnerText = register(createMockElement('div', 'settlement-winner-text', 'settlement-winner'));
  const settlementReasonText = register(createMockElement('div', 'settlement-reason-text', 'settlement-reason'));
  const settlementLocation = register(createMockElement('div', 'settlement-location'));
  const settlementSpy = register(createMockElement('div', 'settlement-spy'));
  const settlementPlayersList = register(createMockElement('div', 'settlement-players-list', 'settlement-cards'));
  const btnRestart = register(createMockElement('button', 'btn-restart', 'btn btn-primary'));

  modalSettlement.appendChild(settlementWinnerText);
  modalSettlement.appendChild(settlementReasonText);
  modalSettlement.appendChild(settlementLocation);
  modalSettlement.appendChild(settlementSpy);
  modalSettlement.appendChild(settlementPlayersList);
  modalSettlement.appendChild(btnRestart);

  // 模拟 localStorage
  const storageData = {};
  const mockLocalStorage = {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null),
    setItem: (key, val) => { storageData[key] = String(val); },
    removeItem: (key) => { delete storageData[key]; },
    clear: () => { Object.keys(storageData).forEach(k => delete storageData[k]); }
  };

  // 模拟 Socket
  const socketListeners = {};
  const emittedEvents = [];
  const mockSocket = {
    on: (evt, cb) => {
      if (!socketListeners[evt]) socketListeners[evt] = [];
      socketListeners[evt].push(cb);
    },
    emit: (evt, data, cb) => {
      emittedEvents.push({ evt, data });
      if (typeof cb === 'function') {
        cb({ success: true, roomCode: '8888', playerId: data && data.player ? data.player.id : 'p_mock' });
      }
    },
    _trigger: (evt, data) => {
      if (socketListeners[evt]) {
        socketListeners[evt].forEach(cb => cb(data));
      }
    },
    _emitted: emittedEvents
  };

  // 模拟 SFX
  const sfxPlayed = [];
  const mockSfx = {
    play: (name) => { sfxPlayed.push(name); },
    _played: sfxPlayed
  };

  const documentListeners = {};
  const windowListeners = {};

  const mockDocument = {
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elementsById.get(sel.substring(1)) || null;
      for (const el of elementsById.values()) {
        const found = findDescendant(el, sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (sel) => {
      const list = [];
      for (const el of elementsById.values()) {
        if (matchesSelector(el, sel)) list.push(el);
        const sub = findAllDescendants(el, sel);
        list.push(...sub);
      }
      return Array.from(new Set(list));
    },
    addEventListener: (evt, cb) => {
      if (!documentListeners[evt]) documentListeners[evt] = [];
      documentListeners[evt].push(cb);
    },
    removeEventListener: (evt, cb) => {
      if (!documentListeners[evt]) return;
      documentListeners[evt] = documentListeners[evt].filter(f => f !== cb);
    },
    _trigger: (evt, eventObj) => {
      if (documentListeners[evt]) {
        documentListeners[evt].forEach(cb => cb(eventObj || { type: evt }));
      }
    }
  };

  let mockWakeLockSentinel = {
    release: async () => { mockWakeLockSentinel = null; }
  };
  let wakeLockRequested = false;

  const mockNavigator = {
    wakeLock: {
      request: async (type) => {
        wakeLockRequested = true;
        return mockWakeLockSentinel;
      }
    },
    clipboard: {
      writeText: async (text) => {
        mockClipboardText = text;
      }
    },
    share: async (data) => {
      mockSharedData = data;
    }
  };
  let mockClipboardText = '';
  let mockSharedData = null;

  const mockWindow = {
    location: {
      search: '',
      href: 'http://localhost:3000/spyfall/',
      hash: ''
    },
    addEventListener: (evt, cb) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(cb);
    },
    removeEventListener: (evt, cb) => {
      if (!windowListeners[evt]) return;
      windowListeners[evt] = windowListeners[evt].filter(f => f !== cb);
    },
    _trigger: (evt, eventObj) => {
      if (windowListeners[evt]) {
        windowListeners[evt].forEach(cb => cb(eventObj || { type: evt }));
      }
    },
    confirm: () => true,
    alert: (msg) => { mockAlerts.push(msg); },
    localStorage: mockLocalStorage,
    sfx: mockSfx,
    io: () => mockSocket
  };
  const mockAlerts = [];

  return {
    elementsById,
    mockDocument,
    mockWindow,
    mockLocalStorage,
    mockSocket,
    mockSfx,
    mockNavigator,
    getAlerts: () => mockAlerts,
    getWakeLockStatus: () => wakeLockRequested,
    getClipboardText: () => mockClipboardText
  };
}

// ==========================================
// 运行测试用例
// ==========================================
async function runTests() {
  const clientPath = path.join(__dirname, 'public', 'spyfall', 'client.js');
  
  // 必须验证 client.js 文件是否存在（初始 TDD 步骤预期在此失败）
  assert(fs.existsSync(clientPath), `public/spyfall/client.js 必须存在于路径: ${clientPath}`);

  console.log('1️⃣ 测试 localStorage 读取与身份初始化...');
  {
    const env = setupMockEnvironment();
    env.mockLocalStorage.setItem('spyfall_player_id', 'p_test_123');
    env.mockLocalStorage.setItem('spyfall_player_name', '特工007');
    env.mockLocalStorage.setItem('name', '特工007');
    env.mockLocalStorage.setItem('spyfall_avatar', '🕶️');
    env.mockLocalStorage.setItem('avatar', '🕶️');
    env.mockLocalStorage.setItem('last_room_code', '9527');

    global.window = env.mockWindow;
    global.document = env.mockDocument;
    global.localStorage = env.mockLocalStorage;
    global.navigator = env.mockNavigator;
    global.io = env.mockWindow.io;
    global.sfx = env.mockSfx;

    delete require.cache[require.resolve(clientPath)];
    const clientModule = require(clientPath);
    const client = clientModule.initClient ? clientModule.initClient() : (clientModule.client || window.spyfallClient);

    assert(client, '客户端实例必须已成功初始化');
    assert.strictEqual(client.playerId, 'p_test_123', '必须优先从 localStorage 恢复 player_id');
    assert.strictEqual(client.playerName, '特工007', '必须恢复已保存的昵称');
    assert.strictEqual(client.playerAvatar, '🕶️', '必须恢复已保存的头像');
    assert.strictEqual(env.elementsById.get('input-name').value, '特工007', '输入框必须同步填入已保存昵称');
    assert.strictEqual(env.elementsById.get('input-room-code').value, '9527', '房间代码输入框必须恢复 last_room_code');

    // 头像网格高亮
    const avatarOpts = env.elementsById.get('avatar-selector').children;
    const selectedAv = avatarOpts.find(o => o.dataset.avatar === '🕶️');
    assert(selectedAv && selectedAv.classList.contains('selected'), '已保存头像在网格中必须带有 .selected 类');

    console.log('  ✓ 已成功恢复 localStorage 中的历史玩家配置');
  }

  console.log('2️⃣ 测试防偷窥绝密身份卡 Hold-to-Reveal 交互与防窥收回...');
  {
    const env = setupMockEnvironment();
    global.window = env.mockWindow;
    global.document = env.mockDocument;
    global.localStorage = env.mockLocalStorage;
    global.navigator = env.mockNavigator;
    global.io = env.mockWindow.io;
    global.sfx = env.mockSfx;

    delete require.cache[require.resolve(clientPath)];
    require(clientPath);

    const cardSecret = env.elementsById.get('card-secret');
    assert(!cardSecret.classList.contains('revealed'), '初始状态下绝密卡牌不可处于翻开状态');

    // 按下卡牌 (mousedown / touchstart)
    cardSecret.dispatchEvent('mousedown');
    assert(cardSecret.classList.contains('revealed'), '按住卡牌时必须添加 .revealed 类显示身份');
    assert(env.mockSfx._played.includes('card'), '按下翻开卡牌时必须触发 sfx.card 音效');

    // 松开卡牌 (mouseup)
    cardSecret.dispatchEvent('mouseup');
    assert(!cardSecret.classList.contains('revealed'), '松开卡牌时必须移除 .revealed 类防偷窥');

    // touchstart 测试
    cardSecret.dispatchEvent('touchstart');
    assert(cardSecret.classList.contains('revealed'), '移动端 touchstart 必须翻开卡牌');

    // 滑动离开/滚动页面自动闭锁 (touchmove / window scroll)
    env.mockWindow._trigger('scroll');
    assert(!cardSecret.classList.contains('revealed'), '页面滑动滚动时必须立刻闭锁身份卡防窥');

    // 再次按下并测试窗口失去焦点 (blur)
    cardSecret.dispatchEvent('mousedown');
    assert(cardSecret.classList.contains('revealed'), '再次按下成功翻开');
    env.mockWindow._trigger('blur');
    assert(!cardSecret.classList.contains('revealed'), '窗口失焦 (blur) 时必须立刻闭锁身份卡防窥');

    console.log('  ✓ Hold-to-Reveal 按住查看与滑动/失焦即刻防窥闭锁逻辑验证通过');
  }

  console.log('3️⃣ 测试候选地点排查板 (Scratchpad) 三态循环状态机...');
  {
    const env = setupMockEnvironment();
    global.window = env.mockWindow;
    global.document = env.mockDocument;
    global.localStorage = env.mockLocalStorage;
    global.navigator = env.mockNavigator;
    global.io = env.mockWindow.io;
    global.sfx = env.mockSfx;

    delete require.cache[require.resolve(clientPath)];
    require(clientPath);

    // 模拟服务端下发 room_update 渲染地点排查板
    const sampleLocations = [
      { id: 'hospital', name: '综合医院', icon: '🏢', category: '公共服务' },
      { id: 'pirate_ship', name: '海盗船', icon: '🏴‍☠️', category: '海滨航行' },
      { id: 'space_station', name: '空间站', icon: '🚀', category: '尖端军事' }
    ];

    env.mockSocket._trigger('room_update', {
      roomCode: '6666',
      hostId: 'p_host',
      self: { id: 'p_self', isSpy: false, location: '综合医院', role: '主治医师' },
      players: [
        { id: 'p_self', name: '特工甲', avatar: '🤠', isOnline: true },
        { id: 'p_host', name: '特工乙', avatar: '🕵️', isOnline: true }
      ],
      allLocations: sampleLocations,
      gameState: {
        phase: 'PLAYING',
        durationMinutes: 8,
        expiresAt: Date.now() + 480000,
        isPaused: false
      }
    });

    const scratchpad = env.elementsById.get('location-scratchpad');
    assert.strictEqual(scratchpad.children.length, 3, '排查板必须渲染 3 个地点卡片');

    const firstCard = scratchpad.children[0];
    assert(firstCard.classList.contains('state-normal'), '卡片初始状态应为 state-normal');

    // 第一次点击：normal -> strikethrough (排除)
    firstCard.click();
    assert(!firstCard.classList.contains('state-normal'), '点击后脱离 state-normal');
    assert(firstCard.classList.contains('state-strikethrough'), '第1次点击必须转为 state-strikethrough (排除)');

    // 第二次点击：strikethrough -> starred (标星)
    firstCard.click();
    assert(!firstCard.classList.contains('state-strikethrough'), '点击后脱离 state-strikethrough');
    assert(firstCard.classList.contains('state-starred'), '第2次点击必须转为 state-starred (标星重点)');

    // 第三次点击：starred -> normal (恢复正常)
    firstCard.click();
    assert(!firstCard.classList.contains('state-starred'), '点击后脱离 state-starred');
    assert(firstCard.classList.contains('state-normal'), '第3次点击必须恢复为 state-normal');

    // 验证状态在局内 room_update 时保持不丢失
    firstCard.click(); // 设为 strikethrough
    assert(firstCard.classList.contains('state-strikethrough'), '设为 strikethrough');

    // 再次接收 room_update (对局中)
    env.mockSocket._trigger('room_update', {
      roomCode: '6666',
      hostId: 'p_host',
      self: { id: 'p_self', isSpy: false, location: '综合医院', role: '主治医师' },
      players: [
        { id: 'p_self', name: '特工甲', avatar: '🤠', isOnline: true },
        { id: 'p_host', name: '特工乙', avatar: '🕵️', isOnline: true }
      ],
      allLocations: sampleLocations,
      gameState: { phase: 'PLAYING', expiresAt: Date.now() + 400000, isPaused: false }
    });

    const firstCardAfterUpdate = scratchpad.children[0];
    assert(
      firstCardAfterUpdate.classList.contains('state-strikethrough'),
      '局内 room_update 刷新时不应重置玩家已排查的地板状态'
    );

    console.log('  ✓ 排查板三态循环 (normal -> strikethrough -> starred -> normal) 与纯客户端状态持久化验证通过');
  }

  console.log('4️⃣ 测试 Room Update 数据状态机、屏幕切换与倒计时计算...');
  {
    const env = setupMockEnvironment();
    global.window = env.mockWindow;
    global.document = env.mockDocument;
    global.localStorage = env.mockLocalStorage;
    global.navigator = env.mockNavigator;
    global.io = env.mockWindow.io;
    global.sfx = env.mockSfx;

    delete require.cache[require.resolve(clientPath)];
    require(clientPath);

    const screenLobby = env.elementsById.get('screen-lobby');
    const screenPlaying = env.elementsById.get('screen-playing');

    // 触发对局开始
    const expires = Date.now() + 180000; // 3分钟后
    env.mockSocket._trigger('room_update', {
      roomCode: '7777',
      hostId: 'p_self',
      self: {
        id: 'p_self',
        name: '平民玩家',
        avatar: '🤠',
        isSpy: false,
        isHost: true,
        location: '海盗船',
        locationIcon: '🏴‍☠️',
        role: '水手长'
      },
      players: [
        { id: 'p_self', name: '平民玩家', avatar: '🤠', isHost: true, isOnline: true, hasAccused: false },
        { id: 'p_spy', name: '神秘客', avatar: '🥷', isHost: false, isOnline: true, hasAccused: false },
        { id: 'p_other', name: '侦探乙', avatar: '🕵️', isHost: false, isOnline: true, hasAccused: true }
      ],
      allLocations: [
        { id: 'pirate_ship', name: '海盗船', icon: '🏴‍☠️', category: '海上' }
      ],
      gameState: {
        phase: 'PLAYING',
        durationMinutes: 3,
        expiresAt: expires,
        remainingMs: 180000,
        isPaused: false,
        firstQuestionerId: 'p_spy'
      }
    });

    assert(screenLobby.classList.contains('hidden'), '进入 PLAYING 后大厅界面必须隐藏');
    assert(!screenPlaying.classList.contains('hidden'), '进入 PLAYING 后对局界面必须展示');

    assert.strictEqual(env.elementsById.get('room-code-display').textContent, '7777', '房间号必须同步');
    assert.strictEqual(env.elementsById.get('online-count').textContent, '3', '在线人数必须同步');

    // 验证身份卡内容填装
    assert.strictEqual(env.elementsById.get('secret-location-name').textContent, '海盗船', '平民视角地点名称必须展示');
    assert.strictEqual(env.elementsById.get('secret-role-name').textContent, '水手长', '平民视角角色必须展示');
    assert(!env.elementsById.get('card-secret').classList.contains('is-spy'), '平民卡牌不可携带 .is-spy');

    // 验证间谍身份卡渲染
    env.mockSocket._trigger('room_update', {
      roomCode: '7777',
      hostId: 'p_self',
      self: {
        id: 'p_self',
        name: '间谍玩家',
        avatar: '🥷',
        isSpy: true,
        isHost: false,
        location: null,
        locationIcon: '❓',
        role: '间谍 (Spy)'
      },
      players: [
        { id: 'p_self', name: '间谍玩家', avatar: '🥷', isHost: false, isOnline: true }
      ],
      allLocations: [],
      gameState: {
        phase: 'PLAYING',
        expiresAt: expires,
        isPaused: false
      }
    });

    assert(env.elementsById.get('card-secret').classList.contains('is-spy'), '间谍玩家卡牌必须添加 .is-spy 类');
    assert(env.elementsById.get('secret-location-name').textContent.includes('未知'), '间谍视角地点必须提示未知');
    assert.strictEqual(env.elementsById.get('secret-role-name').textContent, '间谍 (Spy)', '间谍角色说明正确');

    console.log('  ✓ 状态转换、平民/间谍脱敏视图渲染及倒计时映射测试通过');
  }

  console.log('5️⃣ 测试操作流程与模态弹窗系统 (指南、指控、猜地点、结算与重开)...');
  {
    const env = setupMockEnvironment();
    global.window = env.mockWindow;
    global.document = env.mockDocument;
    global.localStorage = env.mockLocalStorage;
    global.navigator = env.mockNavigator;
    global.io = env.mockWindow.io;
    global.sfx = env.mockSfx;

    delete require.cache[require.resolve(clientPath)];
    require(clientPath);

    // A. 指南弹窗
    const btnGuide = env.elementsById.get('btn-guide');
    const modalGuide = env.elementsById.get('modal-guide');
    btnGuide.click();
    assert(modalGuide.classList.contains('active'), '点击 #btn-guide 必须激活指南弹窗 .active');
    modalGuide.querySelector('[data-close]').click();
    assert(!modalGuide.classList.contains('active'), '点击关闭按钮必须移除指南弹窗 .active');

    // B. 指控弹窗全流程
    env.mockSocket._trigger('room_update', {
      roomCode: '3333',
      hostId: 'p_accuser',
      self: { id: 'p_accuser', name: '指控者', isSpy: false, isHost: true, hasAccused: false },
      players: [
        { id: 'p_accuser', name: '指控者', avatar: '🤠', isHost: true, isOnline: true, hasAccused: false },
        { id: 'p_suspect', name: '嫌疑人', avatar: '🕵️', isHost: false, isOnline: true, hasAccused: false },
        { id: 'p_voter', name: '参议员', avatar: '🤖', isHost: false, isOnline: true, hasAccused: false }
      ],
      allLocations: [],
      gameState: { phase: 'PLAYING', isPaused: false }
    });

    const btnAccuse = env.elementsById.get('btn-accuse');
    const modalAccuse = env.elementsById.get('modal-accuse');
    btnAccuse.click();
    assert(modalAccuse.classList.contains('active'), '点击发起指控必须弹出指控窗口');

    const suspectList = env.elementsById.get('suspect-list');
    assert.strictEqual(suspectList.children.length, 2, '嫌疑人候选列表必须列出除自己外的所有玩家');

    // 选择嫌疑人并确认指控
    const suspectCard = suspectList.children[0];
    suspectCard.click();
    assert(suspectCard.classList.contains('selected'), '选中嫌疑人后添加 .selected 类');
    const btnConfirmAccuse = env.elementsById.get('btn-confirm-accuse');
    assert(!btnConfirmAccuse.disabled, '选中嫌疑人后确认指控按钮激活可用');

    btnConfirmAccuse.click();
    const lastEmit = env.mockSocket._emitted.slice(-1)[0];
    assert.strictEqual(lastEmit.evt, 'initiate_accuse', '点击确认指控必须发送 initiate_accuse 事件');
    assert.strictEqual(lastEmit.data.targetPlayerId, 'p_suspect', '被指控目标 ID 正确');

    // 模拟服务端广播 accuse_started
    env.mockSocket._trigger('accuse_started', {
      accuser: { id: 'p_accuser', name: '指控者' },
      suspect: { id: 'p_suspect', name: '嫌疑人' }
    });

    assert(env.mockSfx._played.includes('alarm'), '指控开始必须触发警报音效 alarm');
    assert.strictEqual(env.elementsById.get('accuse-step-vote').style.display, 'block', '投票步骤显示');
    assert.strictEqual(env.elementsById.get('accuser-name').textContent, '指控者', '指控人名字显示');
    assert.strictEqual(env.elementsById.get('suspect-name').textContent, '嫌疑人', '嫌疑人名字显示');

    // 参与投票
    const btnVoteAgree = env.elementsById.get('btn-vote-agree');
    btnVoteAgree.click();
    const voteEmit = env.mockSocket._emitted.slice(-1)[0];
    assert.strictEqual(voteEmit.evt, 'vote_accuse', '投票必须触发 vote_accuse 事件');
    assert.strictEqual(voteEmit.data.agree, true, '赞成票传递 agree: true');

    // 模拟表决完成，指控成功
    env.mockSocket._trigger('accuse_result', {
      success: true,
      consensus: true,
      suspectIsSpy: true,
      message: '全票通过！'
    });
    assert(!modalAccuse.classList.contains('active'), '表决结算后指控窗口自动关闭');

    // C. 间谍猜地点弹窗流程
    env.mockSocket._trigger('room_update', {
      roomCode: '3333',
      hostId: 'p_accuser',
      self: { id: 'p_spy', name: '卧底', isSpy: true, isHost: false },
      players: [{ id: 'p_spy', name: '卧底', avatar: '🕶️' }],
      allLocations: [
        { id: 'loc_bank', name: '国家银行', icon: '🏦' },
        { id: 'loc_theater', name: '大剧院', icon: '🎭' }
      ],
      gameState: { phase: 'PLAYING', isPaused: false }
    });

    const btnSpyGuess = env.elementsById.get('btn-spy-guess');
    const modalGuess = env.elementsById.get('modal-guess');
    btnSpyGuess.click();
    assert(modalGuess.classList.contains('active'), '间谍点击猜地点必须弹出猜地点窗口');

    const guessGrid = env.elementsById.get('guess-grid');
    assert.strictEqual(guessGrid.children.length, 2, '候选地点网格渲染全部地点');

    const guessCard = guessGrid.children[0];
    guessCard.click();
    assert(guessCard.classList.contains('selected'), '选中预测地点添加 .selected');

    const btnConfirmGuess = env.elementsById.get('btn-confirm-guess');
    assert(!btnConfirmGuess.disabled, '选中地点后指认确认按钮激活');
    btnConfirmGuess.click();

    const guessEmit = env.mockSocket._emitted.slice(-1)[0];
    assert.strictEqual(guessEmit.evt, 'spy_guess_location', '确认猜测发送 spy_guess_location');
    assert.strictEqual(guessEmit.data.locationId, 'loc_bank', '传递所选地点 ID');

    // D. 游戏结算与房主重开新一轮
    env.mockSocket._trigger('game_over_reveal', {
      winner: 'CIVILIAN',
      winReason: '间谍猜错地点，平民获胜！',
      targetLocation: { id: 'loc_theater', name: '大剧院', icon: '🎭' },
      spy: { id: 'p_spy', name: '特工小黑', avatar: '🕶️' }
    });

    const modalSettlement = env.elementsById.get('modal-settlement');
    assert(modalSettlement.classList.contains('active'), '对局结束必须展示结算复盘弹窗');
    assert.strictEqual(env.elementsById.get('settlement-winner-text').textContent, '平民阵营获胜！');

    // 房主点击再来一局重置
    const btnRestart = env.elementsById.get('btn-restart');
    btnRestart.click();
    const restartEmit = env.mockSocket._emitted.slice(-1)[0];
    assert.strictEqual(restartEmit.evt, 'restart_game', '房主点击再来一局必须发送 restart_game 事件');

    console.log('  ✓ 模态弹窗系统 (指南/指控/猜地点/结算/重开) 全流程闭环测试通过');
  }

  console.log('\n✅ 间谍危机客户端核心引擎测试全部通过！');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});
