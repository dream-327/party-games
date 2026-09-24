/**
 * test_spyfall_decoupled_ui.js
 * 专门验证用户五大核心优化诉求的自动化测试套件：
 * 0. 防偷窥卡牌 100% 实色防穿透闭锁
 * 1. 核心交互：解耦首页 (view-entry) 与房间大厅 (lobby-room-details)
 * 2. 视觉比例与特工头像网格排版
 * 3. 房间大厅体验：行动代码、复制邀请令、随机代号骰子、吸底开局按钮与名单独立滚动
 * 4. 功能与规则补充：备忘录入口、AI人机高科技芯片视觉
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 开始测试间谍危机大厅解耦与防窥重构专项 (test_spyfall_decoupled_ui.js)...');

const htmlContent = fs.readFileSync(path.join(__dirname, 'public/spyfall/index.html'), 'utf-8');
const cssContent = fs.readFileSync(path.join(__dirname, 'public/spyfall/style.css'), 'utf-8');
const clientPath = path.join(__dirname, 'public', 'spyfall', 'client.js');

// 1. 验证 HTML 结构
console.log('1️⃣ 验证 HTML 解耦结构与全新组件 ID...');
assert(htmlContent.includes('id="view-entry"'), 'HTML 必须包含未进房首页视图 #view-entry');
assert(htmlContent.includes('id="lobby-room-details"'), 'HTML 必须包含房间等待大厅 #lobby-room-details');
assert(htmlContent.includes('id="btn-random-name"'), 'HTML 必须包含随机特工代号按钮 #btn-random-name');
assert(htmlContent.includes('id="btn-guide-entry"'), 'HTML 必须包含首页玩法指南按钮 #btn-guide-entry');
assert(htmlContent.includes('id="btn-guide-lobby"'), 'HTML 必须包含大厅备忘录按钮 #btn-guide-lobby');
assert(htmlContent.includes('id="lobby-self-pill"'), 'HTML 必须包含个人资料药丸卡 #lobby-self-pill');
assert(htmlContent.includes('id="lobby-self-avatar"'), 'HTML 必须包含个人资料头像 #lobby-self-avatar');
assert(htmlContent.includes('id="lobby-self-name"'), 'HTML 必须包含个人资料昵称 #lobby-self-name');
assert(htmlContent.includes('id="btn-leave-room"'), 'HTML 必须包含退出房间按钮 #btn-leave-room');
assert(htmlContent.includes('id="btn-copy-invite"'), 'HTML 必须包含复制邀请令按钮 #btn-copy-invite');
assert(htmlContent.includes('player-roster-scroll-container'), 'HTML 必须包含特工名单独立滚动容器 player-roster-scroll-container');
assert(htmlContent.includes('lobby-sticky-footer'), 'HTML 必须包含吸底操作容器 lobby-sticky-footer');
assert(htmlContent.includes('id="lobby-guest-hint"'), 'HTML 必须包含非房主等待提示 #lobby-guest-hint');
console.log('  ✓ HTML 结构解耦与新增元素全部齐备');

// 2. 验证 CSS 关键规范
console.log('2️⃣ 验证防偷窥遮罩实色与吸底排版样式...');
assert(cssContent.includes('.card-secret-cover'), 'CSS 必须包含 .card-secret-cover');
assert(cssContent.includes('background-color: #0b0f19 !important'), '防窥遮罩必须使用 100% 实色 background-color 杜绝半透明漏光');
assert(cssContent.includes('.card-secret:not(.revealed) .card-secret-content'), 'CSS 必须包含未翻开时内容强制隐藏的双保险');
assert(cssContent.includes('visibility: hidden !important'), '未翻开时底层脱敏内容必须 visibility: hidden');
assert(cssContent.includes('.lobby-sticky-footer'), 'CSS 必须包含 .lobby-sticky-footer');
assert(cssContent.includes('position: sticky'), '开局按钮底栏必须 position: sticky 吸底');
assert(cssContent.includes('.player-roster-scroll-container'), 'CSS 必须包含 .player-roster-scroll-container');
assert(cssContent.includes('overflow-y: auto'), '特工名单容器必须支持内部独立滚动 overflow-y: auto');
assert(cssContent.includes('.self-profile-pill'), 'CSS 必须包含个人状态收敛胶囊 .self-profile-pill');
assert(cssContent.includes('.btn-dice'), 'CSS 必须包含骰子按钮样式 .btn-dice');
console.log('  ✓ CSS 防窥遮罩纯实色与大厅自适应吸底样式规范全部通过');

// 3. 验证客户端引擎解耦流转与交互逻辑
console.log('3️⃣ 验证客户端引擎视图流转、随机代号与退出房间...');

function createMockElement(tag, id = '', className = '') {
  return {
    tagName: tag.toUpperCase(),
    id,
    className,
    classList: {
      _classes: new Set(className ? className.split(/\s+/).filter(Boolean) : []),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this._classes.has(c)) this._classes.delete(c);
          else this._classes.add(c);
        } else if (force) this._classes.add(c);
        else this._classes.delete(c);
      },
      contains(c) { return this._classes.has(c); }
    },
    style: {},
    dataset: {},
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener() {},
    removeEventListener() {},
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k] || null; },
    removeAttribute(k) { delete this[k]; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false
  };
}

const mockIds = [
  'screen-lobby', 'screen-playing',
  'view-entry', 'avatar-selector', 'input-name', 'btn-random-name', 'input-room-code',
  'btn-create-room', 'btn-join-room', 'btn-guide-entry',
  'lobby-room-details', 'lobby-self-pill', 'lobby-self-avatar', 'lobby-self-name',
  'btn-guide-lobby', 'btn-leave-room', 'lobby-room-code', 'btn-copy-invite', 'btn-share',
  'select-duration', 'lobby-player-count', 'lobby-bot-actions', 'btn-add-bot', 'btn-fill-bots', 'btn-clear-bots',
  'waiting-players', 'btn-start-game', 'lobby-guest-hint',
  'room-code-display', 'online-count', 'btn-wakelock', 'wakelock-label', 'btn-guide',
  'timer-display', 'timer-badge',
  'card-secret', 'card-secret-cover', 'card-secret-content', 'secret-badge',
  'secret-location-title', 'secret-location-icon', 'secret-location-name', 'secret-role-desc', 'secret-role-name',
  'btn-spy-guess', 'btn-accuse',
  'location-scratchpad', 'scratchpad-filter', 'scratchpad-list', 'roster-seats',
  'modal-guide', 'modal-accuse', 'modal-guess', 'modal-settlement',
  'btn-close-guide', 'btn-close-accuse', 'btn-close-guess',
  'accuse-step-select', 'accuse-step-vote', 'accuse-suspect-list', 'btn-confirm-accuse',
  'vote-accuser-name', 'vote-suspect-name', 'vote-timer', 'btn-vote-yes', 'btn-vote-no',
  'guess-cluster-tabs', 'guess-location-grid', 'btn-confirm-guess',
  'settlement-title', 'settlement-winner', 'settlement-reason', 'settlement-location',
  'settlement-role-reveal', 'btn-play-again', 'btn-return-lobby'
];

const elementsById = new Map();
mockIds.forEach(id => {
  elementsById.set(id, createMockElement('div', id));
});

const mockDocument = {
  getElementById: (id) => elementsById.get(id) || null,
  querySelector: (sel) => {
    if (sel.startsWith('#')) return elementsById.get(sel.substring(1)) || null;
    return null;
  },
  querySelectorAll: () => []
};

const mockLocalStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};

let lastEmitted = null;
const mockSocket = {
  on() {},
  emit(evt, data) {
    lastEmitted = { evt, data };
  }
};

let lastCopied = '';
global.window = {
  localStorage: mockLocalStorage,
  location: { origin: 'http://localhost:3000', pathname: '/spyfall', search: '', href: 'http://localhost:3000/spyfall' },
  history: { replaceState() {} },
  navigator: {
    clipboard: {
      writeText: (t) => {
        lastCopied = t;
        return Promise.resolve();
      }
    }
  },
  addEventListener() {},
  io: () => mockSocket,
  alert: () => {}
};
global.document = mockDocument;
global.localStorage = mockLocalStorage;
global.navigator = global.window.navigator;
global.AudioContext = class {
  createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } }; }
  createOscillator() { return { connect() {}, start() {}, stop() {}, type: '', frequency: { setValueAtTime() {} } }; }
};

delete require.cache[require.resolve(clientPath)];
const clientModule = require(clientPath);
const client = clientModule.initClient ? clientModule.initClient() : (clientModule.client || global.window.spyfallClient);

// 测试 1: 未进房状态下的视图渲染
client.currentRoomCode = null;
client.renderLobbyPhase();
assert.strictEqual(elementsById.get('view-entry').style.display, 'block', '未进房状态下 #view-entry 必须显式展示');
assert.strictEqual(elementsById.get('lobby-room-details').style.display, 'none', '未进房状态下 #lobby-room-details 必须隐藏');
console.log('  ✓ 未进房状态下成功仅展示首页入口，隐藏行动大厅');

// 测试 2: 进房状态下的视图流转
client.currentRoomCode = '9988';
client.playerName = '暗夜狐狸';
client.playerAvatar = '🦊';
client.isHost = true;
client.players = [
  { id: 'h1', name: '暗夜狐狸', avatar: '🦊', isHost: true, isOnline: true, isBot: false },
  { id: 'b1', name: '智械特工01', avatar: '🤖', isHost: false, isOnline: true, isBot: true },
  { id: 'b2', name: '赛博先锋', avatar: '🦾', isHost: false, isOnline: true, isBot: true }
];
client.renderLobbyPhase();

assert.strictEqual(elementsById.get('view-entry').style.display, 'none', '已进房后 #view-entry 必须自动隐藏');
assert.strictEqual(elementsById.get('lobby-room-details').style.display, 'block', '已进房后 #lobby-room-details 必须展示');
assert.strictEqual(elementsById.get('lobby-room-code').textContent, '9988', '大厅行动代码正确更新');
assert.strictEqual(elementsById.get('lobby-self-avatar').textContent, '🦊', '大厅个人胶囊头像正确收敛渲染');
assert.strictEqual(elementsById.get('lobby-self-name').textContent, '暗夜狐狸', '大厅个人胶囊昵称正确收敛渲染');
assert.strictEqual(elementsById.get('btn-start-game').disabled, false, '满3人房主可开启任务');
assert.strictEqual(elementsById.get('lobby-guest-hint').style.display, 'none', '房主不展示普通玩家等待提示');
console.log('  ✓ 进房状态下首页自动隐藏，独立大厅展现，个人资料正确收敛至顶部药丸');

// 测试 3: 普通玩家视角下的提示与按钮
client.isHost = false;
client.renderLobbyPhase();
assert.strictEqual(elementsById.get('btn-start-game').style.display, 'none', '普通玩家隐藏开局按钮');
assert.strictEqual(elementsById.get('lobby-guest-hint').style.display, 'block', '普通玩家展示等待房主开局提示');
console.log('  ✓ 非房主普通玩家大厅提示正确渲染');

// 测试 4: 随机特工代号生成
client.randomizeName();
assert.ok(client.playerName && client.playerName.length > 0, '必须成功生成特工代号');
assert.strictEqual(elementsById.get('input-name').value, client.playerName, '代号输入框必须同步填入随机代号');
console.log(`  ✓ 成功随机抽取代号: ${client.playerName}`);

// 测试 5: 复合邀请令复制
client.currentRoomCode = '6543';
client.copyInviteText();
assert(lastCopied.includes('6543'), '邀请令必须包含房间号 6543');
assert(lastCopied.includes('room=6543'), '邀请令必须包含直连参数 room=6543');
assert(lastCopied.includes('【绝密行动招募】'), '邀请令具备战术沉浸感文案');
console.log('  ✓ 复合邀请令生成并复制到剪贴板验证通过');

// 测试 6: 退出房间返回首页大厅
client.leaveRoom();
assert.strictEqual(client.currentRoomCode, null, '退出房间后 currentRoomCode 必须重置为 null');
assert.strictEqual(elementsById.get('view-entry').style.display, 'block', '退出房间后必须自动回到首页入口');
assert.strictEqual(elementsById.get('lobby-room-details').style.display, 'none', '退出房间后大厅详情必须隐藏');
assert.strictEqual(lastEmitted.evt, 'leave_room', '必须向服务端发送 leave_room 事件');
console.log('  ✓ 退出行动组解耦回退与 Socket 事件通知全部验证通过');

console.log('\n🎉 间谍危机大厅解耦与防窥重构专项测试全部通过！');
