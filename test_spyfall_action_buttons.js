const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 开始测试间谍危机核心行动按钮专项 (test_spyfall_action_buttons.js)...');

const htmlContent = fs.readFileSync(path.join(__dirname, 'public/spyfall/index.html'), 'utf-8');
const cssContent = fs.readFileSync(path.join(__dirname, 'public/spyfall/style.css'), 'utf-8');
const clientPath = path.join(__dirname, 'public/spyfall/client.js');

// 1. 验证 HTML 中核心行动按钮与模态弹窗结构
console.log('1️⃣ 验证 HTML 结构中核心行动按钮与模态弹窗 ID...');
assert(htmlContent.includes('id="btn-spy-guess"'), 'HTML 必须包含自曝猜地点按钮 #btn-spy-guess');
assert(htmlContent.includes('id="btn-accuse"'), 'HTML 必须包含发起指控按钮 #btn-accuse');
assert(htmlContent.includes('id="modal-accuse"'), 'HTML 必须包含指控弹窗 #modal-accuse');
assert(htmlContent.includes('id="modal-guess"'), 'HTML 必须包含猜地点弹窗 #modal-guess');
assert(htmlContent.includes('id="suspect-list"'), 'HTML 必须包含嫌疑人选项容器 #suspect-list');
assert(htmlContent.includes('id="guess-grid"'), 'HTML 必须包含地点选项容器 #guess-grid');
console.log('  ✓ HTML 结构与行动按钮 ID 完备');

// 2. 验证 CSS 样式中的指针事件、Toast 提示及模态弹窗展示规范
console.log('2️⃣ 验证 CSS 模态弹窗 pointer-events、Toast 及 GPU 优化规范...');
assert(cssContent.includes('.modal-overlay {'), 'CSS 必须包含 .modal-overlay 规则');
assert(cssContent.includes('pointer-events: none;'), '未激活状态下的 .modal-overlay 必须设置 pointer-events: none 防止点击穿透阻断');
assert(cssContent.includes('.modal-overlay.active {'), 'CSS 必须包含 .modal-overlay.active 规则');
assert(cssContent.includes('pointer-events: auto;'), '激活状态下的 .modal-overlay.active 必须设置 pointer-events: auto 恢复交互');
assert(cssContent.includes('.spyfall-toast'), 'CSS 必须包含 .spyfall-toast 轻量悬浮提示样式');
assert(cssContent.includes('.spyfall-toast.show'), 'CSS 必须包含 .spyfall-toast.show 激活状态');

// 验证 .modal-dialog 没有被 backface-visibility: hidden 错误施加导致合成层隐匿
const gpuSection = cssContent.slice(cssContent.indexOf('Performance Optimization'));
assert(!gpuSection.includes('.modal-dialog,\n  backface-visibility: hidden'), '不得对 .modal-dialog 施加 backface-visibility: hidden');
console.log('  ✓ CSS 样式与全端交互规范验证通过');

// 3. 验证 Client.js 在只读 dataset getter 浏览器原生环境下不报错
console.log('3️⃣ 模拟浏览器原生只读 dataset 运行环境，验证行动按钮无阻碍唤起...');

// 构造模拟具有真实浏览器 HTMLElement 特征的对象（严格只读 dataset getter，禁止覆盖 dataset）
function createBrowserMockElement(tag, id = '', className = '') {
  const classes = new Set((className || '').split(/\s+/).filter(Boolean));
  const listeners = {};
  const children = [];
  const datasetStore = {};

  const elem = {
    tagName: tag.toUpperCase(),
    id,
    className,
    style: {},
    children,
    parentElement: null,
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
    addEventListener(evt, cb) {
      (listeners[evt] = listeners[evt] || []).push(cb);
    },
    removeEventListener(evt, cb) {
      if (!listeners[evt]) return;
      listeners[evt] = listeners[evt].filter(f => f !== cb);
    },
    dispatchEvent(event) {
      const cbs = listeners[event.type] || [];
      cbs.forEach(cb => cb(event));
    },
    click() {
      this.dispatchEvent({ type: 'click', target: this });
    },
    appendChild(child) {
      children.push(child);
      child.parentElement = this;
      return child;
    },
    querySelector(sel) {
      if (sel.includes('data-close')) {
        return children.find(c => c.dataset && c.dataset.close) || null;
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    setAttribute(key, val) {
      if (key.startsWith('data-')) {
        const camel = key.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
        datasetStore[camel] = String(val);
      }
    }
  };

  // 关键：模拟现代浏览器标准 DOMStringMap getter，尝试赋值直接抛 TypeError！
  Object.defineProperty(elem, 'dataset', {
    get() {
      return datasetStore;
    },
    set(v) {
      throw new TypeError("Cannot set property dataset of #<HTMLElement> which has only a getter");
    },
    configurable: false,
    enumerable: true
  });

  return elem;
}

const elementsMap = new Map();
function reg(el) {
  if (el.id) elementsMap.set(el.id, el);
  return el;
}

const mockDoc = {
  getElementById: (id) => {
    if (elementsMap.has(id)) return elementsMap.get(id);
    const findInTree = (node) => {
      if (!node) return null;
      if (node.id === id) return node;
      if (node.children) {
        for (const c of node.children) {
          const res = findInTree(c);
          if (res) return res;
        }
      }
      return null;
    };
    return findInTree(mockDoc.body);
  },
  createElement: (tag) => createBrowserMockElement(tag),
  querySelectorAll: () => [],
  addEventListener: () => {},
  body: createBrowserMockElement('body')
};

// 预热注册必要元素
reg(createBrowserMockElement('div', 'screen-lobby', 'screen'));
reg(createBrowserMockElement('section', 'screen-playing', 'screen hidden'));
reg(createBrowserMockElement('button', 'btn-accuse', 'btn btn-action'));
reg(createBrowserMockElement('button', 'btn-spy-guess', 'btn btn-action'));
reg(createBrowserMockElement('div', 'modal-accuse', 'modal-overlay'));
reg(createBrowserMockElement('div', 'accuse-step-select'));
reg(createBrowserMockElement('div', 'suspect-list'));
reg(createBrowserMockElement('div', 'accuse-step-vote'));
reg(createBrowserMockElement('div', 'accuse-footer-select'));
reg(createBrowserMockElement('button', 'btn-confirm-accuse'));
reg(createBrowserMockElement('div', 'modal-guess', 'modal-overlay'));
reg(createBrowserMockElement('div', 'guess-grid'));
reg(createBrowserMockElement('button', 'btn-confirm-guess'));
reg(createBrowserMockElement('div', 'location-scratchpad'));
reg(createBrowserMockElement('div', 'seats-bar'));
reg(createBrowserMockElement('div', 'card-secret'));

// 全局注入模拟浏览器
global.document = mockDoc;
global.window = {
  document: mockDoc,
  localStorage: { getItem: () => null, setItem: () => {} },
  addEventListener: () => {},
  spyfallSfx: { play: () => {}, initAudio: () => {} }
};

delete require.cache[require.resolve(clientPath)];
const { SpyfallClient } = require(clientPath);
const client = new SpyfallClient();

// 模拟进入对局
client.handleRoomUpdate({
  roomCode: '8888',
  self: { id: 'p1', name: '平民玩家', isSpy: false, isHost: true, hasAccused: false },
  players: [
    { id: 'p1', name: '平民玩家', avatar: '🤠', isHost: true, isOnline: true },
    { id: 'p2', name: '第二玩家', avatar: '🕵️', isHost: false, isOnline: true },
    { id: 'p3', name: '第三玩家', avatar: '🤖', isHost: false, isOnline: true }
  ],
  allLocations: [
    { id: 'loc1', name: '综合医院', icon: '🏥' },
    { id: 'loc2', name: '银行金库', icon: '🏦' }
  ],
  gameState: { phase: 'PLAYING' }
});

// A. 测试点击发起指控
console.log('Testing: 点击 #btn-accuse 打开指控弹窗...');
const btnAccuse = elementsMap.get('btn-accuse');
const modalAccuse = elementsMap.get('modal-accuse');
assert(!modalAccuse.classList.contains('active'), '初始状态弹窗不得为 active');

btnAccuse.click();
assert(modalAccuse.classList.contains('active'), '点击发起指控后 #modal-accuse 必须包含 .active 类');
const suspectList = elementsMap.get('suspect-list');
assert.strictEqual(suspectList.children.length, 2, '指控嫌疑人列表中必须包含其余 2 位特工');
console.log('  ✓ 发起指控成功打开弹窗，且未触发只读 dataset 异常');

// B. 测试平民点击自曝猜地点触发优雅 Toast 提示
console.log('Testing: 平民点击 #btn-spy-guess 触发 Toast 提示...');
const btnSpyGuess = elementsMap.get('btn-spy-guess');
const modalGuess = elementsMap.get('modal-guess');
btnSpyGuess.click();
assert(!modalGuess.classList.contains('active'), '平民玩家不得打开间谍猜地点弹窗');
const toast = elementsMap.get('spyfall-toast') || mockDoc.getElementById('spyfall-toast');
assert(toast, '必须动态生成并展示 #spyfall-toast 提示浮层');
assert.strictEqual(toast.textContent, '只有间谍可以自曝指认地点！', 'Toast 提示文本必须明确告知身份限制');
assert(toast.classList.contains('show'), 'Toast 提示浮层必须添加 .show 类展示');
console.log('  ✓ 平民点击自曝猜地点优雅提示验证通过');

// C. 测试间谍身份下点击自曝猜地点成功打开指认地点网格
console.log('Testing: 间谍身份下点击 #btn-spy-guess 打开指认网格弹窗...');
client.self.isSpy = true;
btnSpyGuess.click();
assert(modalGuess.classList.contains('active'), '间谍玩家点击后 #modal-guess 必须包含 .active 类');
const guessGrid = elementsMap.get('guess-grid');
assert.strictEqual(guessGrid.children.length, 2, '间谍猜地点候选网格必须成功渲染所有候选地点');
console.log('  ✓ 间谍自曝猜地点成功唤起指认弹窗');

console.log('\n🎉 间谍危机核心行动按钮专项测试全部通过！');
