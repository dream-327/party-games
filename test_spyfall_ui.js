const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 开始测试间谍危机移动端 UI 与音效模块...');

const htmlPath = path.join(__dirname, 'public', 'spyfall', 'index.html');
const cssPath = path.join(__dirname, 'public', 'spyfall', 'style.css');
const sfxPath = path.join(__dirname, 'public', 'spyfall', 'sfx.js');

// 1. 验证必要文件存在
assert(fs.existsSync(htmlPath), 'public/spyfall/index.html 文件必须存在');
assert(fs.existsSync(cssPath), 'public/spyfall/style.css 文件必须存在');
assert(fs.existsSync(sfxPath), 'public/spyfall/sfx.js 文件必须存在');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const cssContent = fs.readFileSync(cssPath, 'utf8');

// 2. 验证 HTML 基础结构与视口配置
assert(
  htmlContent.includes('width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'),
  'HTML 必须配置严格的移动端防缩放 meta viewport 属性'
);
assert(htmlContent.includes('/socket.io/socket.io.js'), 'HTML 必须引入 socket.io.js');
assert(htmlContent.includes('sfx.js'), 'HTML 必须引入 sfx.js');
assert(htmlContent.includes('client.js'), 'HTML 必须引入 client.js');
assert(htmlContent.includes('style.css'), 'HTML 必须引入 style.css');

// 3. 验证主要屏幕容器
assert(htmlContent.includes('id="screen-lobby"'), '必须包含大厅屏幕容器 #screen-lobby');
assert(htmlContent.includes('id="screen-playing"'), '必须包含对局屏幕容器 #screen-playing');

// 4. 验证大厅核心元素
assert(
  htmlContent.includes('id="avatar-selector"') || htmlContent.includes('id="lobby-avatar-grid"'),
  '大厅必须包含头像选择器 (#avatar-selector 或 #lobby-avatar-grid)'
);
assert(
  htmlContent.includes('id="input-name"') || htmlContent.includes('id="input-player-name"'),
  '大厅必须包含玩家昵称输入框 (#input-name 或 #input-player-name)'
);
assert(htmlContent.includes('id="input-room-code"'), '大厅必须包含房间号输入框 #input-room-code');
assert(htmlContent.includes('id="btn-create-room"'), '大厅必须包含创建房间按钮 #btn-create-room');
assert(htmlContent.includes('id="btn-join-room"'), '大厅必须包含加入房间按钮 #btn-join-room');
assert(
  htmlContent.includes('id="select-duration"') || htmlContent.includes('duration-option'),
  '大厅必须包含对局时长配置选择器 (5/8/10/12分钟)'
);
assert(
  htmlContent.includes('5') && htmlContent.includes('8') && htmlContent.includes('10') && htmlContent.includes('12'),
  '时长配置必须提供 5, 8, 10, 12 分钟选项'
);
assert(
  htmlContent.includes('id="waiting-players"') || htmlContent.includes('id="lobby-player-list"'),
  '大厅必须包含等待玩家列表容器 (#waiting-players 或 #lobby-player-list)'
);
assert(htmlContent.includes('id="btn-start-game"'), '大厅必须包含房主开始游戏按钮 #btn-start-game');
assert(
  htmlContent.includes('id="btn-share"') || htmlContent.includes('id="btn-share-room"'),
  '大厅必须包含二维码/房间分享按钮 (#btn-share 或 #btn-share-room)'
);

// 5. 验证游戏对局界面核心元素
assert(
  htmlContent.includes('id="room-code-display"') || htmlContent.includes('id="display-room-code"'),
  '对局界面必须展示房间代码 (#room-code-display 或 #display-room-code)'
);
assert(htmlContent.includes('id="online-count"'), '对局界面必须展示在线人数 #online-count');
assert(htmlContent.includes('id="btn-wakelock"'), '对局界面必须包含屏幕常亮开关 #btn-wakelock');
assert(htmlContent.includes('id="btn-guide"'), '对局界面必须包含玩法指南按钮 #btn-guide');
assert(htmlContent.includes('id="timer-display"'), '对局界面必须包含大字体数字倒计时 #timer-display');
assert(htmlContent.includes('id="timer-badge"'), '对局界面必须包含倒计时状态/暂停标记 #timer-badge');

// 验证绝密身份卡 (Hold-to-Reveal Card)
assert(htmlContent.includes('id="card-secret"'), '必须包含防偷窥身份卡 #card-secret');
assert(htmlContent.includes('按住查看绝密身份'), '身份卡遮罩层必须标明“按住查看绝密身份”');
assert(
  htmlContent.includes('id="card-secret-cover"') || htmlContent.includes('class="card-secret-cover"'),
  '身份卡必须具备遮罩保护层 (#card-secret-cover 或 .card-secret-cover)'
);
assert(
  htmlContent.includes('id="card-secret-content"') || htmlContent.includes('class="card-secret-content"'),
  '身份卡必须具备脱敏内容呈现层 (#card-secret-content 或 .card-secret-content)'
);

// 验证操作按钮
assert(htmlContent.includes('id="btn-spy-guess"'), '必须包含间谍自曝指认按钮 #btn-spy-guess');
assert(htmlContent.includes('id="btn-accuse"'), '必须包含平民发起指控按钮 #btn-accuse');

// 验证候选排查板与座位栏
assert(htmlContent.includes('id="location-scratchpad"'), '必须包含候选地点排查板 #location-scratchpad');
assert(htmlContent.includes('id="seats-bar"'), '必须包含玩家座位轮播/展示栏 #seats-bar');

// 6. 验证弹窗系统
assert(htmlContent.includes('id="modal-guide"'), '必须包含新手向导与提问技巧弹窗 #modal-guide');
assert(htmlContent.includes('平民') && htmlContent.includes('间谍'), '向导弹窗必须涵盖平民与间谍指导');
assert(
  htmlContent.includes('技巧') || htmlContent.includes('话术') || htmlContent.includes('问答'),
  '向导弹窗必须涵盖提问技巧与示范'
);

assert(htmlContent.includes('id="modal-accuse"'), '必须包含指控与表决弹窗 #modal-accuse');
assert(
  htmlContent.includes('id="btn-vote-agree"') && htmlContent.includes('id="btn-vote-disagree"'),
  '指控弹窗必须包含赞成与反对表决按钮 (#btn-vote-agree, #btn-vote-disagree)'
);

assert(htmlContent.includes('id="modal-guess"'), '必须包含间谍指认地点网格弹窗 #modal-guess');
assert(htmlContent.includes('id="modal-settlement"'), '必须包含结算复盘弹窗 #modal-settlement');
assert(
  htmlContent.includes('id="btn-restart"') || htmlContent.includes('id="btn-play-again"'),
  '结算弹窗必须包含再来一局重开按钮 (#btn-restart 或 #btn-play-again)'
);

// 7. 验证 CSS 主题色值、排查板状态与响应式
assert(cssContent.includes('#0b0f19'), 'CSS 必须应用特工暗黑主色调 #0b0f19');
assert(cssContent.includes('#f59e0b'), 'CSS 必须应用特工琥珀高亮色 #f59e0b');
assert(cssContent.includes('#ef4444'), 'CSS 必须应用警报绯红色 #ef4444');
assert(cssContent.includes('#06b6d4'), 'CSS 必须应用科技青色 #06b6d4');

assert(cssContent.includes('.location-card'), 'CSS 必须包含地点卡片样式 .location-card');
assert(cssContent.includes('.state-normal'), 'CSS 必须包含地点卡片正常状态 .state-normal');
assert(cssContent.includes('.state-strikethrough'), 'CSS 必须包含地点卡片划线排除状态 .state-strikethrough');
assert(cssContent.includes('.state-starred'), 'CSS 必须包含地点卡片标星重点状态 .state-starred');

assert(cssContent.includes('@keyframes'), 'CSS 必须包含动画关键帧 (例如脉冲/呼吸效果)');
assert(cssContent.includes('@media'), 'CSS 必须包含移动端响应式媒体查询');

// 8. 验证 SFX 纯原生 Web Audio 引擎
delete require.cache[require.resolve(sfxPath)];

// 模拟 Web Audio API 环境
let createdNodes = 0;
class MockAudioNode {
  constructor() {
    this.gain = {
      setValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      linearRampToValueAtTime: () => {}
    };
    this.frequency = {
      setValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      linearRampToValueAtTime: () => {}
    };
  }
  connect() { return this; }
  start() {}
  stop() {}
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = new MockAudioNode();
  }
  createOscillator() {
    createdNodes++;
    return new MockAudioNode();
  }
  createGain() {
    createdNodes++;
    return new MockAudioNode();
  }
  resume() {
    this.state = 'running';
  }
}

global.AudioContext = MockAudioContext;
global.window = {
  AudioContext: MockAudioContext,
  webkitAudioContext: MockAudioContext,
  navigator: {
    vibrate: () => true
  }
};

const sfxModule = require(sfxPath);
const sfxInstance = (sfxModule && sfxModule.sfx) || global.window.sfx;
assert(sfxInstance, 'sfx.js 必须暴露 sfx 实例 (window.sfx 或 module.exports.sfx)');
assert(typeof sfxInstance.play === 'function', 'sfx 实例必须支持 play(soundName) 方法');

// 验证五大指定核心音效
const requiredSounds = ['tick', 'card', 'alarm', 'victory', 'defeat'];
requiredSounds.forEach(sound => {
  createdNodes = 0;
  assert.doesNotThrow(() => {
    sfxInstance.play(sound);
  }, `播放音效 [${sound}] 出现异常`);
  assert(createdNodes > 0, `播放音效 [${sound}] 必须调用 Web Audio API 节点进行物理合成`);
});

console.log('✅ 间谍危机移动端 UI 与音效模块验证全部通过！');
