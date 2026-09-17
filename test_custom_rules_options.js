const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const assert = require('assert');
const { setupUndercover } = require('./games/undercover/server');

console.log('====================================================');
console.log('🧪 谁是卧底：房主自定义规则维度深度集成测试');
console.log('====================================================\n');

async function runCustomRulesTest() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  setupUndercover(io, app);

  const PORT = 3998;
  await new Promise(r => server.listen(PORT, r));

  const url = `http://127.0.0.1:${PORT}/undercover`;
  const sockets = [];
  const clientStates = {};

  function connectClient(name, id) {
    return new Promise((resolve) => {
      const s = Client(url, { reconnection: false, forceNew: true });
      s.on('room_update', d => { clientStates[id] = d; });
      s.on('connect', () => resolve(s));
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  try {
    const s1 = await connectClient('房主', 'p1');
    const s2 = await connectClient('玩家2', 'p2');
    const s3 = await connectClient('玩家3', 'p3');
    const s4 = await connectClient('玩家4', 'p4');
    sockets.push(s1, s2, s3, s4);

    let hostRoomData = null;
    s1.on('room_update', d => { hostRoomData = d; });

    // 1. 创建房间并传入全量自定义规则
    console.log('[测试 1] 携带全量自定义规则创建房间');
    const createRes = await new Promise(r => {
      s1.emit('create_room', {
        player: { id: 'p1', name: '房主' },
        settings: {
          undercoverCount: 1,
          whiteboardCount: 0,
          speechTimeLimit: 60,
          voteTimeLimit: 45,
          speechOrderMode: 'seat',
          revealRoleOnEliminate: false,
          allowGuessWord: false,
          enablePunishment: false
        }
      }, r);
    });

    assert.strictEqual(createRes.success, true);
    const code = createRes.roomCode;
    await sleep(50);

    assert.strictEqual(hostRoomData.settings.voteTimeLimit, 45, '投票倒计时应为 45 秒');
    assert.strictEqual(hostRoomData.settings.speechOrderMode, 'seat', '发言次序模式应为 seat');
    assert.strictEqual(hostRoomData.settings.revealRoleOnEliminate, false, '应为暗牌模式');
    assert.strictEqual(hostRoomData.settings.allowGuessWord, false, '应禁用猜词');
    assert.strictEqual(hostRoomData.settings.enablePunishment, false, '应禁用惩罚卡');
    console.log('  ✅ 房主预设规则成功生效！');

    // 2. 加入玩家
    await new Promise(r => s2.emit('join_room', { roomCode: code, player: { id: 'p2', name: '玩家2' } }, r));
    await new Promise(r => s3.emit('join_room', { roomCode: code, player: { id: 'p3', name: '玩家3' } }, r));
    await new Promise(r => s4.emit('join_room', { roomCode: code, player: { id: 'p4', name: '玩家4' } }, r));
    await sleep(50);

    // 3. update_settings 校验
    console.log('[测试 2] 房主在房间大厅动态调整规则');
    s1.emit('update_settings', {
      voteTimeLimit: 30,
      revealRoleOnEliminate: false
    });
    await sleep(50);
    assert.strictEqual(hostRoomData.settings.voteTimeLimit, 30, '动态调整后投票倒计时应为 30 秒');
    console.log('  ✅ 房间大厅动态调整规则成功！');

    // 4. 开始游戏并验证顺时针固定轮转 (seat)
    console.log('[测试 3] 验证顺时针固定轮转 (seat order)');
    s1.emit('start_game');
    await sleep(100);

    // 跳过看牌进入发言
    s1.emit('force_start_speaking');
    await sleep(100);

    assert.strictEqual(hostRoomData.gameState.phase, 'SPEAKING');
    const order = hostRoomData.gameState.speakingOrder;
    // 座位顺序应该是 p1, p2, p3, p4
    assert.deepStrictEqual(order, ['p1', 'p2', 'p3', 'p4'], '顺时针轮转模式下发言顺序应与座次严格一致');
    console.log('  ✅ 顺时针固定轮转与座次严格一致: ' + JSON.stringify(order));

    // 5. 房主一键开投，测试投票限时与暗牌+禁用猜词直接淘汰
    console.log('[测试 4] 测试投票阶段与禁用猜词(纯粹淘汰)+暗牌模式');
    s1.emit('force_start_voting');
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.phase, 'VOTING');

    // 找到卧底是谁
    let undercoverId = null;
    [s1, s2, s3, s4].forEach((s, idx) => {
      const pid = `p${idx + 1}`;
      if (clientStates[pid] && clientStates[pid].myPlayer && clientStates[pid].myPlayer.role === 'UNDERCOVER') {
        undercoverId = pid;
      }
    });

    console.log(`  🔍 卧底玩家为: ${undercoverId}`);

    // 全员投票给卧底
    s1.emit('cast_vote', { roomCode: code, playerId: 'p1', targetId: undercoverId });
    s2.emit('cast_vote', { roomCode: code, playerId: 'p2', targetId: undercoverId });
    s3.emit('cast_vote', { roomCode: code, playerId: 'p3', targetId: undercoverId });
    s4.emit('cast_vote', { roomCode: code, playerId: 'p4', targetId: undercoverId });
    await sleep(1500);

    // 此时因为 allowGuessWord: false，卧底出局不进入 GUESS_WORD，而是直接进入 ELIMINATION！
    assert.strictEqual(hostRoomData.gameState.phase, 'ELIMINATION', '禁用猜词时卧底出局直接进入 ELIMINATION，跳过 GUESS_WORD');
    console.log('  ✅ 禁用猜词：直接淘汰进入 ELIMINATION，未进入 GUESS_WORD！');

    // 等待 2.5 秒结算
    await sleep(2600);
    assert.strictEqual(hostRoomData.gameState.phase, 'GAME_OVER', '淘汰展示完毕后进入 GAME_OVER');
    assert.strictEqual(hostRoomData.gameState.winner, 'CIVILIAN', '平民应获胜');
    assert.strictEqual(hostRoomData.gameState.punishment, null, '关闭惩罚卡时 punishment 应为 null');
    console.log('  ✅ 关闭惩罚：punishment 为 null，不展示惩罚卡！');

    // 6. 暗牌模式单独验证 (非最后一轮淘汰时身份是否保密)
    console.log('[测试 5] 暗牌保密机制验证 (多玩家存活时出局保密)');
    // 房主重置回大厅
    s1.emit('restart_game');
    await sleep(200);
    assert.strictEqual(hostRoomData.gameState.phase, 'LOBBY');

    // 重新开启一局，投出一个平民，验证 elim.isSecret 与 role: null
    s1.emit('start_game');
    await sleep(200);
    s1.emit('force_start_speaking', { roomCode: code, playerId: 'p1' });
    await sleep(200);
    s1.emit('force_start_voting', { roomCode: code, playerId: 'p1' });
    await sleep(200);

    let civilianId = null;
    [s1, s2, s3, s4].forEach((s, idx) => {
      const pid = `p${idx + 1}`;
      if (clientStates[pid] && clientStates[pid].myPlayer && clientStates[pid].myPlayer.role === 'CIVILIAN') {
        civilianId = pid;
      }
    });
    console.log(`  🔍 投出平民: ${civilianId}`);

    s1.emit('cast_vote', { roomCode: code, playerId: 'p1', targetId: civilianId });
    s2.emit('cast_vote', { roomCode: code, playerId: 'p2', targetId: civilianId });
    s3.emit('cast_vote', { roomCode: code, playerId: 'p3', targetId: civilianId });
    s4.emit('cast_vote', { roomCode: code, playerId: 'p4', targetId: civilianId });
    await sleep(1500);

    // 应该进入 ELIMINATION
    assert.strictEqual(hostRoomData.gameState.phase, 'ELIMINATION');
    const elim = hostRoomData.gameState.eliminatedPlayer;
    assert.strictEqual(elim.id, civilianId);
    assert.strictEqual(elim.isSecret, true, '暗牌模式下 elim.isSecret 应为 true');
    assert.strictEqual(elim.role, null, '暗牌模式下 elim.role 应为 null');
    assert.strictEqual(elim.word, null, '暗牌模式下 elim.word 应为 null');
    console.log('  ✅ 暗牌模式下淘汰玩家身份和词语成功保密！');

    console.log('\n====================================================');
    console.log('🏆 所有房主自定义规则维度测试全部通过！');
    console.log('====================================================');
  } finally {
    sockets.forEach(s => s.disconnect());
    server.close();
  }
}

runCustomRulesTest().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
