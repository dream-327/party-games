// test_spyfall_server.js
const assert = require('assert');
const {
  PHASES,
  getSafePlayerView,
  createGameRoom,
  startGameForRoom,
  handleAccuse,
  handleVoteAccuse,
  handleSpyGuess,
  resetRoomForNextGame
} = require('./games/spyfall/server');

console.log('🧪 开始测试服务端状态机与数据脱敏...');

// 1. 初始化房间
const room = createGameRoom('1001', { id: 'p1', name: '房主张三', avatar: '🤠' });
assert.strictEqual(room.gameState.phase, PHASES.LOBBY);
assert.strictEqual(room.players.size, 1);

// 2. 加入平民与测试数据
room.players.set('p2', { id: 'p2', name: '李四', avatar: '🦊', isOnline: true });
room.players.set('p3', { id: 'p3', name: '王五', avatar: '🤖', isOnline: true });
room.players.set('p4', { id: 'p4', name: '赵六', avatar: '🐼', isOnline: true });

// 3. 开始游戏
const startRes = startGameForRoom(room, { durationMinutes: 8 });
assert(startRes.success, '游戏应当成功开启');
assert.strictEqual(room.gameState.phase, PHASES.PLAYING);
assert(room.spyId, '必须随机指定一名间谍');
assert(room.targetLocation, '必须指定真实地点');
assert(room.candidateLocations.length >= 16, '必须生成候选池');

// 4. 间谍视角脱敏断言
const spyView = getSafePlayerView(room, room.spyId);
assert.strictEqual(spyView.self.isSpy, true);
assert.strictEqual(spyView.self.location, null, '间谍端真实地点必须为 null');
assert.strictEqual(spyView.self.role, '间谍 (Spy)');

// 5. 平民视角脱敏断言
const civilianId = Array.from(room.players.keys()).find(id => id !== room.spyId);
const civView = getSafePlayerView(room, civilianId);
assert.strictEqual(civView.self.isSpy, false);
assert.strictEqual(civView.self.location, room.targetLocation.name, '平民必须看到真实地点');
assert.notStrictEqual(civView.self.role, '间谍 (Spy)');

// 6. 他人信息绝密断言 (游戏进行中不可窥探他人角色)
civView.players.forEach(p => {
  assert.strictEqual(p.role, '???', '未结束时他人身份必须为 ???');
  assert.strictEqual(p.isSpy, undefined, '未结束时不得泄露谁是间谍');
});

// 6.1 候选地点数据脱敏断言 (Roles 数组不得下发给客户端，防止静态数据泄露)
civView.allLocations.forEach(loc => {
  assert.strictEqual(loc.roles, undefined, '下发给客户端的候选地点对象不得包含内部 roles 数组');
  assert(loc.id && loc.name && loc.icon, '候选地点基本元数据完整');
});

// 7. 指控与投票流转断言 (暂停倒计时)
assert.strictEqual(room.gameState.isPaused, false);
const accuseResult = handleAccuse(room, civilianId, room.spyId);
assert(accuseResult.success, '发起指控应成功');
assert.strictEqual(room.gameState.phase, PHASES.PAUSED_ACCUSE);
assert.strictEqual(room.gameState.isPaused, true, '发起指控时倒计时必须暂停');

// 7.1 重复指控拦截测试 (每人每局限 1 次)
const duplicateAccuse = handleAccuse(room, civilianId, room.spyId);
assert.strictEqual(duplicateAccuse.success, false, '同一玩家不得在一局内重复发起指控');

// 8. 投票流程 (全票赞成抓出真正间谍 -> 转入 SPY_GUESSING 反击)
const otherVoters = Array.from(room.players.keys()).filter(id => id !== room.spyId && id !== civilianId);
otherVoters.forEach(vid => {
  handleVoteAccuse(room, vid, true);
});
assert.strictEqual(room.gameState.phase, PHASES.SPY_GUESSING, '指控间谍全票通过后应进入间谍猜地点反击阶段');

// 9. 间谍猜地点判定 (猜错 -> 平民获胜)
const wrongGuess = handleSpyGuess(room, 'wrong_location_id');
assert.strictEqual(wrongGuess.isCorrect, false);
assert.strictEqual(room.gameState.phase, PHASES.GAME_OVER);
assert.strictEqual(room.gameState.winner, 'CIVILIAN');

// 10. 复盘视角全公开断言
const overView = getSafePlayerView(room, civilianId);
assert.strictEqual(overView.settlement.winner, 'CIVILIAN');
assert.strictEqual(overView.players.find(p => p.id === room.spyId).isSpy, true, '结算时公开间谍');

// 11. 再来一局重置断言
resetRoomForNextGame(room);
assert.strictEqual(room.gameState.phase, PHASES.LOBBY);
assert.strictEqual(room.spyId, null);

// 12. 附加分支测试 A: 间谍猜对直接获胜
startGameForRoom(room, { durationMinutes: 6 });
const correctGuess = handleSpyGuess(room, room.targetLocation.id);
assert.strictEqual(correctGuess.isCorrect, true);
assert.strictEqual(room.gameState.phase, PHASES.GAME_OVER);
assert.strictEqual(room.gameState.winner, 'SPY', '间谍猜对地点时间谍获胜');

// 13. 附加分支测试 B: 误指控平民 -> 间谍直接获胜
resetRoomForNextGame(room);
startGameForRoom(room, { durationMinutes: 6 });
const civs = Array.from(room.players.keys()).filter(id => id !== room.spyId);
const accuserCiv = civs[0];
const innocentCiv = civs[1];
const thirdVoters = Array.from(room.players.keys()).filter(id => id !== innocentCiv && id !== accuserCiv);

handleAccuse(room, accuserCiv, innocentCiv);
assert.strictEqual(room.gameState.phase, PHASES.PAUSED_ACCUSE);
thirdVoters.forEach(vid => {
  handleVoteAccuse(room, vid, true);
});
assert.strictEqual(room.gameState.phase, PHASES.GAME_OVER, '误指控平民达成共识后游戏直接结束');
assert.strictEqual(room.gameState.winner, 'SPY', '误指控平民后间谍直接获胜');

// 14. 附加分支测试 C: 投票未全票通过 -> 恢复 PLAYING 并恢复倒计时
resetRoomForNextGame(room);
startGameForRoom(room, { durationMinutes: 6 });
const currentCivs = Array.from(room.players.keys()).filter(id => id !== room.spyId);
handleAccuse(room, currentCivs[0], room.spyId);
assert.strictEqual(room.gameState.isPaused, true);
// 有人投反对票
const otherVoterList = Array.from(room.players.keys()).filter(id => id !== room.spyId && id !== currentCivs[0]);
handleVoteAccuse(room, otherVoterList[0], false);
assert.strictEqual(room.gameState.phase, PHASES.PLAYING, '未全票通过应恢复 PLAYING');
assert.strictEqual(room.gameState.isPaused, false, '未全票通过应解除倒计时暂停');

console.log('✅ 服务端状态机与数据脱敏测试全部通过！');
