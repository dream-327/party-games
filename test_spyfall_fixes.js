const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 开始测试间谍危机三大反馈专项 (test_spyfall_fixes.js)...');

const htmlContent = fs.readFileSync(path.join(__dirname, 'public/spyfall/index.html'), 'utf-8');
const cssContent = fs.readFileSync(path.join(__dirname, 'public/spyfall/style.css'), 'utf-8');
const clientPath = path.join(__dirname, 'public/spyfall/client.js');

// 1. 验证 HTML 中新增的元素
console.log('1️⃣ 验证 HTML 新增重开与返回大厅元素...');
assert(htmlContent.includes('id="btn-host-restart"'), '必须包含局内房主顶部重开按钮 #btn-host-restart');
assert(htmlContent.includes('id="host-playing-controls"'), '必须包含局内房主操作区域 #host-playing-controls');
assert(htmlContent.includes('id="btn-host-playing-restart"'), '必须包含局内房主主重开按钮 #btn-host-playing-restart');
assert(htmlContent.includes('id="btn-exit-hub"'), '对局顶部必须包含返回大厅按钮 #btn-exit-hub');
assert(htmlContent.includes('id="btn-leave-to-hub"'), '房间大厅必须包含返回大厅按钮 #btn-leave-to-hub');
assert(htmlContent.includes('id="btn-settlement-hub"'), '结算弹窗必须包含返回大厅按钮 #btn-settlement-hub');
assert(htmlContent.includes('id="btn-peek-hint"'), '身份卡遮罩层必须包含常驻翻看按钮 #btn-peek-hint');
assert(htmlContent.includes('id="btn-conceal-hint"'), '身份卡内容层必须包含立即关闭按钮 #btn-conceal-hint');
console.log('  ✓ HTML 结构新增元素验证通过');

// 2. 验证 CSS 样式
console.log('2️⃣ 验证 CSS 纯实色防透与按钮样式...');
assert(cssContent.includes('.card-secret-cover'), 'CSS 必须包含 .card-secret-cover');
assert(cssContent.includes('background-color: #0b0f19 !important'), '遮罩层必须包含 100% 纯实色 background-color');
assert(!cssContent.includes('background: #0b0f19 radial-gradient'), '必须清除无效的 CSS background 简写复合语法');
assert(cssContent.includes('.card-secret-content'), 'CSS 必须包含 .card-secret-content');
assert(cssContent.includes('.card-secret.is-spy .card-secret-content'), 'CSS 必须包含间谍身份卡专属样式');
assert(cssContent.includes('background-color: #1a0b12 !important'), '间谍身份卡内容呈现层必须使用纯实色背景，不得透明');
assert(cssContent.includes('.btn-peek-hint'), 'CSS 必须包含常驻翻看按钮样式 .btn-peek-hint');
assert(cssContent.includes('.btn-conceal-hint'), 'CSS 必须包含立即遮蔽按钮样式 .btn-conceal-hint');
assert(cssContent.includes('.btn-host-restart'), 'CSS 必须包含房主局内重开按钮样式 .btn-host-restart');
assert(cssContent.includes('.btn-exit-hub'), 'CSS 必须包含退出至大厅按钮样式 .btn-exit-hub');
console.log('  ✓ CSS 样式规范验证通过');

// 3. 验证 Client.js 客户端引擎
console.log('3️⃣ 验证 Client.js 交互与权限控制...');
function createMockElement(tag, id = '', className = '') {
  const classes = new Set((className || '').split(/\s+/).filter(Boolean));
  const listeners = {};
  const children = [];
  const element = {
    tagName: tag.toUpperCase(),
    id,
    className,
    classList: {
      add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)),
      toggle: (n, force) => {
        if (force === undefined) {
          if (classes.has(n)) classes.delete(n);
          else classes.add(n);
        } else if (force) classes.add(n);
        else classes.delete(n);
      },
      contains: (n) => classes.has(n)
    },
    dataset: {},
    style: {},
    children,
    appendChild: (c) => { children.push(c); return c; },
    addEventListener: (evt, cb) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(cb);
    },
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      const obj = typeof evt === 'string' ? { type, target: element, preventDefault: () => {}, stopPropagation: () => {} } : evt;
      if (listeners[type]) {
        listeners[type].forEach(cb => cb(obj));
      }
    },
    click: () => {
      element.dispatchEvent({ type: 'click', target: element, preventDefault: () => {}, stopPropagation: () => {} });
    }
  };
  return element;
}

const mockElements = new Map();
function register(el) {
  if (el.id) mockElements.set(el.id, el);
  return el;
}

const ids = [
  'screen-lobby', 'screen-playing', 'view-entry', 'lobby-room-details',
  'avatar-selector', 'input-name', 'btn-random-name', 'input-room-code',
  'btn-create-room', 'btn-join-room', 'btn-guide-entry', 'btn-guide-lobby',
  'btn-leave-to-hub', 'btn-leave-room', 'lobby-self-pill', 'lobby-self-avatar',
  'lobby-self-name', 'lobby-room-code', 'btn-copy-invite', 'btn-share',
  'select-duration', 'lobby-player-count', 'waiting-players', 'btn-start-game',
  'lobby-guest-hint', 'lobby-bot-actions', 'btn-add-bot', 'btn-fill-bots', 'btn-clear-bots',
  'btn-exit-hub', 'room-code-display', 'online-count', 'btn-host-restart',
  'btn-wakelock', 'wakelock-label', 'btn-guide', 'timer-display', 'timer-badge',
  'card-secret', 'card-secret-cover', 'card-secret-content', 'btn-peek-hint', 'btn-conceal-hint',
  'secret-badge', 'secret-location-title', 'secret-location-icon', 'secret-location-name',
  'secret-role-desc', 'secret-role-name', 'btn-spy-guess', 'btn-accuse',
  'host-playing-controls', 'btn-host-playing-restart', 'location-scratchpad', 'seats-bar',
  'modal-guide', 'modal-accuse', 'accuse-step-select', 'suspect-list', 'accuse-step-vote',
  'accuser-name', 'suspect-name', 'btn-vote-agree', 'btn-vote-disagree', 'vote-status-text',
  'accuse-footer-select', 'btn-confirm-accuse', 'modal-guess', 'guess-grid', 'btn-confirm-guess',
  'modal-settlement', 'settlement-winner-text', 'settlement-reason-text', 'settlement-location',
  'settlement-spy', 'settlement-players-list', 'btn-restart', 'btn-settlement-hub'
];

ids.forEach(id => register(createMockElement('div', id)));

const mockDocument = {
  getElementById: (id) => mockElements.get(id) || null,
  querySelector: (sel) => {
    if (sel.startsWith('#')) return mockElements.get(sel.substring(1)) || null;
    return null;
  },
  querySelectorAll: () => [],
  addEventListener: () => {}
};

const mockWindow = {
  location: { href: 'http://localhost:3000/spyfall/' },
  addEventListener: () => {},
  confirm: (msg) => true
};

const mockSocket = {
  on: () => {},
  emit: (event, data, cb) => {
    mockSocket._emitted.push({ event, data });
    if (typeof cb === 'function') cb({ success: true });
  },
  _emitted: []
};

mockWindow.io = () => mockSocket;
global.window = mockWindow;
global.document = mockDocument;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.navigator = {};
global.io = () => mockSocket;
global.sfx = { play: () => {}, isUnlocked: true };

delete require.cache[require.resolve(clientPath)];
const { initClient } = require(clientPath);
const client = global.window.spyfallClient || initClient();
assert(client, '客户端实例必须挂载');

// 测试局内房主重开控制
console.log('  Testing: 局内房主重开按钮展示控制...');
// 模拟局内普通玩家视角
client.handleRoomUpdate({
  roomCode: '6666',
  self: { id: 'p2', name: '特工B', isHost: false },
  players: [
    { id: 'p1', name: '房主', isHost: true },
    { id: 'p2', name: '特工B', isHost: false }
  ],
  gameState: { phase: 'PLAYING', remainingMs: 300000 }
});
assert.strictEqual(mockElements.get('btn-host-restart').style.display, 'none', '普通玩家不可见顶部重开按钮');
assert.strictEqual(mockElements.get('host-playing-controls').style.display, 'none', '普通玩家不可见局内重开控制栏');

// 模拟局内房主视角
client.handleRoomUpdate({
  roomCode: '6666',
  self: { id: 'p1', name: '房主', isHost: true },
  players: [
    { id: 'p1', name: '房主', isHost: true },
    { id: 'p2', name: '特工B', isHost: false }
  ],
  gameState: { phase: 'PLAYING', remainingMs: 300000 }
});
assert.strictEqual(mockElements.get('btn-host-restart').style.display, 'inline-flex', '房主必须展示顶部重开按钮');
assert.strictEqual(mockElements.get('host-playing-controls').style.display, 'block', '房主必须展示局内重开控制栏');

// 点击房主重开
mockElements.get('btn-host-restart').click();
const restartEmitted = mockSocket._emitted.find(e => e.event === 'restart_game');
assert(restartEmitted, '房主点击重开必须向服务端发送 restart_game 事件');

// 测试返回聚会大厅
console.log('  Testing: 点击退出至大厅 exitToHub...');
mockElements.get('btn-exit-hub').click();
assert.strictEqual(mockWindow.location.href, '/', '点击退出大厅必须重定向至 /');

// 测试身份卡常驻翻看与立即关闭
console.log('  Testing: 身份卡常驻翻看与立即关闭...');
const cardSecret = mockElements.get('card-secret');
mockElements.get('btn-peek-hint').click();
assert(cardSecret.classList.contains('revealed'), '点击常驻翻看必须添加 .revealed 类');
mockElements.get('btn-conceal-hint').click();
assert(!cardSecret.classList.contains('revealed'), '点击立即遮蔽必须移除 .revealed 类');

console.log('🎉 间谍危机三大反馈专项测试全部通过！');
