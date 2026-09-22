// test_spyfall_e2e.js
// 间谍危机 (Spyfall) 端到端全流程自动化集成测试 (E2E)
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const assert = require('assert');
const { setupSpyfall, PHASES, rooms } = require('./games/spyfall/server');

console.log('🧪 开始间谍危机 (Spyfall) 端到端全流程集成测试 (E2E)...');

/**
 * 封装测试客户端，便于异步等待指定事件与条件
 */
class TestClient {
  constructor(id, name, avatar) {
    this.id = id;
    this.name = name;
    this.avatar = avatar;
    this.socket = null;
    this.latestRoomUpdate = null;
    this.updateListeners = [];
  }

  async connect(url) {
    this.socket = Client(url, { reconnection: false, forceNew: true });
    this.socket.on('room_update', (data) => {
      this.latestRoomUpdate = data;
      for (let i = this.updateListeners.length - 1; i >= 0; i--) {
        const item = this.updateListeners[i];
        if (item.predicate(data)) {
          clearTimeout(item.timer);
          this.updateListeners.splice(i, 1);
          item.resolve(data);
        }
      }
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name} 连接测试服务器超时`)), 5000);
      this.socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  waitForUpdate(predicate, timeoutMs = 5000) {
    if (this.latestRoomUpdate && predicate(this.latestRoomUpdate)) {
      return Promise.resolve(this.latestRoomUpdate);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.updateListeners.findIndex(l => l.timer === timer);
        if (idx !== -1) this.updateListeners.splice(idx, 1);
        reject(new Error(`${this.name} 等待 room_update 满足条件超时 (${timeoutMs}ms)`));
      }, timeoutMs);

      this.updateListeners.push({ predicate, resolve, timer });
    });
  }

  emit(event, data = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name} emit(${event}) 响应超时`)), 5000);
      this.socket.emit(event, data, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.close();
      this.socket = null;
    }
  }
}

async function runE2ETest() {
  // 1. 在动态端口上初始化并挂载 Express + Socket.IO 服务器
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  setupSpyfall(io, app);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`🔌 测试服务器已在动态端口 ${port} 启动`);
  const serverUrl = `http://127.0.0.1:${port}/spyfall`;

  // 2. 初始化 4 名测试玩家
  const host = new TestClient('p_host', '玩家1_房主', '🤠');
  const guest1 = new TestClient('p_civ1', '玩家2_特工', '🕵️');
  const guest2 = new TestClient('p_civ2', '玩家3_特工', '🦊');
  const guest3 = new TestClient('p_civ3', '玩家4_特工', '🤖');
  const clients = [host, guest1, guest2, guest3];

  try {
    // ----------------------------------------------------------------
    // Flow 1: 创建房间、多端加入、开启对局与脱敏视图断言
    // ----------------------------------------------------------------
    console.log('1️⃣ [Flow 1] 测试创建房间、加入房间、开始对局与四端脱敏视角...');
    await Promise.all(clients.map(c => c.connect(serverUrl)));
    console.log('  ✓ 4 位客户端均成功连接至 /spyfall 命名空间');

    // 房主创建房间
    const createRes = await host.emit('create_room', {
      player: { id: host.id, name: host.name, avatar: host.avatar },
      settings: { durationMinutes: 8 }
    });
    assert(createRes && createRes.success, '房主创建房间必须成功');
    const roomCode = createRes.roomCode;
    assert(roomCode, '创建房间必须返回房间代码');
    await host.waitForUpdate(u => u.roomCode === roomCode && u.gameState.phase === PHASES.LOBBY);

    // 3 名玩家相继加入房间
    for (const guest of [guest1, guest2, guest3]) {
      const joinRes = await guest.emit('join_room', {
        roomCode,
        player: { id: guest.id, name: guest.name, avatar: guest.avatar }
      });
      assert(joinRes && joinRes.success, `${guest.name} 加入房间应成功`);
    }

    // 验证所有客户端都同步到了 4 人大厅状态
    await Promise.all(clients.map(c => c.waitForUpdate(u => u.players && u.players.length === 4 && u.gameState.phase === PHASES.LOBBY)));
    console.log('  ✓ 4 名玩家成功在大厅就绪');

    // 房主开启游戏（非房主开启应被拦截）
    const unauthorizedStart = await guest1.emit('start_game', { roomCode });
    assert.strictEqual(unauthorizedStart.success, false, '非房主不得开启游戏');

    const startRes = await host.emit('start_game', { roomCode, settings: { durationMinutes: 8 } });
    assert(startRes && startRes.success, '房主开启游戏应成功');

    // 等待所有玩家收到 PLAYING 状态的 room_update
    await Promise.all(clients.map(c => c.waitForUpdate(u => u.gameState.phase === PHASES.PLAYING)));
    console.log('  ✓ 游戏成功开启，所有客户端已同步进入 PLAYING 阶段');

    // 验证严格视角脱敏与不变量
    const spyClients = clients.filter(c => c.latestRoomUpdate.self.isSpy === true);
    const civClients = clients.filter(c => c.latestRoomUpdate.self.isSpy === false);
    assert.strictEqual(spyClients.length, 1, '必须有且仅有 1 名间谍');
    assert.strictEqual(civClients.length, 3, '必须有且仅有 3 名平民');
    const spyClient = spyClients[0];

    // 间谍视角
    const spyUpdate = spyClient.latestRoomUpdate;
    assert.strictEqual(spyUpdate.self.isSpy, true, '间谍 self.isSpy 必须为 true');
    assert.strictEqual(spyUpdate.self.location, null, '间谍端真实地点必须为 null (严格脱敏)');
    assert.strictEqual(spyUpdate.self.role, '间谍 (Spy)', '间谍角色说明正确');

    // 平民视角
    const targetLocationName = civClients[0].latestRoomUpdate.self.location;
    assert(targetLocationName && typeof targetLocationName === 'string', '平民必须获知真实地点名称');
    civClients.forEach(civ => {
      const u = civ.latestRoomUpdate;
      assert.strictEqual(u.self.isSpy, false, '平民 self.isSpy 必须为 false');
      assert.strictEqual(u.self.location, targetLocationName, '所有平民看到的地点必须一致');
      assert(u.self.role && u.self.role !== '间谍 (Spy)', '平民必须获得非间谍的具体职业');
    });

    // 混淆地点池脱敏断言
    clients.forEach(c => {
      const locs = c.latestRoomUpdate.allLocations;
      assert(locs.length >= 16 && locs.length <= 18, `候选地点池数量应在 16~18 之间，实际: ${locs.length}`);
      locs.forEach(l => {
        assert.strictEqual(l.roles, undefined, '候选地点对象不得包含内部 roles 数组 (防止静态脱敏泄露)');
        assert(l.id && l.name && l.icon, '候选地点元数据必须完整');
      });
      assert(locs.some(l => l.name === targetLocationName), '真实地点必须存在于下发的候选池中');
    });

    // 他人身份绝密不变量
    clients.forEach(c => {
      const others = c.latestRoomUpdate.players.filter(p => p.id !== c.id);
      others.forEach(other => {
        assert.strictEqual(other.role, '???', '游戏中他人身份角色必须被脱敏为 ???');
        assert.strictEqual(other.isSpy, undefined, '游戏中他人 isSpy 属性不得泄露');
      });
    });

    // 时钟与首问人断言
    assert.strictEqual(host.latestRoomUpdate.gameState.isPaused, false, '进行中时钟不得处于暂停状态');
    assert(host.latestRoomUpdate.gameState.expiresAt > Date.now(), '绝对时钟有效且在未来');
    assert(clients.some(c => c.id === host.latestRoomUpdate.gameState.firstQuestionerId), '必须指定一位合法的首问玩家');

    console.log('  ✓ Flow 1: 创建房间、加入房间、开始对局与四端脱敏视角验证全部通过');

    // ----------------------------------------------------------------
    // Flow 2: 发起指控 -> 投票全票通过 -> 间谍猜地点反击 -> 间谍猜错 -> 平民获胜
    // ----------------------------------------------------------------
    console.log('2️⃣ [Flow 2] 测试发起指控、投票全票通过、间谍反击猜错地点、平民获胜与全员结算复盘...');

    // 指控合法性校验（不能指控自己）
    const selfAccuse = await civClients[0].emit('initiate_accuse', { targetPlayerId: civClients[0].id });
    assert.strictEqual(selfAccuse.success, false, '玩家不能指控自己');

    // 由平民1号发起对真正间谍的指控
    const accuser = civClients[0];
    const accuseRes = await accuser.emit('initiate_accuse', { targetPlayerId: spyClient.id });
    assert(accuseRes && accuseRes.success, '发起对间谍的指控应成功');

    // 等待所有玩家收到 PAUSED_ACCUSE 阶段
    await Promise.all(clients.map(c => c.waitForUpdate(u => u.gameState.phase === PHASES.PAUSED_ACCUSE)));
    assert.strictEqual(accuser.latestRoomUpdate.gameState.isPaused, true, '发起指控时倒计时必须冻结');

    // 同局内不可重复指控
    const dupAccuse = await accuser.emit('initiate_accuse', { targetPlayerId: spyClient.id });
    assert.strictEqual(dupAccuse.success, false, '同一局内不可重复发起指控');

    // 被指控的间谍不能参与投票
    const suspectVote = await spyClient.emit('vote_accuse', { agree: true });
    assert.strictEqual(suspectVote.success, false, '被指控者不得参与投票');

    // 剩余平民参与投票（全票赞成）
    const v1 = await civClients[1].emit('vote_accuse', { agree: true });
    assert(v1 && v1.success, '平民2投票应成功');
    assert.strictEqual(v1.result.voteFinished, false, '尚未全员表决完毕');

    const v2 = await civClients[2].emit('vote_accuse', { agree: true });
    assert(v2 && v2.success, '平民3投票应成功');
    assert.strictEqual(v2.result.voteFinished, true, '全员赞成表决完毕');
    assert.strictEqual(v2.result.consensus, true, '达成全票赞成');
    assert.strictEqual(v2.result.suspectIsSpy, true, '被指控者确为间谍');
    assert.strictEqual(v2.result.nextPhase, PHASES.SPY_GUESSING);

    // 等待所有玩家进入 SPY_GUESSING
    await Promise.all(clients.map(c => c.waitForUpdate(u => u.gameState.phase === PHASES.SPY_GUESSING)));
    console.log('  ✓ 全票抓出间谍，顺利转入 SPY_GUESSING 反击阶段');

    // 平民不得猜地点
    const civGuess = await civClients[0].emit('spy_guess_location', { locationId: 'any_loc' });
    assert.strictEqual(civGuess.success, false, '非间谍玩家不得调用猜地点');

    // 间谍猜测错误地点
    const wrongGuessRes = await spyClient.emit('spy_guess_location', { locationId: '__wrong_location_id_999__' });
    assert(wrongGuessRes && wrongGuessRes.success, '间谍提交猜地点应成功');
    assert.strictEqual(wrongGuessRes.isCorrect, false, '间谍应猜错地点');
    assert.strictEqual(wrongGuessRes.winner, 'CIVILIAN', '猜错后平民胜出');

    // 等待所有玩家收到 GAME_OVER
    await Promise.all(clients.map(c => c.waitForUpdate(u => u.gameState.phase === PHASES.GAME_OVER)));

    // 复盘全员解密断言
    clients.forEach(c => {
      const u = c.latestRoomUpdate;
      assert.strictEqual(u.gameState.phase, PHASES.GAME_OVER);
      assert.strictEqual(u.gameState.winner, 'CIVILIAN');
      assert(u.settlement, '结算数据必须下发');
      assert.strictEqual(u.settlement.winner, 'CIVILIAN');
      assert.strictEqual(u.settlement.spy.id, spyClient.id);
      assert(u.settlement.targetLocation && u.settlement.targetLocation.name, '结算真实地点必须公开');
      const revealedSpy = u.players.find(p => p.id === spyClient.id);
      assert.strictEqual(revealedSpy.isSpy, true, '结算时间谍身份对全员公开');
    });

    console.log('  ✓ Flow 2: 抓出间谍、全票赞成、间谍猜错地点、平民获胜与全员结算复盘验证全部通过');

    // ----------------------------------------------------------------
    // Flow 3: 重新开局 -> 间谍主动猜对地点 -> 间谍获胜
    // ----------------------------------------------------------------
    console.log('3️⃣ [Flow 3] 测试房间重置、再来一局、间谍识破真实地点与间谍获胜...');

    // 非房主不得重置开局
    const guestRestart = await guest1.emit('restart_game');
    assert.strictEqual(guestRestart.success, false, '非房主不得重置开局');

    // 房主重置开局回到大厅
    const hostRestart = await host.emit('restart_game');
    assert(hostRestart && hostRestart.success, '房主重置开局应成功');

    // 等待所有玩家回到 LOBBY
    await Promise.all(clients.map(c => c.waitForUpdate(u => u.gameState.phase === PHASES.LOBBY)));
    clients.forEach(c => {
      assert.strictEqual(c.latestRoomUpdate.self.role, null, '重置后角色清空');
      assert.strictEqual(c.latestRoomUpdate.self.isSpy, false, '重置后间谍标识清空');
      assert.strictEqual(c.latestRoomUpdate.currentAccuse, null, '指控数据重置');
    });

    // 房主开启第 2 局游戏
    const start2Res = await host.emit('start_game', { roomCode, settings: { durationMinutes: 6 } });
    assert(start2Res && start2Res.success, '新一轮游戏开启应成功');
    await Promise.all(clients.map(c => c.waitForUpdate(u => u.gameState.phase === PHASES.PLAYING)));

    // 获取第 2 局的间谍与平民
    const round2Spy = clients.find(c => c.latestRoomUpdate.self.isSpy === true);
    const round2Civ = clients.find(c => c.latestRoomUpdate.self.isSpy === false);
    assert(round2Spy, '新一轮必须分配间谍');
    assert(round2Civ, '新一轮必须分配平民');

    // 平民获悉真实地点，由此获取真实地点 ID
    const round2TargetLocName = round2Civ.latestRoomUpdate.self.location;
    const targetLocationObj = round2Civ.latestRoomUpdate.allLocations.find(l => l.name === round2TargetLocName);
    assert(targetLocationObj && targetLocationObj.id, '真实地点必须在候选池中');
    const realLocationId = targetLocationObj.id;

    // 间谍直接猜测正确地点并反杀获胜
    const correctGuessRes = await round2Spy.emit('spy_guess_location', { locationId: realLocationId });
    assert(correctGuessRes && correctGuessRes.success, '间谍猜地点请求应成功');
    assert.strictEqual(correctGuessRes.isCorrect, true, '间谍应猜对真实地点');
    assert.strictEqual(correctGuessRes.winner, 'SPY', '间谍猜对直接获胜');

    // 等待所有玩家收到 GAME_OVER
    await Promise.all(clients.map(c => c.waitForUpdate(u => u.gameState.phase === PHASES.GAME_OVER)));
    clients.forEach(c => {
      const u = c.latestRoomUpdate;
      assert.strictEqual(u.gameState.winner, 'SPY');
      assert.strictEqual(u.settlement.winner, 'SPY');
      assert.strictEqual(u.settlement.spy.id, round2Spy.id);
      assert.strictEqual(u.settlement.targetLocation.id, realLocationId);
    });

    console.log('  ✓ Flow 3: 房间重置、再来一局、间谍识破真实地点、间谍获胜验证全部通过');

  } finally {
    // 4. 清理资源：断开客户端、关闭服务器、清空房间
    console.log('🧹 正在清理 Socket 连接与测试服务...');
    for (const c of clients) {
      c.disconnect();
    }
    io.close();
    await new Promise(resolve => server.close(resolve));

    for (const r of rooms.values()) {
      if (r.gameEndTimer) clearTimeout(r.gameEndTimer);
      if (r.hostMigrateTimer) clearTimeout(r.hostMigrateTimer);
    }
    rooms.clear();
  }

  console.log('\n🎉 间谍危机全流程自动化端到端测试全部通过！');
}

runE2ETest()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ E2E 测试未通过:', err);
    process.exit(1);
  });
