// 规则与机制测试：测试词库去重、白板独立胜利、PK候选人回避、绝地猜词
const assert = require('assert');
const { getRandomWordPair, wordCategories } = require('./games/undercover/words');
const undercoverServer = require('./games/undercover/server');

console.log('🧪 开始运行规则与机制测试...');

// --- 1. 词库去重测试 ---
console.log('\n--- 测试 1: 词库历史去重 ---');
const usedKeys = new Set();
const totalFoodWords = wordCategories.food.words.length;
console.log(`美食分类总共有 ${totalFoodWords} 对词`);

const selectedKeys = new Set();
for (let i = 0; i < totalFoodWords; i++) {
  const pair = getRandomWordPair('food', [], usedKeys);
  const key = [pair.civilian, pair.undercover].sort().join('###');
  assert.strictEqual(usedKeys.has(key), false, `不应该抽到已使用过的词对: ${key}`);
  usedKeys.add(key);
  selectedKeys.add(key);
}
assert.strictEqual(selectedKeys.size, totalFoodWords, '应抽遍所有不重复词对');
console.log('✅ 成功连续抽取无重复词对');

// 当全部用尽后再次抽取，应重置并成功返回词对（不崩溃）
const nextPair = getRandomWordPair('food', [], usedKeys);
assert.ok(nextPair && nextPair.civilian && nextPair.undercover, '词库用尽后重置应能继续抽词');
console.log('✅ 词库轮空后重置机制正常');

// --- 2. 白板胜利与胜负判定测试 ---
console.log('\n--- 测试 2: 白板阵营胜负判定 ---');

function createMockRoom(playerConfigs) {
  const room = {
    settings: { undercoverCount: 1, whiteboardCount: 1 },
    players: new Map(),
    gameState: { phase: 'VOTING', votes: {} }
  };
  playerConfigs.forEach((cfg, idx) => {
    const id = `p_${idx}`;
    room.players.set(id, {
      id,
      name: cfg.name || id,
      role: cfg.role,
      isAlive: cfg.isAlive !== false,
      isSpectator: false,
      isOnline: true,
      hasVoted: false
    });
  });
  return room;
}

// 场景 A: 卧底全灭，场上只剩 1平民 + 1白板 -> 白板独赢！
const roomWhiteboardWins = createMockRoom([
  { role: 'CIVILIAN', isAlive: true },
  { role: 'WHITEBOARD', isAlive: true },
  { role: 'UNDERCOVER', isAlive: false }
]);
const resA = undercoverServer.checkGameStatus(roomWhiteboardWins);
console.log('场景A (1平民 1白板 0卧底):', resA);
assert.strictEqual(resA.isOver, true, '游戏应当结束');
assert.strictEqual(resA.winner, 'WHITEBOARD', '当只剩 1平民 + 1白板时，白板应独赢');

// 场景 B: 卧底全灭，白板也全灭，还有平民存活 -> 平民获胜！
const roomCivilianWins = createMockRoom([
  { role: 'CIVILIAN', isAlive: true },
  { role: 'CIVILIAN', isAlive: true },
  { role: 'WHITEBOARD', isAlive: false },
  { role: 'UNDERCOVER', isAlive: false }
]);
const resB = undercoverServer.checkGameStatus(roomCivilianWins);
console.log('场景B (2平民 0白板 0卧底):', resB);
assert.strictEqual(resB.isOver, true, '游戏应当结束');
assert.strictEqual(resB.winner, 'CIVILIAN', '平民应获胜');

// 场景 C: 卧底存活，且存活卧底 >= 存活非卧底（且白板已出局） -> 卧底获胜！
const roomUndercoverWins = createMockRoom([
  { role: 'CIVILIAN', isAlive: true },
  { role: 'UNDERCOVER', isAlive: true },
  { role: 'WHITEBOARD', isAlive: false }
]);
const resC = undercoverServer.checkGameStatus(roomUndercoverWins);
console.log('场景C (1平民 1卧底 0白板):', resC);
assert.strictEqual(resC.isOver, true, '游戏应当结束');
assert.strictEqual(resC.winner, 'UNDERCOVER', '卧底应获胜');

// 场景 D: 卧底1人，白板1人，平民2人 -> 游戏未结束
const roomOngoing = createMockRoom([
  { role: 'CIVILIAN', isAlive: true },
  { role: 'CIVILIAN', isAlive: true },
  { role: 'UNDERCOVER', isAlive: true },
  { role: 'WHITEBOARD', isAlive: true }
]);
const resD = undercoverServer.checkGameStatus(roomOngoing);
console.log('场景D (2平民 1卧底 1白板):', resD);
assert.strictEqual(resD.isOver, false, '游戏不应结束');

// 场景 E: 卧底全灭，白板1人，平民2人 -> 游戏未结束（继续抓白板）
const roomWhiteboardHunting = createMockRoom([
  { role: 'CIVILIAN', isAlive: true },
  { role: 'CIVILIAN', isAlive: true },
  { role: 'UNDERCOVER', isAlive: false },
  { role: 'WHITEBOARD', isAlive: true }
]);
const resE = undercoverServer.checkGameStatus(roomWhiteboardHunting);
console.log('场景E (2平民 0卧底 1白板):', resE);
assert.strictEqual(resE.isOver, false, '卧底虽灭但白板还在，平民需继续投票，游戏不应结束');

console.log('✅ 白板胜负判定逻辑测试通过');

// --- 3. PK 候选人回避投票测试 ---
console.log('\n--- 测试 3: PK 投票候选人回避 ---');
const mockIo = {
  to: () => ({ emit: () => {} })
};
const pkRoom = createMockRoom([
  { role: 'CIVILIAN', isAlive: true }, // p_0: pkCandidate A
  { role: 'UNDERCOVER', isAlive: true }, // p_1: pkCandidate B
  { role: 'CIVILIAN', isAlive: true }  // p_2: 普通选民
]);
pkRoom.gameState.phase = 'PK_VOTING';
pkRoom.gameState.pkCandidates = ['p_0', 'p_1'];

// p_0 (作为候选人) 试图投票给 p_1 -> 应该被拒绝
undercoverServer.processVote(mockIo, pkRoom, 'p_0', 'p_1');
assert.strictEqual(pkRoom.players.get('p_0').hasVoted, false, 'PK候选人 p_0 不应被允许投票');
assert.strictEqual(pkRoom.gameState.votes['p_0'], undefined, 'PK候选人 p_0 的投票不应被记录');

// p_2 (非候选人) 投票给 p_0 -> 应该被成功接收
undercoverServer.processVote(mockIo, pkRoom, 'p_2', 'p_0');
assert.strictEqual(pkRoom.players.get('p_2').hasVoted, true, '非PK玩家 p_2 应当成功投票');
assert.strictEqual(pkRoom.gameState.votes['p_2'], 'p_0', 'p_2 投给 p_0 应被记录');
console.log('✅ PK候选人投票回避测试通过');

// --- 4. 绝地猜词翻盘机制测试 ---
console.log('\n--- 测试 4: 绝地猜词翻盘机制 ---');
const guessRoom = createMockRoom([
  { role: 'CIVILIAN', isAlive: true },
  { role: 'UNDERCOVER', isAlive: true }
]);
guessRoom.gameState.winningWord = '可乐';
const ucPlayer = guessRoom.players.get('p_1');

// 淘汰卧底触发猜词
undercoverServer.handleEliminateWithGuess(mockIo, guessRoom, ucPlayer.id, 2);
assert.strictEqual(guessRoom.gameState.phase, 'GUESS_WORD', '淘汰卧底应进入 GUESS_WORD 阶段');
assert.strictEqual(guessRoom.gameState.guessTarget.id, ucPlayer.id, '猜词目标应为该出局玩家');

// 卧底提交正确词语 "可乐"
const guessSuccessRes = undercoverServer.submitGuessWord(mockIo, guessRoom, ucPlayer.id, '  可乐  ');
assert.strictEqual(guessSuccessRes.success, true, '猜中词语应判定成功');
assert.strictEqual(guessRoom.gameState.phase, 'GAME_OVER', '猜中后应直接 GAME_OVER');
assert.strictEqual(guessRoom.gameState.winner, 'UNDERCOVER', '卧底猜中平民词应判定卧底获胜！');
console.log('✅ 绝地猜词翻盘测试通过！');

console.log('\n🎉🎉 所有新规则测试全部通过！');
