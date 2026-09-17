const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const assert = require('assert');
const { setupUndercover } = require('./games/undercover/server');

console.log('====================================================');
console.log('🔄 谁是卧底：看牌阶段房主“重新发牌/换一组词”专项测试');
console.log('====================================================\n');

async function runRedealCardsTest() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  setupUndercover(io, app);

  const PORT = 4005;
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
    sockets.push(s1, s2, s3);

    let hostRoomData = null;
    let redealtEventReceived = false;

    s1.on('room_update', d => { hostRoomData = d; });
    s2.on('cards_redealt', d => { redealtEventReceived = true; });

    // 1. 房主创建房间并加入其他玩家
    const createRes = await new Promise(r => {
      s1.emit('create_room', {
        player: { id: 'p_host', name: '房主小明' },
        settings: { undercoverCount: 1, whiteboardCount: 0, category: 'food' }
      }, r);
    });
    const code = createRes.roomCode;
    await new Promise(r => s2.emit('join_room', { roomCode: code, player: { id: 'p_user2', name: '玩家小红' } }, r));
    await new Promise(r => s3.emit('join_room', { roomCode: code, player: { id: 'p_user3', name: '玩家小刚' } }, r));
    await sleep(200);

    // 2. 开始游戏 -> 进入 CARD_VIEW
    await new Promise(r => s1.emit('start_game', r));
    await sleep(200);
    assert.strictEqual(hostRoomData.gameState.phase, 'CARD_VIEW');

    const firstWinningWord = hostRoomData.gameState.winningWord;
    const firstHostWord = clientStates['p_host'].myPlayer.word;
    console.log(`[测试 1] 首次发牌完成`);
    console.log(`  🃏 首次发牌平民底牌词: 「${firstWinningWord}」，房主底牌: 「${firstHostWord}」`);

    // 玩家小红确认看牌
    s2.emit('view_card_confirm', { roomCode: code, playerId: 'p_user2' });
    await sleep(200);
    const p2Before = hostRoomData.players.find(p => p.id === 'p_user2');
    assert.strictEqual(p2Before.hasViewedCard, true, '小红已标记为看过牌');

    // 3. 非房主小红尝试重新发牌 -> 校验安全拦截
    console.log('\n[测试 2] 非房主越权重新发牌拦截');
    const unauthorizedRes = await new Promise(r => {
      s2.emit('redeal_cards', { roomCode: code, playerId: 'p_user2' }, r);
    });
    assert.strictEqual(unauthorizedRes.success, false, '非房主应被拒绝');
    assert.strictEqual(hostRoomData.gameState.winningWord, firstWinningWord, '底牌词不应改变');
    console.log('  ✅ 非房主尝试重新发牌被服务端安全拦截！');

    // 4. 房主不满意当前词，点击重新发牌
    console.log('\n[测试 3] 房主重新发牌（换新词 + 重新洗牌身份 + 重置全员看牌状态）');
    redealtEventReceived = false;
    const redealRes = await new Promise(r => {
      s1.emit('redeal_cards', { roomCode: code, playerId: 'p_host' }, r);
    });
    assert.strictEqual(redealRes.success, true, '房主重新发牌应成功');
    await sleep(300);

    assert.strictEqual(redealtEventReceived, true, '全房间客户端应收到 cards_redealt 广播通知');
    const secondWinningWord = hostRoomData.gameState.winningWord;
    console.log(`  🔄 重新发牌后新平民底牌词: 「${secondWinningWord}」`);
    assert.notStrictEqual(firstWinningWord, secondWinningWord, '新抽取的词对绝对不能与上一轮重复！');

    // 验证全员看牌状态已重置
    const p2After = hostRoomData.players.find(p => p.id === 'p_user2');
    assert.strictEqual(p2After.hasViewedCard, false, '重新发牌后玩家看牌状态必须重置为未看！');
    assert.strictEqual(hostRoomData.gameState.phase, 'CARD_VIEW', '依然保持在看牌阶段');
    console.log('  ✅ 成功换了一组全新词语，且全员看牌状态与倒计时安全重置！');

    // 5. 换词后正常开启发言阶段
    console.log('\n[测试 4] 换词后正常推进游戏至发言阶段');
    s1.emit('force_start_speaking', { roomCode: code, playerId: 'p_host' });
    await sleep(300);
    assert.strictEqual(hostRoomData.gameState.phase, 'SPEAKING', '成功进入 SPEAKING 阶段');
    console.log('  ✅ 换词后正常切入 SPEAKING 发言阶段！');

    // 6. 验证在发言阶段不能再调用重新发牌
    console.log('\n[测试 5] 发言阶段禁止重新发牌拦截');
    const speakingRedealRes = await new Promise(r => {
      s1.emit('redeal_cards', { roomCode: code, playerId: 'p_host' }, r);
    });
    assert.strictEqual(speakingRedealRes.success, false, '发言阶段不允许重新发牌');
    console.log('  ✅ 发言阶段房主尝试 redeal_cards 被正确拦截拒绝！');

    console.log('\n====================================================');
    console.log('🏆 看牌阶段“重新发牌/换一组词”全部测试顺利通过！');
    console.log('====================================================');
  } finally {
    sockets.forEach(s => s.close());
    server.close();
  }
}

runRedealCardsTest().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('❌ 测试执行异常:', err);
  process.exit(1);
});
