const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const assert = require('assert');
const { setupUndercover } = require('./games/undercover/server');

console.log('====================================================');
console.log('🎮 谁是卧底：房主全阶段推进与超长打字时长专项测试');
console.log('====================================================\n');

async function runHostControlsTest() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  setupUndercover(io, app);

  const PORT = 3999;
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
    const s1 = await connectClient('房主小明', 'p_host');
    const s2 = await connectClient('玩家小红', 'p_user2');
    const s3 = await connectClient('玩家小刚', 'p_user3');
    const s4 = await connectClient('玩家小李', 'p_user4');
    sockets.push(s1, s2, s3, s4);

    let hostRoomData = null;
    s1.on('room_update', d => { hostRoomData = d; });

    // 1. 创建房间（不传 speechTimeLimit，验证默认值）
    const createRes = await new Promise(r => {
      s1.emit('create_room', {
        player: { id: 'p_host', name: '房主小明' },
        settings: { undercoverCount: 1, whiteboardCount: 0 }
      }, r);
    });
    const code = createRes.roomCode;
    console.log(`[测试 1] 默认时长配置验证`);
    assert.strictEqual(hostRoomData.settings.speechTimeLimit, 90, '默认发言时长应为 90 秒');
    console.log('  ✅ 默认发言时长正确设置为 90 秒！');

    // 2. 其余3人加入房间
    await new Promise(r => s2.emit('join_room', { roomCode: code, player: { id: 'p_user2', name: '玩家小红' } }, r));
    await new Promise(r => s3.emit('join_room', { roomCode: code, player: { id: 'p_user3', name: '玩家小刚' } }, r));
    await new Promise(r => s4.emit('join_room', { roomCode: code, player: { id: 'p_user4', name: '玩家小李' } }, r));
    await sleep(300);

    // 3. 房主开局
    await new Promise(r => s1.emit('start_game', r));
    await sleep(200);
    assert.strictEqual(hostRoomData.gameState.phase, 'CARD_VIEW');
    console.log('\n[测试 2] 看牌阶段房主一键切入发言');
    // 房主直接点击强制开始发言
    s1.emit('force_start_speaking', { roomCode: code, playerId: 'p_host' });
    await sleep(300);
    assert.strictEqual(hostRoomData.gameState.phase, 'SPEAKING', '房主一键切入发言阶段');
    console.log('  ✅ 房主 force_start_speaking 成功越过看牌倒计时，直接进入 SPEAKING！');

    // 4. 发言阶段：非房主越权测试
    console.log('\n[测试 3] 发言阶段：权限拦截与房主一键直接开投');
    s2.emit('force_start_voting', { roomCode: code, playerId: 'p_user2' });
    await sleep(200);
    assert.strictEqual(hostRoomData.gameState.phase, 'SPEAKING', '普通玩家不能提前结束全员发言');
    console.log('  ✅ 非房主玩家试图一键开投被服务端安全拒绝！');

    // 房主一键提前结束全员发言，直接进入投票
    s1.emit('force_start_voting', { roomCode: code, playerId: 'p_host' });
    await sleep(300);
    assert.strictEqual(hostRoomData.gameState.phase, 'VOTING', '房主一键推进成功切入 VOTING 阶段');
    console.log('  ✅ 房主一键提前结束全员发言，瞬间开启全员投票！');

    // 5. 制造平票 PK 局：找出卧底与平民，形成 2:2 平票
    console.log('\n[测试 4] PK 争辩阶段：房主一键提前结束辩解，直接进入 PK 投票');
    let undercoverPid = null;
    ['p_host', 'p_user2', 'p_user3', 'p_user4'].forEach(pid => {
      if (clientStates[pid]?.myPlayer?.role === 'UNDERCOVER') undercoverPid = pid;
    });
    const civPids = ['p_host', 'p_user2', 'p_user3', 'p_user4'].filter(id => id !== undercoverPid);
    const candidateCiv = civPids[0]; // 候选平民

    // 投票形成平票：undercoverPid 2票, candidateCiv 2票
    // s1, s2 投 undercoverPid; s3, s4 投 candidateCiv
    sockets[0].emit('cast_vote', { roomCode: code, playerId: 'p_host', targetId: undercoverPid });
    sockets[1].emit('cast_vote', { roomCode: code, playerId: 'p_user2', targetId: undercoverPid });
    sockets[2].emit('cast_vote', { roomCode: code, playerId: 'p_user3', targetId: candidateCiv });
    sockets[3].emit('cast_vote', { roomCode: code, playerId: 'p_user4', targetId: candidateCiv });
    await sleep(1500);

    assert.strictEqual(hostRoomData.gameState.phase, 'PK_SPEAKING', '2:2 平票应进入 PK_SPEAKING');
    console.log('  ✅ 成功构造 2:2 平票进入 PK 争辩阶段！');

    // 非房主尝试提前结束辩解
    s3.emit('force_start_voting', { roomCode: code, playerId: 'p_user3' });
    await sleep(200);
    assert.strictEqual(hostRoomData.gameState.phase, 'PK_SPEAKING', '非房主不能提前结束PK');

    // 房主一键提前结束 PK 辩解，进入 PK_VOTING
    s1.emit('force_start_voting', { roomCode: code, playerId: 'p_host' });
    await sleep(300);
    assert.strictEqual(hostRoomData.gameState.phase, 'PK_VOTING', '房主一键推进切入 PK_VOTING');
    console.log('  ✅ 房主一键提前结束 PK 辩解，瞬间开启 PK 重投！');

    // 6. PK 投票：未平票的选民将卧底投出局
    console.log('\n[测试 5] 绝地猜词阶段：超长 30s 倒计时与房主一键跳过猜词');
    const jurors = civPids.filter(id => id !== candidateCiv); // 剩余2名陪审团
    jurors.forEach(jId => {
      const s = sockets.find((_, idx) => ['p_host', 'p_user2', 'p_user3', 'p_user4'][idx] === jId);
      if (s) s.emit('cast_vote', { roomCode: code, playerId: jId, targetId: undercoverPid });
    });
    await sleep(1500);

    assert.strictEqual(hostRoomData.gameState.phase, 'GUESS_WORD', '卧底被淘汰触发 GUESS_WORD');
    assert.strictEqual(hostRoomData.gameState.guessTarget.timeLimit, 30, '猜词时限应为 30 秒');
    console.log(`  ✅ 成功进入 GUESS_WORD 阶段，猜词倒计时为 ${hostRoomData.gameState.guessTarget.timeLimit} 秒！`);

    // 非房主尝试跳过猜词
    s2.emit('force_skip_guess', { roomCode: code, playerId: 'p_user2' });
    await sleep(200);
    assert.strictEqual(hostRoomData.gameState.phase, 'GUESS_WORD', '非房主不能跳过猜词');
    console.log('  ✅ 非房主试图跳过猜词被安全拦截！');

    // 房主一键跳过猜词（判定放弃）
    s1.emit('force_skip_guess', { roomCode: code, playerId: 'p_host' });
    await sleep(300);

    assert.strictEqual(hostRoomData.gameState.phase, 'ELIMINATION', '跳过猜词后先进入揭晓阶段展示淘汰');
    console.log('  ✅ 跳过猜词后顺利进入 ELIMINATION 淘汰揭晓展示！');

    // 等待 2.5 秒揭晓展示后自动进入结算
    await sleep(2600);

    assert.strictEqual(hostRoomData.gameState.phase, 'GAME_OVER', '揭晓完毕后进入 GAME_OVER 结算');
    assert.strictEqual(hostRoomData.gameState.winner, 'CIVILIAN', '卧底被淘汰且放弃猜词，平民获胜');
    console.log(`  ✅ 房主 force_skip_guess 成功跳过猜词并淘汰卧底，平民稳稳获胜！`);

    console.log('\n====================================================');
    console.log('🏆 房主全流程推进控制与超长时长配置测试全部通过！');
    console.log('====================================================');
  } finally {
    sockets.forEach(s => s.close());
    server.close();
  }
}

runHostControlsTest().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('❌ 测试执行异常:', err);
  process.exit(1);
});
