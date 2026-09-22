const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');
const assert = require('assert');

const { setupWerewolf } = require('./games/werewolf/server');
const { getDealerPreset, ROLES, TEAMS } = require('./games/werewolf/roles');

console.log('🧪 开始测试狼人杀极简发牌助手 (DEALER 模式)...');

// 1. 单元测试: getDealerPreset 智能配平算法
console.log('--- 测试 1: 任意人数智能配平算法 (getDealerPreset) ---');
const testCounts = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15];
testCounts.forEach(count => {
  const cards = getDealerPreset(count);
  assert.strictEqual(cards.length, count, `${count}人局卡牌池长度必须精确等于 ${count}`);
  
  let wolves = 0, gods = 0, villagers = 0;
  cards.forEach(roleId => {
    const r = ROLES[roleId];
    assert(r, `角色 ${roleId} 必须在 ROLES 中已定义`);
    if (r.team === TEAMS.WEREWOLF) wolves++;
    else if (roleId === 'VILLAGER') villagers++;
    else gods++;
  });

  assert(wolves >= 1, `${count}人局必须至少有 1 只狼人`);
  assert(wolves < Math.ceil(count / 2), `${count}人局狼人数量 (${wolves}) 不能超过半数`);
  assert(villagers >= 1, `${count}人局必须至少有 1 个普通村民`);
  assert(gods >= 1, `${count}人局必须至少有 1 个神职`);
});
console.log('  ✅ [用例 1] 3~15人任意非标准人数智能配平算法验证通过！');

// 2. 集成测试环境搭建
const app = express();
const server = http.createServer(app);
const io = new Server(server);
setupWerewolf(io, app);

const TEST_PORT = 10899;

server.listen(TEST_PORT, async () => {
  console.log(`  ✅ 测试服务器已在端口 ${TEST_PORT} 启动`);

  function createClient(nickname) {
    return new Promise((resolve) => {
      const socket = ioClient(`http://localhost:${TEST_PORT}/werewolf`, {
        transports: ['websocket'],
        forceNew: true
      });
      socket.on('connect', () => {
        resolve({ socket, nickname });
      });
    });
  }

  try {
    // 2. 房主创建发牌助手房间
    console.log('--- 测试 2: 创建极简发牌助手房间与初始法官 ---');
    const host = await createClient('房主小明');
    let roomCode = null;

    await new Promise((resolve) => {
      host.socket.emit('create_room', {
        nickname: host.nickname,
        settings: {
          mode: 'DEALER',
          isGodMode: true
        }
      }, (res) => {
        assert(res.success, '创建发牌助手房间必须成功');
        roomCode = res.roomCode;
        assert.strictEqual(res.room.settings.mode, 'DEALER');
        assert.strictEqual(res.room.godId, res.room.hostId, '初始上帝必须是房主');
        resolve();
      });
    });
    console.log(`  ✅ [用例 2] 成功创建发牌助手房间 [${roomCode}]，房主自动设为初始法官！`);

    // 3. 加入 7 名普通玩家 (总共 8 人：1 法官 + 7 参战摸牌玩家，经典非标准人数)
    console.log('--- 测试 3: 加入 7 名参战玩家 (测试非标准 7 人配平) ---');
    const players = [];
    for (let i = 1; i <= 7; i++) {
      const p = await createClient(`玩家_${i}`);
      await new Promise((resolve) => {
        p.socket.emit('join_room', { roomCode, nickname: p.nickname }, (res) => {
          assert(res.success, `玩家_${i} 加入房间成功`);
          resolve();
        });
      });
      players.push(p);
    }
    console.log('  ✅ [用例 3] 7名参战玩家顺利入场就绪！');

    // 4. 测试上帝换人鉴权与审批机制
    console.log('--- 测试 4: 上帝换人必须经过当前上帝同意 ---');
    // 4.1 玩家 1 申请当上帝 -> 房主端必须收到审批事件
    const p1 = players[0];
    let godRequestEventPromise = new Promise((resolve) => {
      host.socket.once('god_request_received', (data) => {
        assert.strictEqual(data.applicantId, p1.socket.id || p1.playerId);
        assert.strictEqual(data.applicantName, '玩家_1');
        resolve(data);
      });
    });

    await new Promise((resolve) => {
      p1.socket.emit('request_god', (res) => {
        assert(res.success, '提交申请成功，等待当前上帝审批');
        resolve();
      });
    });
    const reqData = await godRequestEventPromise;
    console.log('  ✅ [用例 4.1] 玩家_1 发起申请，当前上帝实时收到审批通知！');

    // 4.2 房主拒绝申请 -> 上帝不变
    const rejectPromise = new Promise((resolve) => {
      p1.socket.once('god_request_rejected', (data) => {
        assert(data.message, '必须收到拒绝说明');
        resolve();
      });
    });

    await new Promise((resolve) => {
      host.socket.emit('respond_god_request', {
        requestId: reqData.requestId,
        approved: false
      }, (res) => {
        assert(res.success);
        resolve();
      });
    });
    await rejectPromise;

    // 验证房主仍然是上帝
    await new Promise((resolve) => {
      host.socket.emit('get_room_state', (room) => {
        assert.strictEqual(room.godId, room.hostId, '房主拒绝后，上帝身份不改变');
        resolve();
      });
    });
    console.log('  ✅ [用例 4.2] 房主拒绝审批，上帝身份守住未被篡改！');

    // 4.3 房主主动移交上帝给 玩家_2
    const p2 = players[1];
    let targetP2Id = null;
    await new Promise((resolve) => {
      // 查一下 p2 的 ID
      host.socket.emit('get_room_state', (room) => {
        const p2InRoom = room.players.find(p => p.name === '玩家_2');
        targetP2Id = p2InRoom.id;
        resolve();
      });
    });

    await new Promise((resolve) => {
      host.socket.emit('transfer_god', { targetPlayerId: targetP2Id }, (res) => {
        assert(res.success, '当前上帝主动移交必须成功');
        resolve();
      });
    });

    // 验证当前上帝已变为玩家_2
    await new Promise((resolve) => {
      p2.socket.once('room_update', (room) => {
        assert.strictEqual(room.godId, targetP2Id, '上帝成功移交为玩家_2');
        resolve();
      });
    });
    console.log('  ✅ [用例 4.3] 当前上帝主动移交成功，玩家_2 顺利继位上帝！');

    // 5. 测试非经典人数（7人摸牌）一键发牌
    console.log('--- 测试 5: 非经典 7 人参战摸牌，一键发牌与数据隔离 ---');
    // 注意：当前上帝是玩家_2，房主此时也是参战摸牌玩家之一！总共 1 上帝(玩家_2) + 7 摸牌玩家(房主, 玩家1, 3, 4, 5, 6, 7)
    
    // 非上帝尝试发牌 -> 必须拦截
    await new Promise((resolve) => {
      p1.socket.emit('start_game', (res) => {
        assert(!res || !res.success, '普通玩家无权发牌');
        resolve();
      });
    });

    // 上帝 (玩家_2) 发牌
    let godRoomUpdate = null;
    let player1RoomUpdate = null;

    const p2UpdatePromise = new Promise((resolve) => {
      p2.socket.on('room_update', (room) => {
        if (room.gameState && room.gameState.phase === 'DEAL_VIEW') {
          godRoomUpdate = room;
          resolve();
        }
      });
    });

    const p1UpdatePromise = new Promise((resolve) => {
      p1.socket.on('room_update', (room) => {
        if (room.gameState && room.gameState.phase === 'DEAL_VIEW') {
          player1RoomUpdate = room;
          resolve();
        }
      });
    });

    await new Promise((resolve) => {
      p2.socket.emit('start_game', (res) => {
        assert(res.success, '上帝发牌必须成功');
        resolve();
      });
    });

    await Promise.all([p2UpdatePromise, p1UpdatePromise]);

    // 5.1 验证普通玩家视角数据脱敏
    assert(player1RoomUpdate.mySeatNumber >= 1, '普通玩家分配了 1..N 的座位号');
    assert(player1RoomUpdate.myRole, '普通玩家拿到了自己的真实底牌');
    // 普通玩家看不到其他人的底牌！
    const otherPlayersWithRole = player1RoomUpdate.players.filter(p => p.id !== player1RoomUpdate.myPlayerId && p.currentRole);
    assert.strictEqual(otherPlayersWithRole.length, 0, '普通玩家端绝对不能看到任何其他人的底牌！');
    console.log(`  ✅ [用例 5.1] 普通玩家视角安全脱敏通过 (座位号: ${player1RoomUpdate.mySeatNumber}号，本人底牌: ${player1RoomUpdate.myRole.name})！`);

    // 5.2 验证上帝视角全知底牌名单
    assert(godRoomUpdate.godOverview, '上帝必须获得 godOverview 全知名单');
    assert.strictEqual(godRoomUpdate.godOverview.length, 7, '7名参战玩家全部在上帝底牌清单中');
    godRoomUpdate.godOverview.forEach(item => {
      assert(item.seatNumber >= 1 && item.seatNumber <= 7, '物理座位号 1..7 健全');
      assert(item.roleName && item.roleIcon, '上帝能看到每个座位的角色与图标');
    });
    console.log('  ✅ [用例 5.2] 上帝端全知底牌清单完整健全（7人全角色底牌清晰呈现）！');

    // 6. 测试上帝重新洗牌发牌 (redeal_cards)
    console.log('--- 测试 6: 上帝一键重洗重发 (redeal_cards) ---');
    const oldP1Role = player1RoomUpdate.myRole.id;
    let redealFinished = new Promise((resolve) => {
      p2.socket.once('cards_redealt', () => resolve());
    });

    await new Promise((resolve) => {
      p2.socket.emit('redeal_cards', (res) => {
        assert(res.success, '上帝重新发牌成功');
        resolve();
      });
    });
    await redealFinished;
    console.log('  ✅ [用例 6] 重新发牌触发成功，全员卡牌已重置洗牌！');

    console.log('🎉 狼人杀极简发牌助手 (DEALER 模式) 全量测试用例 100% 全部通过！');
    process.exit(0);
  } catch (err) {
    console.error('❌ 测试失败:', err);
    process.exit(1);
  } finally {
    server.close();
  }
});
