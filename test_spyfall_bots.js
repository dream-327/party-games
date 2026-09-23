// 间谍危机 (Spyfall) - 电脑人机 (AI Bots) 专项测试
const assert = require('assert');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');

const {
  createGameRoom,
  startGameForRoom,
  handleAccuse,
  handleVoteAccuse,
  handleSpyGuess,
  resetRoomForNextGame,
  getSafePlayerView,
  addBotToRoom,
  removeBotFromRoom,
  clearBotsFromRoom,
  triggerBotVotes,
  triggerBotSpyGuess,
  setupSpyfall,
  PHASES,
  rooms
} = require('./games/spyfall/server');

async function runSpyfallBotsTest() {
  console.log('🧪 开始测试间谍危机电脑人机 (AI Bots) 核心逻辑与全流程...');

  // ========================================================
  // 1. 测试大厅人机管理 (添加、快速补齐、移除、清空)
  // ========================================================
  console.log('1️⃣ 测试大厅人机添加、移除与清空...');
  const room = createGameRoom('9988', { id: 'host_1', name: '房主小张', avatar: '🤠' });
  assert.strictEqual(room.players.size, 1);
  assert.strictEqual(room.players.get('host_1').isBot, false);

  // 添加第 1 个人机
  const addRes1 = addBotToRoom(room);
  assert.strictEqual(addRes1.success, true);
  assert.strictEqual(room.players.size, 2);
  const bot1 = addRes1.bot;
  assert.strictEqual(bot1.isBot, true);
  assert.strictEqual(bot1.isHost, false);
  assert.strictEqual(bot1.isOnline, true);
  console.log(`  ✓ 成功添加第一个人机: ${bot1.name} (${bot1.avatar})`);

  // 添加第 2 个人机
  const addRes2 = addBotToRoom(room);
  assert.strictEqual(addRes2.success, true);
  assert.strictEqual(room.players.size, 3);
  const bot2 = addRes2.bot;
  assert.strictEqual(bot2.isBot, true);
  console.log(`  ✓ 成功添加第二个人机: ${bot2.name} (${bot2.avatar})`);

  // 测试移除指定人机
  const removeRes = removeBotFromRoom(room, bot1.id);
  assert.strictEqual(removeRes.success, true);
  assert.strictEqual(room.players.size, 2);
  assert.strictEqual(room.players.has(bot1.id), false);
  console.log(`  ✓ 成功移除指定人机 ${bot1.id}`);

  // 再次补上两个人机
  addBotToRoom(room);
  addBotToRoom(room);
  assert.strictEqual(room.players.size, 4);

  // 测试一键清空人机
  const clearRes = clearBotsFromRoom(room);
  assert.strictEqual(clearRes.success, true);
  assert.strictEqual(clearRes.count, 3);
  assert.strictEqual(room.players.size, 1);
  assert.strictEqual(room.players.has('host_1'), true);
  console.log('  ✓ 成功清空所有人机，仅保留人类房主');

  // ========================================================
  // 2. 测试 1 人类 + 2 人机顺利开局与数据脱敏
  // ========================================================
  console.log('2️⃣ 测试 1人类 + 2人机 顺利开启对局与脱敏渲染...');
  addBotToRoom(room);
  addBotToRoom(room);
  assert.strictEqual(room.players.size, 3);

  const startRes = startGameForRoom(room, { durationMinutes: 8 });
  assert.strictEqual(startRes.success, true);
  assert.strictEqual(room.gameState.phase, PHASES.PLAYING);
  assert.ok(room.spyId);
  assert.ok(room.targetLocation);
  console.log(`  ✓ 成功开局！真实地点: ${room.targetLocation.name}，间谍 ID: ${room.spyId}`);

  // 验证人类视角脱敏
  const safeViewHost = getSafePlayerView(room, 'host_1');
  assert.strictEqual(safeViewHost.players.length, 3);
  const botPlayerInView = safeViewHost.players.find(p => p.isBot);
  assert.ok(botPlayerInView);
  assert.strictEqual(botPlayerInView.isBot, true);
  assert.strictEqual(botPlayerInView.role, '???'); // 未结算时绝密脱敏
  assert.strictEqual(botPlayerInView.isSpy, undefined);
  console.log('  ✓ 人机玩家在局内视图中标记 isBot: true，且身份严格脱敏为 ???');

  // ========================================================
  // 3. 测试指控流程中人机自动投票表决
  // ========================================================
  console.log('3️⃣ 测试指控中在场人机自动响应投票...');
  const playerIds = Array.from(room.players.keys());
  const suspectId = playerIds.find(id => id !== 'host_1');

  // 房主发起对 suspectId 的指控
  const accuseRes = handleAccuse(room, 'host_1', suspectId);
  assert.strictEqual(accuseRes.success, true);
  assert.strictEqual(room.gameState.phase, PHASES.PAUSED_ACCUSE);
  assert.strictEqual(room.currentAccuse.votes.get('host_1'), true);

  // 触发人机自动投票 (delay = 0 模拟同步执行)
  triggerBotVotes(room, null, 0);

  // 验证投票表决全票通过
  assert.strictEqual(room.currentAccuse, null); // 投票完成已清空
  assert.ok(
    room.gameState.phase === PHASES.SPY_GUESSING || room.gameState.phase === PHASES.GAME_OVER,
    `阶段应转入 SPY_GUESSING 或 GAME_OVER，当前为: ${room.gameState.phase}`
  );
  console.log(`  ✓ 人机自动完成投票！进入下一阶段: ${room.gameState.phase}`);

  // ========================================================
  // 4. 测试人机间谍自动猜地点反击与结算
  // ========================================================
  console.log('4️⃣ 测试人机间谍自动反击猜地点与胜负结算...');
  if (room.gameState.phase === PHASES.SPY_GUESSING) {
    // 若被抓的是人机间谍，触发猜地点
    triggerBotSpyGuess(room, null, 0);
    assert.strictEqual(room.gameState.phase, PHASES.GAME_OVER);
    console.log(`  ✓ 人机间谍反击完成，胜负揭晓: 胜者【${room.gameState.winner}】，原因: ${room.gameState.winReason}`);
  }

  // ========================================================
  // 5. 测试房间重置保留人机配置 (再来一局)
  // ========================================================
  console.log('5️⃣ 测试再来一局重置，保留人机特工...');
  resetRoomForNextGame(room);
  assert.strictEqual(room.gameState.phase, PHASES.LOBBY);
  assert.strictEqual(room.players.size, 3);
  const botsAfterReset = Array.from(room.players.values()).filter(p => p.isBot);
  assert.strictEqual(botsAfterReset.length, 2);
  botsAfterReset.forEach(b => {
    assert.strictEqual(b.role, null);
    assert.strictEqual(b.isSpy, false);
    assert.strictEqual(b.isOnline, true);
  });
  console.log('  ✓ 房间成功重置为大厅，2 名人机特工完整保留，可直接再次开启下一局！');

  // ========================================================
  // 6. 测试端到端 Socket.IO 通信人机闭环
  // ========================================================
  console.log('6️⃣ 测试端到端 Socket.IO 接口人机事件交互 (E2E)...');
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  setupSpyfall(io, app);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const clientSocket = ioClient(`http://localhost:${port}/spyfall`, { reconnection: false });

  await new Promise((resolve) => clientSocket.on('connect', resolve));

  // 创建房间
  const createRes = await new Promise((resolve) => {
    clientSocket.emit('create_room', { player: { name: '单人测试者', avatar: '🕵️' } }, resolve);
  });
  assert.strictEqual(createRes.success, true);
  const testRoomCode = createRes.roomCode;

  // 房主添加 2 个 AI
  const addBot1 = await new Promise((resolve) => {
    clientSocket.emit('add_bot', {}, resolve);
  });
  assert.strictEqual(addBot1.success, true);
  assert.strictEqual(addBot1.bot.isBot, true);

  const addBot2 = await new Promise((resolve) => {
    clientSocket.emit('add_bot', {}, resolve);
  });
  assert.strictEqual(addBot2.success, true);

  // 房主启动游戏
  const startRoomRes = await new Promise((resolve) => {
    clientSocket.emit('start_game', { roomCode: testRoomCode }, resolve);
  });
  assert.strictEqual(startRoomRes.success, true);
  console.log('  ✓ Socket.IO 端到端添加 2 名人机并成功开启 3 人对局！');

  // 房主发起对其中一个人机的指控
  const testRoom = rooms.get(testRoomCode);
  const targetBot = Array.from(testRoom.players.values()).find(p => p.isBot);
  assert.ok(targetBot);

  const accuseResultPromise = new Promise((resolve) => {
    clientSocket.on('accuse_result', resolve);
  });

  const initiateRes = await new Promise((resolve) => {
    clientSocket.emit('initiate_accuse', { targetPlayerId: targetBot.id }, resolve);
  });
  assert.strictEqual(initiateRes.success, true);

  // 等待在场另一个人机自动投票并通过
  const accuseResult = await accuseResultPromise;
  assert.strictEqual(accuseResult.voteFinished, true);
  assert.strictEqual(accuseResult.consensus, true);
  console.log(`  ✓ Socket.IO 在场人机自动响应指控投票完成: ${accuseResult.message}`);

  // 清理网络资源
  clientSocket.disconnect();
  await new Promise((resolve) => server.close(resolve));
  console.log('  ✓ 动态测试服务与 Socket 顺利关闭清理');

  console.log('\n🎉 间谍危机电脑人机 (AI Bots) 专项测试全部通过！');
  process.exit(0);
}

runSpyfallBotsTest().catch((err) => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
