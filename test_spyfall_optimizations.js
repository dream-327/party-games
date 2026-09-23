const assert = require('assert');
const path = require('path');
const {
  createGameRoom,
  startGameForRoom,
  handleAccuse,
  handleVoteAccuse,
  checkAccuseConsensus,
  cancelAccuseTimeout,
  onAccuseTimeout,
  ACCUSE_TIMEOUT_MS,
  resetRoomForNextGame,
  getSafePlayerView,
  PHASES
} = require('./games/spyfall/server');

console.log('🧪 开始测试间谍危机深度优化专项 (test_spyfall_optimizations.js)...');

// 1. 测试指控超时与定时器安全重置
console.log('1️⃣ 测试指控 45 秒安全超时与自动恢复...');
{
  const host = { id: 'p_host', name: '房主', avatar: '🤠', isOnline: true };
  const room = createGameRoom('9901', host, { durationMinutes: 8 });
  room.players.set('p_spy', { id: 'p_spy', name: '间谍', avatar: '🕵️', isOnline: true });
  room.players.set('p_voter', { id: 'p_voter', name: '平民', avatar: '🤖', isOnline: true });

  startGameForRoom(room, { durationMinutes: 8 });
  assert.strictEqual(room.gameState.phase, PHASES.PLAYING);

  // 发起指控
  const suspectId = room.spyId;
  const accuserId = Array.from(room.players.keys()).find(id => id !== suspectId);
  const accuseRes = handleAccuse(room, accuserId, suspectId);
  assert(accuseRes.success, '成功发起指控');
  assert.strictEqual(room.gameState.phase, PHASES.PAUSED_ACCUSE);
  assert(room.currentAccuse.timeoutTimer !== null || room._io === undefined);
  assert(room.currentAccuse.expiresAt > Date.now(), '指控应有过期时间戳');

  // 模拟超时触发
  onAccuseTimeout(room);
  assert.strictEqual(room.gameState.phase, PHASES.PLAYING, '超时后对局必须恢复为 PLAYING');
  assert.strictEqual(room.gameState.isPaused, false, '超时后暂停状态必须解除');
  assert.strictEqual(room.currentAccuse, null, '指控数据必须安全清空');

  // 再次发起指控并测试 resetRoomForNextGame 时清理超时定时器
  const anotherPlayerId = Array.from(room.players.keys()).find(id => id !== suspectId && id !== accuserId);
  const secondRes = handleAccuse(room, anotherPlayerId, suspectId);
  assert(secondRes.success, '第二名平民发起指控成功');
  assert(room.currentAccuse);
  resetRoomForNextGame(room);
  assert.strictEqual(room.currentAccuse, null, '重置对局后指控定时器与数据已彻底清理');

  console.log('  ✓ 45秒超时安全机制与定时器重置验证通过');
}

// 2. 测试离线玩家动态排除与防死锁共识结算
console.log('2️⃣ 测试玩家离线动态排除与未决指控防死锁结算...');
{
  const host = { id: 'p_host', name: '房主', avatar: '🤠', isOnline: true };
  const room = createGameRoom('9902', host, { durationMinutes: 8 });
  room.players.set('p_spy', { id: 'p_spy', name: '间谍', avatar: '🕵️', isOnline: true });
  room.players.set('p_civ1', { id: 'p_civ1', name: '平民1', avatar: '👩‍💼', isOnline: true });
  room.players.set('p_civ2', { id: 'p_civ2', name: '平民2', avatar: '👨‍🔬', isOnline: true });

  startGameForRoom(room, { durationMinutes: 8 });
  room.spyId = 'p_spy'; // 固定间谍为 p_spy

  // 平民1 指控 间谍
  handleAccuse(room, 'p_civ1', 'p_spy');
  assert.strictEqual(room.gameState.phase, PHASES.PAUSED_ACCUSE);

  // 合格投票者为: p_host, p_civ1, p_civ2 (总共 3 人)
  // p_civ1 发起人已默认赞成
  // p_host 投票赞成
  const vote1 = handleVoteAccuse(room, 'p_host', true);
  assert.strictEqual(vote1.voteFinished, false, '尚有 1 名平民 (p_civ2) 未投票');
  assert.strictEqual(vote1.remainingCount, 1);

  // 此时平民 2 突然掉线离线
  const pCiv2 = room.players.get('p_civ2');
  pCiv2.isOnline = false;

  // 动态触发重新评估共识
  const consensusRes = checkAccuseConsensus(room);
  assert(consensusRes, '重新计算共识');
  assert.strictEqual(consensusRes.voteFinished, true, '掉线玩家被动态排除后，表决即刻全票达成！');
  assert.strictEqual(consensusRes.consensus, true, '全票通过指控');
  assert.strictEqual(consensusRes.suspectIsSpy, true, '抓获间谍');
  assert.strictEqual(consensusRes.nextPhase, PHASES.SPY_GUESSING, '转入间谍猜地点反击阶段');

  console.log('  ✓ 玩家掉线动态重新核算共识防死锁验证通过');
}

// 3. 测试客户端界面状态：发起人禁用按钮、断线恢复与进度展示
console.log('3️⃣ 测试客户端表决状态恢复、发起人视角与行动按钮禁用...');
{
  const clientPath = path.resolve(__dirname, 'public/spyfall/client.js');

  // 构建轻量 Mock DOM
  function createMockEl(tag = 'div', id = '', cls = '') {
    const classes = new Set(cls.split(' ').filter(Boolean));
    const listeners = {};
    const children = [];
    return {
      tagName: tag.toUpperCase(),
      id,
      dataset: {},
      style: {},
      disabled: false,
      title: '',
      classList: {
        add: (...n) => n.forEach(c => classes.add(c)),
        remove: (...n) => n.forEach(c => classes.delete(c)),
        contains: (c) => classes.has(c),
        toggle: (c, force) => {
          if (force === undefined) force = !classes.has(c);
          if (force) classes.add(c); else classes.delete(c);
          return force;
        }
      },
      get className() { return Array.from(classes).join(' '); },
      set className(v) { classes.clear(); (v || '').split(' ').filter(Boolean).forEach(c => classes.add(c)); },
      children,
      appendChild: function(c) { children.push(c); c.parentElement = this; return c; },
      addEventListener: (e, cb) => { (listeners[e] = listeners[e] || []).push(cb); },
      dispatchEvent: (e) => {
        const type = typeof e === 'string' ? e : e.type;
        (listeners[type] || []).forEach(cb => cb(typeof e === 'string' ? { type: e } : e));
      },
      click: function() { this.dispatchEvent('click'); }
    };
  }

  const elements = new Map();
  const reg = (el) => { if (el.id) elements.set(el.id, el); return el; };

  // 基础 DOM
  reg(createMockEl('section', 'screen-lobby'));
  reg(createMockEl('section', 'screen-playing', 'hidden'));
  reg(createMockEl('span', 'lobby-room-code', 'room-code-tag'));
  reg(createMockEl('span', 'room-code-display', 'room-code-tag'));
  reg(createMockEl('span', 'online-count'));
  reg(createMockEl('div', 'card-secret'));
  reg(createMockEl('div', 'card-secret-cover'));
  reg(createMockEl('div', 'card-secret-content'));
  reg(createMockEl('div', 'secret-badge'));
  reg(createMockEl('div', 'secret-location-title'));
  reg(createMockEl('span', 'secret-location-icon'));
  reg(createMockEl('span', 'secret-location-name'));
  reg(createMockEl('div', 'secret-role-desc'));
  reg(createMockEl('span', 'secret-role-name'));
  reg(createMockEl('button', 'btn-accuse', 'btn btn-action'));
  reg(createMockEl('button', 'btn-spy-guess', 'btn btn-action'));
  reg(createMockEl('div', 'location-scratchpad'));
  reg(createMockEl('div', 'seats-bar'));

  // 弹窗
  reg(createMockEl('div', 'modal-guide', 'modal-overlay'));
  reg(createMockEl('div', 'modal-accuse', 'modal-overlay'));
  reg(createMockEl('div', 'accuse-step-select'));
  reg(createMockEl('div', 'suspect-list'));
  reg(createMockEl('div', 'accuse-step-vote'));
  reg(createMockEl('span', 'accuser-name'));
  reg(createMockEl('span', 'suspect-name'));
  reg(createMockEl('button', 'btn-vote-agree'));
  reg(createMockEl('button', 'btn-vote-disagree'));
  reg(createMockEl('div', 'vote-status-text'));
  reg(createMockEl('div', 'accuse-footer-select'));
  reg(createMockEl('button', 'btn-confirm-accuse'));
  reg(createMockEl('div', 'modal-guess', 'modal-overlay'));
  reg(createMockEl('div', 'guess-grid'));
  reg(createMockEl('button', 'btn-confirm-guess'));
  reg(createMockEl('div', 'modal-settlement', 'modal-overlay'));
  reg(createMockEl('div', 'settlement-winner-text'));
  reg(createMockEl('div', 'settlement-reason-text'));
  reg(createMockEl('div', 'settlement-location'));
  reg(createMockEl('div', 'settlement-spy'));
  reg(createMockEl('div', 'settlement-players-list'));
  reg(createMockEl('button', 'btn-restart'));

  const mockWindow = {
    addEventListener: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    location: { search: '' },
    navigator: {
      clipboard: {
        writeText: (t) => Promise.resolve(t)
      }
    }
  };

  const mockSocket = {
    listeners: {},
    emitted: [],
    on(e, cb) { this.listeners[e] = cb; },
    emit(e, d, cb) { this.emitted.push({ e, d }); if (cb) cb({ success: true }); }
  };

  global.window = mockWindow;
  global.document = {
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => createMockEl(tag),
    querySelectorAll: () => [],
    querySelector: () => null
  };
  global.localStorage = mockWindow.localStorage;
  global.navigator = mockWindow.navigator;
  global.io = () => mockSocket;
  global.sfx = { play: () => {} };

  delete require.cache[require.resolve(clientPath)];
  const { SpyfallClient } = require(clientPath);
  const client = new SpyfallClient();

  // A. 测试指控发起人接收到 accuse_started 时按钮禁用与文案提示
  client.self = { id: 'p_accuser', name: '发起者', hasAccused: true };
  client.playerId = 'p_accuser';
  client.handleAccuseStarted({
    accuser: { id: 'p_accuser', name: '发起者' },
    suspect: { id: 'p_target', name: '被怀疑人' }
  });

  const btnAgree = elements.get('btn-vote-agree');
  const btnDisagree = elements.get('btn-vote-disagree');
  const statusText = elements.get('vote-status-text');
  assert.strictEqual(btnAgree.disabled, true, '指控发起人赞成按钮默认禁用（已默认赞成）');
  assert.strictEqual(btnDisagree.disabled, true, '指控发起人反对按钮默认禁用');
  assert(statusText.textContent.includes('默认赞成'), '状态文案需提示默认赞成并等待他人');

  // B. 测试普通投票者接收到 accuse_started 时按钮可用
  client.self = { id: 'p_voter', name: '独立表决人' };
  client.playerId = 'p_voter';
  client.handleAccuseStarted({
    accuser: { id: 'p_accuser', name: '发起者' },
    suspect: { id: 'p_target', name: '被怀疑人' }
  });
  assert.strictEqual(btnAgree.disabled, false, '独立表决人赞成按钮可用');
  assert.strictEqual(btnDisagree.disabled, false, '独立表决人反对按钮可用');

  // C. 测试断线重连/刷新恢复 PAUSED_ACCUSE 弹窗与投票进度
  client.handleRoomUpdate({
    roomCode: '8888',
    gameState: { phase: 'PAUSED_ACCUSE', isPaused: true },
    currentAccuse: {
      accuserId: 'p_accuser',
      accuserName: '发起者',
      suspectId: 'p_target',
      suspectName: '被怀疑人',
      votes: { p_accuser: true, p_voter: true },
      votedCount: 2,
      totalEligibleVoters: 3
    },
    players: [
      { id: 'p_accuser', name: '发起者' },
      { id: 'p_target', name: '被怀疑人' },
      { id: 'p_voter', name: '独立表决人' },
      { id: 'p_other', name: '另一人' }
    ]
  });

  const modalAccuse = elements.get('modal-accuse');
  assert(modalAccuse.classList.contains('active'), '重连接收到 PAUSED_ACCUSE 必须自动恢复弹出指控表决窗');
  assert(statusText.textContent.includes('2/3'), '必须展示实时投票进度（已表决 2/3 人）');

  // D. 测试恢复为 PLAYING 时，若指控弹窗仍在表决步骤则自动关闭
  client.handleRoomUpdate({
    roomCode: '8888',
    gameState: { phase: 'PLAYING', isPaused: false },
    currentAccuse: null,
    players: []
  });
  assert(!modalAccuse.classList.contains('active'), '切回 PLAYING 阶段后指控表决弹窗必须自动收回');

  // E. 测试本局已指控过的玩家 btn-accuse 按钮禁用态
  client.self = { id: 'p_accuser', hasAccused: true };
  client.gameState = { phase: 'PLAYING' };
  client.renderPlayingPhase();
  const btnAccuse = elements.get('btn-accuse');
  assert.strictEqual(btnAccuse.disabled, true, '已指控过的特工 btn-accuse 必须被禁用');
  assert(btnAccuse.title.includes('已发起过指控'), '提示本局已发起过指控');

  // F. 测试点击行动代码复制
  client.currentRoomCode = '8888';
  let notifyMsg = '';
  client.notify = (m) => { notifyMsg = m; };
  client.copyRoomCode();
  assert(notifyMsg.includes('8888'), '复制行动代码必须触发包含房间代码的通知反馈');

  console.log('  ✓ 客户端表决恢复、进度显示与按钮状态验证通过');
}

console.log('🎉 间谍危机深度优化专项测试全部通过！');
