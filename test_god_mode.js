const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const assert = require('assert');
const { setupUndercover } = require('./games/undercover/server');

async function runGodModeTest() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  setupUndercover(io, app);

  const PORT = 3997;
  await new Promise(r => server.listen(PORT, r));

  const url = `http://127.0.0.1:${PORT}/undercover`;
  const sockets = [];

  function connectClient(id, name) {
    return new Promise((resolve) => {
      const s = Client(url, { reconnection: false, forceNew: true });
      s.on('connect', () => resolve(s));
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  try {
    const sHost = await connectClient('p_god_host', '法官小明');
    const sGuest1 = await connectClient('p_g1', '玩家小红');
    const sGuest2 = await connectClient('p_g2', '玩家小刚');
    const sGuest3 = await connectClient('p_g3', '玩家小李');
    sockets.push(sHost, sGuest1, sGuest2, sGuest3);

    let hostRoomData = null;
    let guest1RoomData = null;
    sHost.on('room_update', d => { hostRoomData = d; });
    sGuest1.on('room_update', d => { guest1RoomData = d; });

    // 1. 房主创建房间并开启上帝模式
    const createRes = await new Promise(r => {
      sHost.emit('create_room', {
        player: { id: 'p_god_host', name: '法官小明' },
        settings: { isGodMode: true, undercoverCount: 1, whiteboardCount: 0 }
      }, r);
    });
    const code = createRes.roomCode;
    console.log(`[测试 1] 开启上帝模式创建房间: ${code}`);
    assert.strictEqual(hostRoomData.settings.isGodMode, true, '房间配置中 isGodMode 应为 true');
    console.log('  ✅ 成功配置 isGodMode: true！');

    // 2. 3 名普通玩家加入
    await new Promise(r => sGuest1.emit('join_room', { roomCode: code, player: { id: 'p_g1', name: '玩家小红' } }, r));
    await new Promise(r => sGuest2.emit('join_room', { roomCode: code, player: { id: 'p_g2', name: '玩家小刚' } }, r));
    await new Promise(r => sGuest3.emit('join_room', { roomCode: code, player: { id: 'p_g3', name: '玩家小李' } }, r));
    await sleep(200);

    // 3. 房主使用上帝自定义出题开始游戏
    console.log('[测试 2] 房主自定义出题并开局 (平民词: 可口可乐, 卧底词: 百事可乐)...');
    const startRes = await new Promise(r => {
      sHost.emit('start_game', {
        godCustomWords: {
          civilianWord: '可口可乐',
          undercoverWord: '百事可乐'
        }
      }, r);
    });
    assert.strictEqual(startRes && startRes.success, true, '上帝模式开局应该成功');
    await sleep(300);

    // 4. 验证房主身份与全知上帝视角
    console.log('[测试 3] 验证房主全知上帝视角与普通玩家信息隔离...');
    assert.strictEqual(hostRoomData.gameState.phase, 'CARD_VIEW', '阶段应进入看牌 CARD_VIEW');
    assert.strictEqual(hostRoomData.myPlayer.role, 'GOD', '房主角色应为 GOD');
    assert.strictEqual(hostRoomData.myPlayer.isSpectator, true, '房主应为观众/裁判');

    // 房主视角：每个其他玩家的 role 与 word 都应该清晰可见！
    const hostViewsOfPlayers = hostRoomData.players.filter(p => p.id !== 'p_god_host');
    assert.strictEqual(hostViewsOfPlayers.length, 3, '除房主外有3名参战玩家');
    hostViewsOfPlayers.forEach(p => {
      assert.ok(p.role, `房主应能看到 ${p.name} 的角色`);
      assert.ok(p.word === '可口可乐' || p.word === '百事可乐', `房主应能看到 ${p.name} 的真实词语`);
    });
    console.log('  ✅ 房主获得全知上帝视角：所有玩家的角色与底牌一览无余！');

    // 普通玩家视角：不能看到别人的 role 和 word
    const guest1ViewsOfOthers = guest1RoomData.players.filter(p => p.id !== 'p_g1' && p.id !== 'p_god_host');
    guest1ViewsOfOthers.forEach(p => {
      assert.strictEqual(p.role, null, `普通玩家不应看到 ${p.name} 的角色`);
      assert.strictEqual(p.word, null, `普通玩家不应看到 ${p.name} 的词语`);
    });
    console.log('  ✅ 普通玩家信息隔离生效：无法偷看其他玩家底牌！');

    // 5. 验证发言顺序不含房主
    console.log('[测试 4] 房主推进进入发言阶段，验证发言顺序...');
    sHost.emit('force_start_speaking', { roomCode: code, playerId: 'p_god_host' });
    await sleep(300);
    assert.strictEqual(hostRoomData.gameState.phase, 'SPEAKING', '应切入 SPEAKING');
    assert.ok(!hostRoomData.gameState.speakingOrder.includes('p_god_host'), '发言轮次不应包含上帝房主');
    console.log('  ✅ 上帝房主不计入发言轮次，玩家轮流发言！');

    // 6. 验证上帝裁判特权：直接裁决淘汰某玩家
    console.log('[测试 5] 上帝房主行使裁决权淘汰玩家小李 (p_g3)...');
    const judgeRes = await new Promise(r => {
      sHost.emit('judge_eliminate_player', {
        targetPlayerId: 'p_g3',
        reason: '违规贴脸，法官直接裁决淘汰'
      }, r);
    });
    assert.strictEqual(judgeRes && judgeRes.success, true, '法官裁决应该成功');
    await sleep(300);
    const eliminatedP3 = hostRoomData.players.find(p => p.id === 'p_g3');
    assert.strictEqual(eliminatedP3.isAlive, false, '玩家小李应被裁决淘汰出局');
    console.log('  ✅ 法官裁决特权生效，玩家已被成功淘汰！');

    console.log('\n🎉 上帝模式全部用例验证通过！');
  } finally {
    sockets.forEach(s => s.close());
    server.close();
  }
}

runGodModeTest().catch(err => {
  console.error('❌ 上帝模式测试失败:', err);
  process.exit(1);
});
