const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const assert = require('assert');
const { setupWerewolf } = require('./games/werewolf/server');

async function runWerewolfGodModeTest() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  setupWerewolf(io, app);

  const PORT = 3998;
  await new Promise(r => server.listen(PORT, r));

  const url = `http://127.0.0.1:${PORT}/werewolf`;
  const sockets = [];

  function connectClient(name) {
    return new Promise((resolve) => {
      const s = Client(url, { reconnection: false, forceNew: true });
      s.on('connect', () => resolve(s));
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  try {
    console.log('--- 开始测试 Task 2: 上帝模式房间初始化、数据隔离与重连握手 ---');
    const sHost = await connectClient('法官小明');
    const guests = [];
    for (let i = 1; i <= 9; i++) {
      guests.push(await connectClient(`玩家${i}号`));
    }
    sockets.push(sHost, ...guests);

    let hostRoomData = null;
    let guest1RoomData = null;
    sHost.on('room_update', d => { hostRoomData = d; });
    guests[0].on('room_update', d => { guest1RoomData = d; });

    // 1. 创建开启上帝模式的房间
    const createRes = await new Promise(r => {
      sHost.emit('create_room', {
        id: 'p_god_host',
        name: '法官小明',
        settings: {
          isGodMode: true,
          boardPreset: '9_STANDARD',
          firstDaySheriffTiming: 'BEFORE_DEATH_ANNOUNCE',
          witchSelfSave: 'FIRST_NIGHT_ONLY',
          hasSheriff: true,
          winCondition: 'KILL_SIDE'
        }
      }, r);
    });
    assert.strictEqual(createRes.success, true);
    const code = createRes.roomCode;
    await sleep(100);

    assert.strictEqual(hostRoomData.settings.isGodMode, true, 'isGodMode 应为 true');
    assert.strictEqual(hostRoomData.settings.firstDaySheriffTiming, 'BEFORE_DEATH_ANNOUNCE');
    console.log('  ✅ [用例 1] 成功创建上帝模式房间并同步规则！');

    // 2. 9 名普通玩家加入房间
    for (let i = 0; i < 9; i++) {
      await new Promise(r => {
        guests[i].emit('join_room', {
          roomCode: code,
          player: { id: `p_g_${i+1}`, name: `玩家${i+1}号` }
        }, r);
      });
    }
    await sleep(200);
    assert.strictEqual(hostRoomData.players.length, 10, '房间总人数含法官应为10人');

    // 3. 上帝点击开始游戏
    const startRes = await new Promise(r => {
      sHost.emit('start_game', {}, r);
    });
    assert.strictEqual(startRes.success, true, '开局应成功');
    await sleep(200);

    // 4. 验证上帝全知大盘与数据隔离
    assert.strictEqual(hostRoomData.gameState.phase, 'NIGHT', '进入夜晚阶段');
    assert.strictEqual(hostRoomData.myPlayer.isGod, true, '房主应被标记为 isGod');
    assert.strictEqual(hostRoomData.myPlayer.isSpectator, true, '房主应为观众/裁判');

    // 上帝看参战玩家：共 9 名，且各自具有 seatNumber (1~9) 和真实角色 initialRole
    const playingInGodView = hostRoomData.players.filter(p => p.id !== 'p_god_host');
    assert.strictEqual(playingInGodView.length, 9);
    playingInGodView.forEach((p, idx) => {
      assert.strictEqual(p.seatNumber, idx + 1, `玩家 ${p.name} 座位号应为 ${idx + 1}`);
      assert.ok(p.initialRole, `上帝应能看到 ${p.name} 的真实角色: ${p.initialRole}`);
    });
    console.log('  ✅ [用例 2.1] 上帝获得全知大盘：9 名玩家物理座次与角色底牌一览无余！');

    // 普通玩家看别人：不能看到别人的角色！
    const othersInGuestView = guest1RoomData.players.filter(p => p.id !== 'p_g_1' && p.id !== 'p_god_host');
    assert.strictEqual(othersInGuestView.length, 8);
    othersInGuestView.forEach(p => {
      assert.strictEqual(p.initialRole, null, `普通玩家不应看到 ${p.name} 的底牌`);
    });
    assert.ok(guest1RoomData.myPlayer.initialRole, '普通玩家能看到自己的底牌');
    assert.strictEqual(guest1RoomData.myPlayer.seatNumber, 1, '玩家1号座位应为1');
    console.log('  ✅ [用例 2.2] 普通玩家端严格数据脱敏隔离生效！');

    // 5. 测试断线重连静默握手
    guests[0].disconnect();
    await sleep(200);
    const reconnectedGuest1 = await connectClient('玩家1号重连');
    sockets.push(reconnectedGuest1);
    const reconnRes = await new Promise(r => {
      reconnectedGuest1.emit('reconnect_room', {
        roomCode: code,
        playerId: 'p_g_1'
      }, r);
    });
    assert.strictEqual(reconnRes.success, true, '断线重连握手应成功');
    assert.strictEqual(reconnRes.roomData.myPlayer.id, 'p_g_1');
    assert.strictEqual(reconnRes.roomData.myPlayer.seatNumber, 1);
    assert.ok(reconnRes.roomData.myPlayer.initialRole, '重连后底牌无损恢复');
    console.log('  ✅ [用例 2.3] 普通玩家断线重连静默握手无损恢复！');

    console.log('🎉 Task 2 测试用例全部通过！');
  } finally {
    sockets.forEach(s => s.close());
    server.close();
  }
}

runWerewolfGodModeTest().catch(err => {
  console.error('❌ Task 2 测试失败:', err);
  process.exit(1);
});
