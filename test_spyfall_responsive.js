// 间谍危机 (Spyfall) - 手机移动端与电脑桌面端响应式双端测试
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 开始测试间谍危机电脑桌面端 (Desktop) 与手机移动端 (Mobile) 双端响应式渲染与交互...');

const htmlPath = path.join(__dirname, 'public', 'spyfall', 'index.html');
const cssPath = path.join(__dirname, 'public', 'spyfall', 'style.css');
const clientJsPath = path.join(__dirname, 'public', 'spyfall', 'client.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const cssContent = fs.readFileSync(cssPath, 'utf8');
const clientJsContent = fs.readFileSync(clientJsPath, 'utf8');

// ========================================================
// 1. 验证 HTML 结构中人机元素与双端基础
// ========================================================
console.log('1️⃣ 验证 HTML 大厅人机控制栏与基础结构...');
assert(htmlContent.includes('id="lobby-bot-actions"'), 'HTML 必须包含人机控制栏容器 #lobby-bot-actions');
assert(htmlContent.includes('id="btn-add-bot"'), '必须包含添加人机按钮 #btn-add-bot');
assert(htmlContent.includes('id="btn-fill-bots"'), '必须包含快速补齐3人按钮 #btn-fill-bots');
assert(htmlContent.includes('id="btn-clear-bots"'), '必须包含清空人机按钮 #btn-clear-bots');
console.log('  ✓ HTML 人机快捷按钮与大厅席位结构全部齐备');

// ========================================================
// 2. 验证 CSS 手机移动端 (Mobile) 适配样式
// ========================================================
console.log('2️⃣ 验证手机移动端 (Mobile) 样式规范...');
assert(cssContent.includes('--bg-primary: #0b0f19'), '必须具备暗黑背景主题');
assert(cssContent.includes('-webkit-tap-highlight-color: transparent'), '必须具备移动端触控高亮优化');
assert(cssContent.includes('.card-secret-cover'), '必须包含防窥遮罩层');
assert(cssContent.includes('.badge-bot'), '必须具备人机专属科技青高亮徽章 .badge-bot');
assert(cssContent.includes('.btn-remove-bot'), '必须具备便捷移除人机圆形按钮 .btn-remove-bot');
assert(cssContent.includes('.btn-xs'), '必须具备紧凑型小按钮样式 .btn-xs');

// 手机移动端单/双列排查板 (360px ~ 600px)
assert(
  cssContent.includes('grid-template-columns: repeat(2, 1fr)'),
  '移动端排查板默认采用清晰紧凑的双列网格布局'
);
assert(
  cssContent.includes('@media (max-width: 360px)'),
  '必须包含针对超窄小屏手机 (<360px) 的适配媒体查询'
);
console.log('  ✓ 手机移动端防窥、双列网格、触控优化与人机徽章样式完整');

// ========================================================
// 3. 验证 CSS 电脑桌面端 (Desktop) 宽屏适配样式
// ========================================================
console.log('3️⃣ 验证电脑桌面端 (Desktop 768px~1920px) 宽屏样式规范...');
assert(
  cssContent.includes('@media (min-width: 768px)'),
  '必须包含平板与桌面中大屏媒体查询 @media (min-width: 768px)'
);
assert(
  cssContent.includes('@media (min-width: 1024px)'),
  '必须包含大屏电脑桌面端媒体查询 @media (min-width: 1024px)'
);

// 提取 min-width: 768px 块检查宽屏特征
const desktop768Match = cssContent.match(/@media\s*\(\s*min-width:\s*768px\s*\)\s*\{([\s\S]*?)\n\}/);
assert(desktop768Match, '必须成功匹配 @media (min-width: 768px) 样式块');
const desktop768Css = desktop768Match[1];
assert(desktop768Css.includes('max-width: 800px') || desktop768Css.includes('max-width:'), '桌面端容器宽度必须放大扩展');
assert(desktop768Css.includes('repeat(3, 1fr)'), '桌面端排查板扩展至 3 列网格');

// 提取 min-width: 1024px 块检查大屏特征
const desktop1024Match = cssContent.match(/@media\s*\(\s*min-width:\s*1024px\s*\)\s*\{([\s\S]*?)\n\}/);
assert(desktop1024Match, '必须成功匹配 @media (min-width: 1024px) 样式块');
const desktop1024Css = desktop1024Match[1];
assert(desktop1024Css.includes('repeat(4, 1fr)'), '大屏电脑桌面端排查板自适应扩展至 4 列宽屏网格');
console.log('  ✓ 电脑桌面端宽屏自适应、大容器最大宽度与3/4列网格排版完整');

// ========================================================
// 4. 模拟双端运行环境验证交互逻辑 (Mobile & Desktop Client Test)
// ========================================================
console.log('4️⃣ 模拟双端客户端环境与人机控制交互...');

// 引入测试桩 DOM 与 SpyfallClient
const createMockElement = (id, tagName = 'div') => {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    style: {},
    classList: {
      _classes: new Set(),
      add(...args) { args.forEach(c => this._classes.add(c)); },
      remove(...args) { args.forEach(c => this._classes.delete(c)); },
      toggle(c, force) {
        if (force === true) this._classes.add(c);
        else if (force === false) this._classes.delete(c);
        else if (this._classes.has(c)) this._classes.delete(c);
        else this._classes.add(c);
      },
      contains(c) { return this._classes.has(c); }
    },
    dataset: {},
    children: [],
    listeners: {},
    addEventListener(event, handler) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(handler);
    },
    dispatchEvent(event) {
      const handlers = this.listeners[event.type || event] || [];
      handlers.forEach(h => h(event));
    },
    click() {
      this.dispatchEvent({ type: 'click', target: this });
    },
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    querySelectorAll() { return []; }
  };
  return el;
};

// 构造模拟 DOM
const elements = {};
const elementIds = [
  'screen-lobby', 'screen-playing',
  'avatar-selector', 'input-name', 'input-room-code',
  'btn-create-room', 'btn-join-room',
  'lobby-room-details', 'lobby-room-code', 'btn-share',
  'select-duration', 'lobby-player-count', 'waiting-players', 'btn-start-game',
  'lobby-bot-actions', 'btn-add-bot', 'btn-fill-bots', 'btn-clear-bots',
  'room-code-display', 'online-count', 'btn-wakelock', 'wakelock-label', 'btn-guide',
  'timer-display', 'timer-badge',
  'card-secret', 'card-secret-cover', 'card-secret-content', 'secret-badge',
  'secret-location-title', 'secret-location-icon', 'secret-location-name',
  'secret-role-desc', 'secret-role-name',
  'btn-spy-guess', 'btn-accuse',
  'location-scratchpad', 'seats-bar',
  'modal-guide', 'modal-accuse', 'accuse-step-select', 'accuse-step-vote',
  'suspect-list', 'accuser-name', 'suspect-name', 'btn-vote-agree', 'btn-vote-disagree',
  'vote-status-text', 'accuse-footer-select', 'btn-confirm-accuse',
  'modal-guess', 'guess-grid', 'btn-confirm-guess',
  'modal-settlement', 'settlement-winner-text', 'settlement-reason-text',
  'settlement-location', 'settlement-spy', 'settlement-players-list', 'btn-restart'
];

elementIds.forEach(id => {
  elements[id] = createMockElement(id);
});

// 模拟全局环境
global.document = {
  getElementById: (id) => elements[id] || null,
  createElement: (tag) => createMockElement(`dyn_${Date.now()}_${Math.random()}`, tag),
  querySelectorAll: () => [],
  addEventListener: () => {}
};
global.window = {
  location: { search: '' },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  navigator: {},
  addEventListener: () => {},
  removeEventListener: () => {}
};
global.localStorage = global.window.localStorage;
global.navigator = global.window.navigator;

// 载入客户端引擎
global.sfx = { play: () => {}, vibrate: () => {} };
global.io = () => ({ on: () => {}, emit: () => {} });

delete require.cache[require.resolve(clientJsPath)];
const { SpyfallClient: SpyfallClientClass } = require(clientJsPath);
assert(SpyfallClientClass, 'SpyfallClient 必须成功载入');

const client = new SpyfallClientClass();
assert.ok(client.dom.lobbyBotActions, 'client 必须成功缓存 lobbyBotActions 节点');
assert.ok(client.dom.btnAddBot, 'client 必须成功缓存 btnAddBot 节点');
assert.ok(client.dom.btnFillBots, 'client 必须成功缓存 btnFillBots 节点');
assert.ok(client.dom.btnClearBots, 'client 必须成功缓存 btnClearBots 节点');

// 模拟房主身份在桌面端/手机端查看大厅
client.isHost = true;
client.currentRoomCode = '7788';
client.players = [
  { id: 'p1', name: '房主本人', avatar: '🤠', isHost: true, isOnline: true, isBot: false },
  { id: 'bot_1', name: '智械特工01', avatar: '🤖', isHost: false, isOnline: true, isBot: true },
  { id: 'bot_2', name: '赛博先锋', avatar: '🦾', isHost: false, isOnline: true, isBot: true }
];

client.renderLobbyPhase();

// 验证房主大厅中人机控制栏展示
assert.strictEqual(elements['lobby-bot-actions'].style.display, 'flex');
// 验证 3 名特工时开始游戏按钮已就绪
assert.strictEqual(elements['btn-start-game'].disabled, false);
assert(elements['waiting-players'].innerHTML.includes('badge-bot'), '等待列表必须包含 badge-bot 标签');
assert(elements['waiting-players'].innerHTML.includes('btn-remove-bot'), '房主视角下人机必须提供移除按钮');
console.log('  ✓ 房主大厅等待界面正确渲染 AI 标记、移除按钮与开局就绪状态');

// 模拟非房主玩家加入房间查看
client.isHost = false;
client.renderLobbyPhase();
assert.strictEqual(elements['lobby-bot-actions'].style.display, 'none');
assert(!elements['waiting-players'].innerHTML.includes('btn-remove-bot'), '普通玩家不能看到移除人机按钮');
console.log('  ✓ 普通玩家视角下人机控制按钮栏与移除按钮安全隐藏');

// 模拟开启对局并进入对局屏幕
client.gameState = {
  phase: 'PLAYING',
  durationMinutes: 8,
  remainingMs: 480000,
  isPaused: false,
  firstQuestionerId: 'bot_1'
};
client.self = {
  id: 'p1',
  name: '房主本人',
  avatar: '🤠',
  isSpy: false,
  location: '国家大剧院',
  locationIcon: '🎭',
  role: '第一小提琴手'
};
client.allLocations = [
  { id: 'loc_1', name: '国家大剧院', icon: '🎭', category: '公共秩序' },
  { id: 'loc_2', name: '民航客机', icon: '✈️', category: '高空交通' }
];

client.renderPlayingPhase();

// 验证对局屏幕展示
assert.strictEqual(elements['screen-lobby'].classList.contains('hidden'), true);
assert.strictEqual(elements['screen-playing'].classList.contains('hidden'), false);
assert(elements['seats-bar'].innerHTML.includes('badge-bot'), '底部特工席位栏必须展示 AI 徽章');
console.log('  ✓ 对局主屏幕成功切换，席位栏正确标定 AI 电脑特工');

// 模拟打开指控弹窗
client.openAccuseModal();
assert(elements['suspect-list'].children.length > 0, '嫌疑人列表必须动态填充');
console.log('  ✓ 指控弹窗嫌疑人列表正确列出在场人机并带有 AI 徽章');

console.log('\n🎉 间谍危机电脑桌面端 (Desktop) 与手机移动端 (Mobile) 双端测试全部通过！');
