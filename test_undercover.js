// 谁是卧底 - 全流程自动化端到端测试脚本
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const { setupUndercover } = require('./games/undercover/server');

async function runUndercoverTest() {
  console.log('🚀 开始启动本地测试服务...');
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  setupUndercover(io, app);

  const PORT = 3899;
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`✅ 测试服务器已在端口 ${PORT} 启动`);

  const serverUrl = `http://127.0.0.1:${PORT}/undercover`;

  function waitEvent(socket, eventName, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`等待事件超时: ${eventName} (${timeoutMs}ms)`));
      }, timeoutMs);
      socket.once(eventName, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  try {
    // 1. 创建玩家 1 (房主)
    const hostSocket = Client(serverUrl, { reconnection: false, forceNew: true });
    await waitEvent(hostSocket, 'connect');
    console.log('✅ 房主客户端连接成功');

    // 2. 房主创建房间
    let roomCode = null;
    let currentRoomData = null;
    hostSocket.on('room_update', (data) => {
      currentRoomData = data;
    });

    const createRes = await new Promise((resolve) => {
      hostSocket.emit('create_room', {
        player: { id: 'p_host_1', name: '大侦探小明', avatar: '🕵️' },
        settings: {
          undercoverCount: 1,
          whiteboardCount: 0,
          speechTimeLimit: 5,
          revealRoleOnEliminate: true
        }
      }, resolve);
    });

    if (!createRes.success || !createRes.roomCode) {
      throw new Error(`创建房间失败: ${JSON.stringify(createRes)}`);
    }
    roomCode = createRes.roomCode;
    console.log(`✅ 成功创建房间，房间号: ${roomCode}`);

    if (createRes.roomData) {
      console.log(`✅ 创建房间回调成功包含 roomData，房主姓名: ${createRes.roomData.players[0].name}`);
      if (createRes.roomData.players[0].name !== '大侦探小明') {
        throw new Error('房主昵称未正确保留！');
      }
    }

    // 3. 测试添加电脑玩家 (AI Bots)
    console.log('🤖 正在添加第 1 个电脑玩家...');
    hostSocket.emit('add_ai');
    await sleep(300);

    console.log('🤖 正在添加第 2 个电脑玩家...');
    hostSocket.emit('add_ai');
    await sleep(300);

    if (!currentRoomData || currentRoomData.players.length !== 3) {
      throw new Error(`玩家人数不符合预期，当前: ${currentRoomData ? currentRoomData.players.length : 0}`);
    }
    const aiPlayers = currentRoomData.players.filter(p => p.isAi);
    if (aiPlayers.length !== 2) {
      throw new Error(`AI玩家数量不正确: ${aiPlayers.length}`);
    }
    console.log(`✅ 成功添加 2 名电脑玩家: ${aiPlayers.map(a => a.name).join('、')}`);

    // 4. 开始游戏
    console.log('🚀 房主开始游戏...');
    const startRes = await new Promise(resolve => {
      hostSocket.emit('start_game', resolve);
    });
    if (!startRes.success) {
      throw new Error(`开始游戏失败: ${startRes.message}`);
    }
    await sleep(500);

    if (currentRoomData.gameState.phase !== 'CARD_VIEW') {
      throw new Error(`游戏阶段未进入 CARD_VIEW，当前: ${currentRoomData.gameState.phase}`);
    }
    console.log('✅ 游戏已进入 CARD_VIEW（看牌阶段）');

    // 验证 AI 是否自动标为已看牌
    const aiViewed = currentRoomData.players.filter(p => p.isAi).every(p => p.hasViewedCard);
    if (!aiViewed) {
      throw new Error('电脑玩家未自动标为已看牌！');
    }
    console.log('✅ 电脑玩家已全自动准备就绪');

    // 5. 房主确认已看牌 -> 全员已看 -> 自动进入发言阶段
    console.log('🃏 房主确认查看底牌并准备发言...');
    hostSocket.emit('view_card_confirm');
    await sleep(600);

    if (currentRoomData.gameState.phase !== 'SPEAKING') {
      throw new Error(`全员看牌后未自动切换到 SPEAKING 阶段，当前: ${currentRoomData.gameState.phase}`);
    }
    console.log(`✅ 顺利切换到 SPEAKING（发言阶段）！第 ${currentRoomData.gameState.round} 轮发言开始`);
    console.log(`📋 本轮发言顺序: ${currentRoomData.gameState.speakingOrder.map(id => {
      const pl = currentRoomData.players.find(p => p.id === id);
      return pl ? `${pl.name}(${pl.isAi ? '电脑' : '人类'})` : id;
    }).join(' -> ')}`);

    // 6. 发言阶段处理：处理每个人发言
    let speakerDoneCount = 0;
    while (currentRoomData.gameState.phase === 'SPEAKING' && speakerDoneCount < 10) {
      const currentSpeakerId = currentRoomData.gameState.currentSpeakerId;
      const speaker = currentRoomData.players.find(p => p.id === currentSpeakerId);
      console.log(`🎙️ 当前发言人: ${speaker ? speaker.name : currentSpeakerId} (${speaker && speaker.isAi ? '电脑' : '人类'})`);

      if (speaker && !speaker.isAi) {
        // 人类发言
        hostSocket.emit('send_clue', '这是生活里常见的一个物品！');
        await sleep(400);
        console.log('🎤 人类玩家发送了打字描述线索，并点击结束发言');
        hostSocket.emit('finish_speaking');
      } else {
        // 电脑发言，等待其自动发言并过渡
        console.log('⏳ 等待电脑自动描述发言...');
        await sleep(3500);
      }
      speakerDoneCount++;
      await sleep(500);
    }

    // 7. 发言完毕应进入投票阶段
    console.log(`🗳️ 检查投票阶段: 当前阶段 = ${currentRoomData.gameState.phase}`);
    if (currentRoomData.gameState.phase !== 'VOTING') {
      throw new Error(`未顺利进入 VOTING 阶段，当前为: ${currentRoomData.gameState.phase}`);
    }
    console.log(`✅ 成功进入 VOTING 阶段！投票时限: ${currentRoomData.gameState.voteTimeLimit}s`);

    // 8. 投票：电脑会自动投票，房主进行投票
    console.log('⏳ 等待电脑投票...');
    await sleep(2500);

    // 房主对其中一个 AI 进行投票
    const targetAi = currentRoomData.players.find(p => p.isAi && p.isAlive);
    if (!targetAi) throw new Error('没有存活的电脑可供投票！');
    console.log(`🔥 房主投给: ${targetAi.name}`);
    hostSocket.emit('cast_vote', targetAi.id);

    // 等待投票自动结算
    console.log('⏳ 等待投票自动结算...');
    await sleep(2000);

    const postVotePhase = currentRoomData.gameState.phase;
    console.log(`📊 投票结算后阶段: ${postVotePhase}`);
    if (!['ELIMINATION', 'PK_SPEAKING', 'GAME_OVER'].includes(postVotePhase)) {
      throw new Error(`投票后阶段不正确: ${postVotePhase}`);
    }
    console.log(`✅ 投票结算成功！结算结果:`, currentRoomData.gameState.lastEliminated || currentRoomData.gameState.winner);

    // 9. 测试重置房间回到大厅
    console.log('🔄 测试房主重置房间回到大厅...');
    hostSocket.emit('reset_to_lobby');
    await sleep(600);

    if (currentRoomData.gameState.phase !== 'LOBBY') {
      throw new Error(`重置后未回到 LOBBY，当前: ${currentRoomData.gameState.phase}`);
    }
    console.log('✅ 房间已完美重置回到大厅，全员重置完毕！');

    // 10. 测试普通玩家加入与房主自动移交机制 (确保无死房/永远等待房主的问题)
    console.log('👥 正在测试玩家2加入与房主继承机制...');
    const guestSocket = Client(serverUrl, { reconnection: false, forceNew: true });
    await waitEvent(guestSocket, 'connect');
    let guestRoomData = null;
    guestSocket.on('room_update', (d) => { guestRoomData = d; });

    const joinRes = await new Promise((resolve) => {
      guestSocket.emit('join_room', {
        roomCode,
        player: { id: 'p_guest_2', name: '小红同学', avatar: '👧' }
      }, resolve);
    });

    if (!joinRes.success) throw new Error('玩家2加入房间失败');
    await sleep(300);

    const guestInList = guestRoomData.players.find(p => p.id === 'p_guest_2');
    if (!guestInList || guestInList.isHost) {
      throw new Error('新加入的玩家不应立即成为房主');
    }
    console.log('✅ 玩家2成功作为普通玩家加入，当前房主为原房主');

    // 测试原房主离开房间
    console.log('🚪 原房主主动离开房间，测试房主自动平滑移交给玩家2...');
    await new Promise((resolve) => {
      hostSocket.emit('leave_room', resolve);
    });
    hostSocket.close();
    await sleep(500);

    // 此时 guestSocket 应收到更新，且 guestRoomData.hostId 应为 p_guest_2
    if (!guestRoomData || guestRoomData.hostId !== 'p_guest_2') {
      throw new Error(`房主自动移交失败！当前房主: ${guestRoomData ? guestRoomData.hostId : 'null'}, 期望: p_guest_2`);
    }
    const promotedGuest = guestRoomData.players.find(p => p.id === 'p_guest_2');
    if (!promotedGuest || !promotedGuest.isHost) {
      throw new Error('玩家2在 players 列表中未被标记为房主');
    }
    console.log('✅ 房主自动转移机制完美生效！玩家2已被无缝提升为新房主！');

    // 11. 测试单人测试模式：少于3人时使用 autoFill 自动补齐电脑并开局
    console.log('⚡ 测试一键补齐电脑并直接开始游戏 (单人测试无障碍)...');
    // 先移除现有AI以模拟只有1人
    while (guestRoomData.players.some(p => p.isAi)) {
      guestSocket.emit('remove_ai');
      await sleep(200);
    }
    console.log(`当前房间仅剩在线人数: ${guestRoomData.players.filter(p => p.isOnline).length}`);

    const autoFillStartRes = await new Promise((resolve) => {
      guestSocket.emit('start_game', { autoFill: true }, resolve);
    });
    if (!autoFillStartRes.success) {
      throw new Error(`一键补齐电脑开局失败: ${autoFillStartRes.message}`);
    }
    await sleep(400);

    if (guestRoomData.gameState.phase !== 'CARD_VIEW') {
      throw new Error(`autoFill 开始游戏后阶段不正确: ${guestRoomData.gameState.phase}`);
    }
    console.log('✅ 一键补齐电脑开局成功！即便只有1名玩家测试也可瞬间开始游戏！');

    guestSocket.close();
    console.log('\n🎉🎉 所有自动化测试用例全部通过！谁是卧底房主控制与游戏体验极其稳定！');
  } finally {
    server.close();
  }
}

runUndercoverTest().catch(err => {
  console.error('❌ 测试未通过:', err);
  process.exit(1);
});
