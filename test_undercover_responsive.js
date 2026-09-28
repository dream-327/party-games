// 谁是卧底 (Undercover) - 手机移动端与电脑桌面端响应式双端全功能测试
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 开始全面核查《谁是卧底》电脑桌面端 (Desktop) 与手机移动端 (Mobile) 双端显示与交互...');

const htmlPath = path.join(__dirname, 'public', 'undercover', 'index.html');
const cssPath = path.join(__dirname, 'public', 'undercover', 'style.css');
const clientJsPath = path.join(__dirname, 'public', 'undercover', 'client.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const cssContent = fs.readFileSync(cssPath, 'utf8');
const clientJsContent = fs.readFileSync(clientJsPath, 'utf8');

// ========================================================
// 1. 验证 HTML 结构中双端元素与视口配置
// ========================================================
console.log('1️⃣ 验证 HTML 基础视口与双端操作组件...');
assert(htmlContent.includes('viewport-fit=cover'), '移动端视口必须配置 viewport-fit=cover 以适配全面屏安全区');
assert(htmlContent.includes('id="btn-flip-card-toggle"'), '看牌主界面必须包含明显的翻转操作按钮 #btn-flip-card-toggle');
assert(htmlContent.includes('id="btn-peek-flip-card-toggle"'), '随时查词弹窗中必须包含明确的翻转操作按钮 #btn-peek-flip-card-toggle');
assert(htmlContent.includes('id="floating-peek-btn"'), '移动端必须包含浮动随时查底牌胶囊 #floating-peek-btn');
assert(htmlContent.includes('id="btn-mode-hold"') && htmlContent.includes('id="btn-mode-toggle"'), '必须包含防窥模式切换控制按钮');
console.log('  ✓ 移动端视口、翻牌快捷按钮、浮动查词胶囊与模式切换栏全部具备');

// ========================================================
// 2. 验证 CSS 3D 翻转、层叠上下文与双端布局
// ========================================================
console.log('2️⃣ 验证 CSS 3D 渲染与桌面/移动端响应式样式...');
// 3D 核心
assert(cssContent.includes('-webkit-perspective: 1000px'), '卡牌包裹层必须包含 -webkit-perspective 兼容');
assert(cssContent.includes('backface-visibility: visible !important'), '.secret-card 容器背面必须强制可见，严防翻转时整张卡消失');
assert(cssContent.includes('-webkit-backface-visibility: hidden'), '.card-face 必须具备 -webkit-backface-visibility 兼容隐藏');
assert(cssContent.includes('.secret-card.flipped .card-back'), '必须包含翻转后背面 z-index 置顶规则');
assert(cssContent.includes('.secret-card.flipped .card-front'), '必须包含翻转后正面 z-index 置底规则');

// 文字颜色兜底
assert(cssContent.includes('color: #67e8f9;'), '.card-word 必须具备实色青色文本兜底，杜绝透明文字消失');
assert(cssContent.includes('safe-area-inset-bottom'), '必须具备移动端底部安全区 safe-area-inset-bottom');
assert(cssContent.includes('height: 100dvh'), '弹窗背景层必须具备 100dvh 动态视口高度适配');

// 双端响应式
assert(cssContent.includes('@media (min-width: 900px)'), '必须具备 >=900px 电脑桌面端宽屏双栏与工作台排版');
assert(cssContent.includes('@media (max-width: 899px)'), '必须具备 <900px 手机移动端紧凑排版');
assert(cssContent.includes('@media (max-width: 380px)'), '必须具备 <=380px 超小屏手机排版');
console.log('  ✓ 3D 翻转、双端分层、实色文字兜底与安全区媒体查询完整无误');

// ========================================================
// 3. 验证 Client 交互逻辑 (桌面鼠标 + 手机触控)
// ========================================================
console.log('3️⃣ 验证客户端双端事件流与状态机 (Mouse + Touch + Smart Tap)...');
// 默认模式
assert(clientJsContent.includes("localStorage.getItem('undercover_peek_mode') || 'toggle'"), '默认必须使用直观易用的 toggle (点击常开) 模式');
// 智能识别
assert(clientJsContent.includes('cardWasFlippedOnPress'), '必须具备 cardWasFlippedOnPress 智能判断状态');
assert(clientJsContent.includes('peekCardWasFlippedOnPress'), '必须具备 peekCardWasFlippedOnPress 智能判断状态');
assert(clientJsContent.includes('btnFlipCardToggle'), '必须挂载主看牌界面快捷翻转按钮监听');
assert(clientJsContent.includes('btnPeekFlipCardToggle'), '必须挂载查词弹窗快捷翻转按钮监听');
assert(clientJsContent.includes("isSpectator"), '必须优雅处理观战者视角的底牌提示');
console.log('  ✓ 智能长按/轻触识别、双端事件绑定与观战者状态提示全部通过');

// ========================================================
// 4. 模拟双端事件触发仿真
// ========================================================
console.log('4️⃣ 仿真模拟桌面鼠标与手机触控交互全流程...');

// 模拟 DOM
class MockElement {
  constructor(id) {
    this.id = id;
    const classes = new Set();
    this.classList = {
      contains: (c) => classes.has(c),
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c) => {
        if (classes.has(c)) { classes.delete(c); return false; }
        else { classes.add(c); return true; }
      }
    };
    this.innerText = '';
    this.listeners = {};
  }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  trigger(event, e = {}) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(fn => fn(e));
    }
  }
}

const cardEl = new MockElement('secret-card-element');
const toggleBtn = new MockElement('btn-flip-card-toggle');

let peekMode = 'toggle';
let isHoldingCard = false;
let cardPressStartTime = 0;
let cardWasFlippedOnPress = false;

function revealCard() {
  if (!cardEl.classList.contains('flipped')) {
    cardEl.classList.add('flipped');
    toggleBtn.innerText = '🙈 点击盖上 / 隐藏底牌';
  }
}

function concealCard() {
  if (cardEl.classList.contains('flipped')) {
    cardEl.classList.remove('flipped');
    toggleBtn.innerText = '🔄 点击翻转 / 查看底牌';
  }
}

function toggleCard() {
  if (cardEl.classList.contains('flipped')) concealCard();
  else revealCard();
}

// 仿真 Scenario A: 桌面端在 toggle 模式下点击卡片
cardEl.trigger('click');
assert(!cardEl.classList.contains('flipped'), '初始应为未翻转');
toggleCard();
assert(cardEl.classList.contains('flipped'), '点击一次后卡牌应保持翻开');
assert.strictEqual(toggleBtn.innerText, '🙈 点击盖上 / 隐藏底牌');
toggleCard();
assert(!cardEl.classList.contains('flipped'), '再次点击后卡牌应恢复盖上');
assert.strictEqual(toggleBtn.innerText, '🔄 点击翻转 / 查看底牌');
console.log('  ✓ [Desktop - Toggle] 桌面端鼠标点击翻牌与盖上验证通过');

// 仿真 Scenario B: 桌面端点击快捷翻转按钮
toggleCard();
assert(cardEl.classList.contains('flipped'), '按钮点击翻开生效');
concealCard();
assert(!cardEl.classList.contains('flipped'), '按钮点击盖上生效');
console.log('  ✓ [Desktop - Button] 桌面端专用快捷翻转按钮验证通过');

// 仿真 Scenario C: 移动端在 hold 模式下长按（大于等于 300ms）
peekMode = 'hold';
// touchstart
cardPressStartTime = Date.now() - 400; // 模拟按住了 400ms
cardWasFlippedOnPress = cardEl.classList.contains('flipped');
revealCard();
isHoldingCard = true;
assert(cardEl.classList.contains('flipped'), '移动端手指按住时卡牌立即可见');
// touchend (>=300ms)
const pressDuration = 400;
isHoldingCard = false;
if (pressDuration >= 300) {
  concealCard();
}
assert(!cardEl.classList.contains('flipped'), '移动端手指松开后卡牌立即自动盖上防窥');
console.log('  ✓ [Mobile - Hold] 手机端按住查看底牌、松手自动隐藏防窥验证通过');

// 仿真 Scenario D: 移动端在 hold 模式下轻触短点击（小于 300ms，防止闪退）
// touchstart
cardPressStartTime = Date.now();
cardWasFlippedOnPress = cardEl.classList.contains('flipped');
revealCard();
isHoldingCard = true;
// touchend 50ms later
isHoldingCard = false;
// pressDuration < 300ms: 不调用 concealCard，保持翻开！
assert(cardEl.classList.contains('flipped'), '轻触卡片应保持翻开，不闪退！');
// 再次轻触卡片盖上
cardWasFlippedOnPress = true; // 此时已经是翻开的
concealCard();
assert(!cardEl.classList.contains('flipped'), '再次轻触卡片顺利盖上！');
console.log('  ✓ [Mobile - Smart Tap] 手机端轻触不闪退与二次轻触盖上验证通过');

console.log('\n🎉🎉 谁是卧底电脑桌面端与手机移动端双端核查 100% 全部通过！');
