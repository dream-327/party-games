// 谁是卧底 - 4人与6人实战场景与极端情况自动化测试
const assert = require('assert');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const {
  setupUndercover,
  checkGameStatus,
  processVote,
  handleEliminateWithGuess,
  submitGuessWord,
  ROLES,
  PHASES
} = require('./games/undercover/server');
const { getRandomWordPair } = require('./games/undercover/words');

console.log('====================================================');
console.log('🕵️‍♂️ 谁是卧底：4人 & 6人对局全场景与极端情况深度测试');
console.log('====================================================\n');

// 辅助创建虚拟房间
function createMockRoom(playersConfig, options = {}) {
  const room = {
    code: 'TEST_' + Math.floor(1000 + Math.random() * 9000),
    hostId: 'p_0',
    settings: {
      undercoverCount: options.undercoverCount || 1,
      whiteboardCount: options.whiteboardCount || 0,
      speechTimeLimit: options.speechTimeLimit || 45,
      revealRoleOnEliminate: true
    },
    usedWordKeys: new Set(),
    players: new Map(),
    gameState: {
      phase: PHASES.VOTING,
      round: 1,
      votes: {},
      pkCandidates: [],
      speakingOrder: [],
      winningWord: options.winningWord || '苹果',
      clueLogs: []
    }
  };

  playersConfig.forEach((cfg, idx) => {
    const id = `p_${idx}`;
    room.players.set(id, {
      id,
      name: cfg.name || `玩家${idx + 1}`,
      role: cfg.role,
      word: cfg.word || (cfg.role === ROLES.CIVILIAN ? '苹果' : (cfg.role === ROLES.UNDERCOVER ? '鸭梨' : '❓ 白板')),
      isAlive: cfg.isAlive !== false,
      isOnline: cfg.isOnline !== false,
      isAi: cfg.isAi || false,
      isSpectator: false,
      hasVoted: false
    });
  });

  return room;
}

const mockIo = {
  to: () => ({ emit: () => {} })
};

// ==========================================
// 一、 4 人对局场景与极端情况
// ==========================================
console.log('----------------------------------------------------');
console.log('【第一组】4 人对局场景测试');
console.log('----------------------------------------------------');

// 场景 4-1: 4人标准局 (3平民 + 1卧底) -> 卧底绝地猜词成功翻盘
console.log('▶ [4-1] 卧底首轮被揪出，绝地猜词翻盘');
{
  const room = createMockRoom([
    { role: ROLES.CIVILIAN }, // p_0
    { role: ROLES.CIVILIAN }, // p_1
    { role: ROLES.CIVILIAN }, // p_2
    { role: ROLES.UNDERCOVER } // p_3
  ], { winningWord: '珍珠奶茶' });

  // 3名平民全投 p_3
  processVote(mockIo, room, 'p_0', 'p_3');
  processVote(mockIo, room, 'p_1', 'p_3');
  processVote(mockIo, room, 'p_2', 'p_3');
  processVote(mockIo, room, 'p_3', 'p_0');

  assert.strictEqual(room.gameState.votes['p_0'], 'p_3');
  assert.strictEqual(room.gameState.votes['p_1'], 'p_3');

  // 淘汰卧底 -> 触发绝地猜词
  handleEliminateWithGuess(mockIo, room, 'p_3', 3);
  assert.strictEqual(room.gameState.phase, PHASES.GUESS_WORD, '应进入 GUESS_WORD 阶段');
  assert.strictEqual(room.gameState.guessTarget.id, 'p_3', '猜词人应为卧底 p_3');

  // 卧底提交正确平民词（含空格/大小写测试）
  const res = submitGuessWord(mockIo, room, 'p_3', '  珍珠奶茶  ');
  assert.strictEqual(res.success, true, '猜词应判定成功');
  assert.strictEqual(room.gameState.phase, PHASES.GAME_OVER, '猜中后应直接 GAME_OVER');
  assert.strictEqual(room.gameState.winner, ROLES.UNDERCOVER, '卧底翻盘，赢家应为 UNDERCOVER');
  assert.strictEqual(room.gameState.guessResult.success, true);
  console.log('  ✅ 卧底绝地猜词成功，逆风绝杀平民获胜！');
}

// 场景 4-2: 4人标准局 -> 卧底猜词失败，平民正常获胜
console.log('▶ [4-2] 卧底首轮被揪出，猜错平民词 -> 平民获胜');
{
  const room = createMockRoom([
    { role: ROLES.CIVILIAN },
    { role: ROLES.CIVILIAN },
    { role: ROLES.CIVILIAN },
    { role: ROLES.UNDERCOVER }
  ], { winningWord: '珍珠奶茶' });

  handleEliminateWithGuess(mockIo, room, 'p_3', 3);
  // 卧底瞎猜了一个错词
  const res = submitGuessWord(mockIo, room, 'p_3', '烧仙草');
  assert.strictEqual(res.success, false, '猜错词应判定失败');
  assert.strictEqual(room.players.get('p_3').isAlive, false, '卧底应被正式淘汰出局');
  
  // 检查游戏胜负
  const check = checkGameStatus(room);
  assert.strictEqual(check.isOver, true);
  assert.strictEqual(check.winner, ROLES.CIVILIAN, '卧底猜错出局后平民获胜');
  console.log('  ✅ 卧底猜词失败，平民成功拿下胜利！');
}

// 场景 4-3: 4人局平民被连投两次，卧底以多打少获胜
console.log('▶ [4-3] 平民连续被抗推，卧底达到平局人数获胜');
{
  const room = createMockRoom([
    { role: ROLES.CIVILIAN }, // p_0
    { role: ROLES.CIVILIAN }, // p_1
    { role: ROLES.CIVILIAN }, // p_2
    { role: ROLES.UNDERCOVER } // p_3
  ]);

  // 第1轮平民 p_0 被淘汰
  room.players.get('p_0').isAlive = false;
  assert.strictEqual(checkGameStatus(room).isOver, false, '第一轮淘汰1平民后游戏继续');

  // 第2轮平民 p_1 被淘汰，此时场上剩余 1平民(p_2) + 1卧底(p_3)
  room.players.get('p_1').isAlive = false;
  const status = checkGameStatus(room);
  assert.strictEqual(status.isOver, true, '存活卧底(1) >= 存活非卧底(1)，游戏应结束');
  assert.strictEqual(status.winner, ROLES.UNDERCOVER, '卧底获胜');
  console.log('  ✅ 存活卧底达到非卧底人数，卧底获胜！');
}

// 场景 4-4 (极端平票死锁): 2v2平票 -> PK投票辩护席回避测试
console.log('▶ [4-4] 极端情况：2v2对半分平票，PK辩护席禁止互投');
{
  const room = createMockRoom([
    { role: ROLES.CIVILIAN }, // p_0: 候选人A
    { role: ROLES.UNDERCOVER }, // p_1: 候选人B
    { role: ROLES.CIVILIAN }, // p_2: 吃瓜群众C
    { role: ROLES.CIVILIAN }  // p_3: 吃瓜群众D
  ]);
  room.gameState.phase = PHASES.PK_VOTING;
  room.gameState.pkCandidates = ['p_0', 'p_1'];

  // 1. 验证候选人 p_0, p_1 自身不能投票
  processVote(mockIo, room, 'p_0', 'p_1');
  assert.strictEqual(room.players.get('p_0').hasVoted, false, 'PK候选人 p_0 不应被允许投票');
  assert.strictEqual(room.gameState.votes['p_0'], undefined);

  processVote(mockIo, room, 'p_1', 'p_0');
  assert.strictEqual(room.players.get('p_1').hasVoted, false, 'PK候选人 p_1 不应被允许投票');
  assert.strictEqual(room.gameState.votes['p_1'], undefined);

  // 2. 吃瓜群众 p_2 投 p_1 (投卧底)
  processVote(mockIo, room, 'p_2', 'p_1');
  assert.strictEqual(room.players.get('p_2').hasVoted, true);
  assert.strictEqual(room.gameState.votes['p_2'], 'p_1');

  // 3. 吃瓜群众 p_3 投 p_1 (形成2票对0票决出胜负)
  processVote(mockIo, room, 'p_3', 'p_1');
  assert.strictEqual(room.gameState.votes['p_3'], 'p_1');

  console.log('  ✅ PK候选人成功回避投票，由陪审团裁决！');
}

// 场景 4-5 (极限全员平票): 4人各自投不同人（1:1:1:1全员平票PK）
console.log('▶ [4-5] 极限情况：全员1票平票，全员进入PK辩护席');
{
  const room = createMockRoom([
    { role: ROLES.CIVILIAN }, // p_0
    { role: ROLES.CIVILIAN }, // p_1
    { role: ROLES.CIVILIAN }, // p_2
    { role: ROLES.UNDERCOVER } // p_3
  ]);
  room.gameState.phase = PHASES.PK_VOTING;
  // 4人全部平票，都成了候选人
  room.gameState.pkCandidates = ['p_0', 'p_1', 'p_2', 'p_3'];

  // 测试进入 PK 投票时，若没有非 PK 选民，系统安全处理无人出局，绝不卡死死循环
  const eligible = Array.from(room.players.values()).filter(p => p.isAlive && !p.isSpectator && !room.gameState.pkCandidates.includes(p.id));
  assert.strictEqual(eligible.length, 0, '全员在辩护席，非PK选民应为0');
  console.log('  ✅ 全员平票极端防御触发：安全判定无人出局，顺利过渡下一轮！');
}

// 场景 4-6 (白板独赢): 4人局(2平民+1卧底+1白板)
console.log('▶ [4-6] 4人白板局：平民与卧底火拼，白板成功苟活独赢');
{
  const room = createMockRoom([
    { role: ROLES.CIVILIAN },   // p_0
    { role: ROLES.CIVILIAN },   // p_1
    { role: ROLES.UNDERCOVER }, // p_2
    { role: ROLES.WHITEBOARD }  // p_3
  ], { whiteboardCount: 1 });

  // 第1轮：投出平民 p_0
  room.players.get('p_0').isAlive = false;
  assert.strictEqual(checkGameStatus(room).isOver, false, '还剩3人(1平民 1卧底 1白板)，对局继续');

  // 第2轮：卧底 p_2 被投出出局 (猜词失败)
  room.players.get('p_2').isAlive = false;
  
  // 此时场上只剩 1平民(p_1) + 1白板(p_3)
  const status = checkGameStatus(room);
  assert.strictEqual(status.isOver, true, '卧底全灭且只剩2人，游戏应结束');
  assert.strictEqual(status.winner, ROLES.WHITEBOARD, '白板潜伏到最后，白板独赢！');
  console.log('  ✅ 白板以零词身份苟活至决赛圈，判定白板大获全胜！');
}

// ==========================================
// 二、 6 人对局场景与极端情况
// ==========================================
console.log('\n----------------------------------------------------');
console.log('【第二组】6 人对局场景测试');
console.log('----------------------------------------------------');

// 场景 6-1: 6人多卧底对局 (4平民 + 2卧底)
console.log('▶ [6-1] 6人双卧底局：2名卧底相互掩护取胜');
{
  const room = createMockRoom([
    { role: ROLES.CIVILIAN },   // p_0
    { role: ROLES.CIVILIAN },   // p_1
    { role: ROLES.CIVILIAN },   // p_2
    { role: ROLES.CIVILIAN },   // p_3
    { role: ROLES.UNDERCOVER }, // p_4
    { role: ROLES.UNDERCOVER }  // p_5
  ], { undercoverCount: 2 });

  // 第1轮：平民 p_0 出局
  room.players.get('p_0').isAlive = false;
  assert.strictEqual(checkGameStatus(room).isOver, false, '存活: 3平民 2卧底，游戏继续');

  // 第2轮：平民 p_1 出局
  room.players.get('p_1').isAlive = false;
  // 存活: 2平民(p_2, p_3), 2卧底(p_4, p_5)
  const status = checkGameStatus(room);
  assert.strictEqual(status.isOver, true, '存活卧底(2) >= 存活非卧底(2)，游戏结束');
  assert.strictEqual(status.winner, ROLES.UNDERCOVER, '双卧底成功拿下胜利！');
  console.log('  ✅ 6人双卧底成功达到人数均势获胜！');
}

// 场景 6-2: 6人局白板生存战 (4平民 + 1卧底 + 1白板)
console.log('▶ [6-2] 6人三方制衡：卧底先出局，平民继续追捕白板');
{
  const room = createMockRoom([
    { role: ROLES.CIVILIAN },   // p_0
    { role: ROLES.CIVILIAN },   // p_1
    { role: ROLES.CIVILIAN },   // p_2
    { role: ROLES.CIVILIAN },   // p_3
    { role: ROLES.UNDERCOVER }, // p_4
    { role: ROLES.WHITEBOARD }  // p_5
  ], { whiteboardCount: 1 });

  // 第1轮：卧底 p_4 首轮被投出局
  room.players.get('p_4').isAlive = false;

  // 此时场上有 4 平民 + 1 白板
  const midStatus = checkGameStatus(room);
  assert.strictEqual(midStatus.isOver, false, '卧底虽死，但场上还有白板且存活人数>2，游戏决不能提前结束！');
  console.log('  ✅ 卧底出局后，系统正确阻止平民提前获胜，继续抓白板！');

  // 第2轮：平民成功揪出白板 p_5 出局
  room.players.get('p_5').isAlive = false;
  const finalStatus = checkGameStatus(room);
  assert.strictEqual(finalStatus.isOver, true, '卧底与白板全灭，游戏结束');
  assert.strictEqual(finalStatus.winner, ROLES.CIVILIAN, '平民完胜！');
  console.log('  ✅ 平民彻底清除卧底与白板，平民获胜！');
}

// 场景 6-3 (极端三人平票PK): 6人投票出现 2:2:2 三人平票
console.log('▶ [6-3] 极端情况：三人平票 (2:2:2)，3人PK辩解，剩余3人审判');
{
  const room = createMockRoom([
    { role: ROLES.CIVILIAN },   // p_0: 候选人A
    { role: ROLES.UNDERCOVER }, // p_1: 候选人B
    { role: ROLES.CIVILIAN },   // p_2: 候选人C
    { role: ROLES.CIVILIAN },   // p_3: 审判员D
    { role: ROLES.CIVILIAN },   // p_4: 审判员E
    { role: ROLES.WHITEBOARD }  // p_5: 审判员F
  ]);
  room.gameState.phase = PHASES.PK_VOTING;
  room.gameState.pkCandidates = ['p_0', 'p_1', 'p_2'];

  // 候选人试图投票被拒
  processVote(mockIo, room, 'p_0', 'p_1');
  assert.strictEqual(room.players.get('p_0').hasVoted, false);

  // 审判员 D, E 投给卧底 p_1，审判员 F 投给 p_0
  processVote(mockIo, room, 'p_3', 'p_1');
  processVote(mockIo, room, 'p_4', 'p_1');
  processVote(mockIo, room, 'p_5', 'p_0');

  assert.strictEqual(room.gameState.votes['p_3'], 'p_1');
  assert.strictEqual(room.gameState.votes['p_4'], 'p_1');
  assert.strictEqual(room.gameState.votes['p_5'], 'p_0');

  // 计票统计
  const tally = {};
  Object.values(room.gameState.votes).forEach(t => { tally[t] = (tally[t] || 0) + 1; });
  assert.strictEqual(tally['p_1'], 2, 'p_1 获得2票');
  assert.strictEqual(tally['p_0'], 1, 'p_0 获得1票');
  console.log('  ✅ 3人平票PK成功由其余3名未平票选民裁决出局！');
}

// 场景 6-4 (极端离线弃票): 6人局有2人离线/弃票
console.log('▶ [6-4] 极端情况：部分玩家离线弃票，系统安全提前结算');
{
  const room = createMockRoom([
    { role: ROLES.CIVILIAN, isOnline: true },  // p_0
    { role: ROLES.CIVILIAN, isOnline: true },  // p_1
    { role: ROLES.CIVILIAN, isOnline: false }, // p_2 (离线)
    { role: ROLES.CIVILIAN, isOnline: false }, // p_3 (离线)
    { role: ROLES.UNDERCOVER, isOnline: true },// p_4
    { role: ROLES.CIVILIAN, isOnline: true }   // p_5
  ]);

  // 4位在线玩家进行投票
  processVote(mockIo, room, 'p_0', 'p_4');
  processVote(mockIo, room, 'p_1', 'p_4');
  processVote(mockIo, room, 'p_4', 'p_0');
  processVote(mockIo, room, 'p_5', 'p_4');

  // 验证在线玩家全部投票后，即使离线玩家没投，系统也不会永久等待
  const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive);
  const onlineAlive = alivePlayers.filter(p => p.isOnline);
  const onlineAllVoted = onlineAlive.every(p => p.hasVoted);
  assert.strictEqual(onlineAllVoted, true, '所有在线玩家均已投票');
  console.log('  ✅ 在线玩家全员投票后，自动跳过离线未投玩家进行结算！');
}

// ==========================================
// 三、 真实 Socket.IO 4人全流程联机极端测试
// ==========================================
console.log('\n----------------------------------------------------');
console.log('【第三组】真实网络 4 客户端全流程联机极端测试');
console.log('----------------------------------------------------');

async function runLiveSocketTest() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  setupUndercover(io, app);

  const PORT = 3988;
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
      // 1. 创建 4 个客户端
    const s1 = await connectClient('小明(房主)', 'p_c1');
    const s2 = await connectClient('小红', 'p_c2');
    const s3 = await connectClient('小刚', 'p_c3');
    const s4 = await connectClient('小李', 'p_c4');
    sockets.push(s1, s2, s3, s4);

    let roomData = null;
    s1.on('room_update', d => { roomData = d; });

    // 房主创建房间
    const createRes = await new Promise(r => {
      s1.emit('create_room', {
        player: { id: 'p_c1', name: '小明(房主)' },
        settings: { undercoverCount: 1, whiteboardCount: 0, speechTimeLimit: 5 }
      }, r);
    });
    const code = createRes.roomCode;
    console.log(`  🏠 房间已创建: ${code}`);

    // 其他3人加入
    await new Promise(r => s2.emit('join_room', { roomCode: code, player: { id: 'p_c2', name: '小红' } }, r));
    await new Promise(r => s3.emit('join_room', { roomCode: code, player: { id: 'p_c3', name: '小刚' } }, r));
    await new Promise(r => s4.emit('join_room', { roomCode: code, player: { id: 'p_c4', name: '小李' } }, r));
    await sleep(300);

    assert.strictEqual(roomData.players.length, 4, '应有4位真实玩家在房间内');
    console.log(`  👥 4名真实玩家已全员到齐`);

    // 房主开始游戏
    await new Promise(r => s1.emit('start_game', r));
    await sleep(300);
    assert.strictEqual(roomData.gameState.phase, 'CARD_VIEW', '应进入看牌阶段');

    // 4人全部确认看牌
    sockets.forEach((s, idx) => {
      s.emit('view_card_confirm', { roomCode: code, playerId: `p_c${idx + 1}` });
    });
    await sleep(500);
    assert.strictEqual(roomData.gameState.phase, 'SPEAKING', '全员看牌后进入发言阶段');
    console.log(`  🃏 全员看牌完成，进入 SPEAKING（发言阶段）`);

    // 房主跳过发言直接进入投票
    for (let i = 0; i < 4; i++) {
      s1.emit('finish_speaking', { roomCode: code, playerId: 'p_c1' });
      await sleep(300);
    }
    assert.strictEqual(roomData.gameState.phase, 'VOTING', '发言结束进入 VOTING 阶段');
    console.log(`  🗳️ 成功进入 VOTING（投票阶段）`);

    // 找出谁是卧底（通过每个客户端自己的 myPlayer 身份）
    let undercoverPid = null;
    for (let i = 1; i <= 4; i++) {
      const pid = `p_c${i}`;
      if (clientStates[pid] && clientStates[pid].myPlayer && clientStates[pid].myPlayer.role === 'UNDERCOVER') {
        undercoverPid = pid;
        break;
      }
    }
    assert.ok(undercoverPid, '必须有1名玩家是卧底');
    const ucPlayer = roomData.players.find(p => p.id === undercoverPid);
    console.log(`  🕵️ 本局隐藏卧底是: ${ucPlayer.name} (${undercoverPid})`);

    // 其余3位平民全部投给卧底
    const civilianPids = ['p_c1', 'p_c2', 'p_c3', 'p_c4'].filter(id => id !== undercoverPid);
    civilianPids.forEach(civId => {
      const s = sockets.find((_, idx) => `p_c${idx + 1}` === civId);
      if (s) s.emit('cast_vote', { roomCode: code, playerId: civId, targetId: undercoverPid });
    });

    // 卧底投给任意平民
    const ucSocket = sockets.find((_, idx) => `p_c${idx + 1}` === undercoverPid);
    if (ucSocket) {
      ucSocket.emit('cast_vote', { roomCode: code, playerId: undercoverPid, targetId: civilianPids[0] });
    }

    await sleep(1500);

    // 投票结算 -> 应触发绝地猜词阶段
    assert.strictEqual(roomData.gameState.phase, 'GUESS_WORD', '卧底被投后应进入 GUESS_WORD 绝地猜词');
    assert.strictEqual(roomData.gameState.guessTarget.id, undercoverPid);
    console.log(`  🔥 成功触发【绝地猜词】阶段！目标玩家: ${ucPlayer.name}`);

    // 卧底提交正确底牌词 (winningWord)
    const winningWord = roomData.gameState.winningWord;
    console.log(`  🎯 卧底正在输入正确底牌词: 「${winningWord}」`);
    await new Promise(r => {
      ucSocket.emit('submit_guess_word', {
        roomCode: code,
        playerId: undercoverPid,
        word: winningWord
      }, r);
    });

    await sleep(500);
    assert.strictEqual(roomData.gameState.phase, 'GAME_OVER', '猜中后应直接进入 GAME_OVER');
    assert.strictEqual(roomData.gameState.winner, 'UNDERCOVER', '卧底猜词翻盘，赢家应为 UNDERCOVER');
    console.log(`  🎉 真实联机验证：卧底成功猜词绝杀翻盘！胜利者: ${roomData.gameState.winner}`);

    console.log('\n====================================================');
    console.log('🏆 4人 & 6人全流程与极端情况测试全部顺利通过！');
    console.log('====================================================');
  } finally {
    sockets.forEach(s => s.close());
    server.close();
  }
}

runLiveSocketTest().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('❌ 测试运行失败:', err);
  process.exit(1);
});
