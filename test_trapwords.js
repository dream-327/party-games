// 害你在心口难开 - 全流程自动化端到端测试脚本
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const { setupTrapwords } = require('./games/trapwords/server');

async function runTrapwordsTest() {
  console.log('🚀 开始启动本地测试服务...');
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  setupTrapwords(io, app);

  const PORT = 3988;
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`✅ 测试服务器已在端口 ${PORT} 启动`);

  const serverUrl = `http://127.0.0.1:${PORT}/trapwords`;

  function waitEvent(socket, eventName, timeoutMs = 6000) {
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
    // 1. 创建房主客户端
    const hostSocket = Client(serverUrl, { reconnection: false, forceNew: true });
    await waitEvent(hostSocket, 'connect');
    console.log('✅ 房主 Socket 连接成功');

    // 2. 房主创建房间
    let hostRoomData = null;
    hostSocket.on('room_update', (data) => { hostRoomData = data; });

    const createRes = await new Promise((resolve) => {
      hostSocket.emit('create_room', {
        player: { id: 'p_host', name: '房主大明', avatar: '😎' },
        settings: { category: 'all' }
      }, resolve);
    });

    if (!createRes || !createRes.success) {
      throw new Error(`创建房间失败: ${JSON.stringify(createRes)}`);
    }
    const roomCode = createRes.roomCode;
    console.log(`✅ 房主创建房间成功，房间码: ${roomCode}`);

    // 3. 玩家 2 加入房间
    const player2Socket = Client(serverUrl, { reconnection: false, forceNew: true });
    await waitEvent(player2Socket, 'connect');
    let p2RoomData = null;
    player2Socket.on('room_update', (data) => { p2RoomData = data; });

    const joinRes = await new Promise((resolve) => {
      player2Socket.emit('join_room', {
        roomCode,
        player: { id: 'p_player2', name: '戏精小红', avatar: '🦊' }
      }, resolve);
    });

    if (!joinRes || !joinRes.success) {
      throw new Error(`玩家2加入房间失败: ${JSON.stringify(joinRes)}`);
    }
    console.log('✅ 玩家2成功加入房间');

    await sleep(200);

    // 4. 房主添加电脑测试玩家
    await new Promise((resolve) => hostSocket.emit('add_ai', {}, resolve));
    await sleep(200);

    if (hostRoomData.players.length !== 3) {
      throw new Error(`添加电脑失败，当前玩家数: ${hostRoomData.players.length}`);
    }
    console.log(`✅ 成功添加电脑玩家，当前房间人数: ${hostRoomData.players.length}`);

    // 5. 房主修改词库设置
    await new Promise((resolve) => hostSocket.emit('update_settings', { category: 'phrases' }, resolve));
    await sleep(100);
    if (hostRoomData.settings.category !== 'phrases') {
      throw new Error(`修改设置失败: ${hostRoomData.settings.category}`);
    }
    console.log('✅ 房主成功修改词库为：phrases (口头禅)');

    // 6. 房主开始游戏
    const startRes = await new Promise((resolve) => hostSocket.emit('start_game', {}, resolve));
    if (!startRes || !startRes.success) {
      throw new Error(`开始游戏失败: ${JSON.stringify(startRes)}`);
    }
    await sleep(300);

    if (hostRoomData.gameState.phase !== 'PLAYING') {
      throw new Error(`游戏阶段未进入 PLAYING: ${hostRoomData.gameState.phase}`);
    }
    console.log('✅ 游戏成功开始，进入 PLAYING 阶段');

    // 7. 严格验证信息不对称安全脱敏
    // 房主视角：
    const hostSelf = hostRoomData.players.find(p => p.id === 'p_host');
    const hostSeeP2 = hostRoomData.players.find(p => p.id === 'p_player2');
    if (!hostSelf.word.masked) {
      throw new Error(`安全漏洞：房主竟然看到了自己的禁忌词！${JSON.stringify(hostSelf.word)}`);
    }
    if (!hostSeeP2.word.text) {
      throw new Error(`错误：房主没有看到玩家2的禁忌词！${JSON.stringify(hostSeeP2.word)}`);
    }
    console.log(`✅ 房主视角验证通过：自己的词已加密隐藏，玩家2的词明文显示:【${hostSeeP2.word.text}】`);

    // 玩家2视角：
    const p2SeeHost = p2RoomData.players.find(p => p.id === 'p_host');
    const p2Self = p2RoomData.players.find(p => p.id === 'p_player2');
    if (!p2Self.word.masked) {
      throw new Error(`安全漏洞：玩家2竟然看到了自己的禁忌词！${JSON.stringify(p2Self.word)}`);
    }
    if (!p2SeeHost.word.text) {
      throw new Error(`错误：玩家2没有看到房主的禁忌词！${JSON.stringify(p2SeeHost.word)}`);
    }
    console.log(`✅ 玩家2视角验证通过：自己的词已加密隐藏，房主的词明文显示:【${p2SeeHost.word.text}】`);

    // 8. 触发抓包中招测试 (房主抓包玩家2)
    const catchRes = await new Promise((resolve) => {
      hostSocket.emit('trigger_caught', { targetId: 'p_player2' }, resolve);
    });
    if (!catchRes || !catchRes.success) {
      throw new Error(`抓包失败: ${JSON.stringify(catchRes)}`);
    }
    await sleep(200);

    const caughtEv = hostRoomData.gameState.caughtEvent;
    if (!caughtEv || caughtEv.targetId !== 'p_player2') {
      throw new Error(`中招事件未正确记录: ${JSON.stringify(caughtEv)}`);
    }
    if (!caughtEv.punishment || typeof caughtEv.punishment !== 'string') {
      throw new Error(`未生成随机惩罚: ${caughtEv.punishment}`);
    }
    console.log(`✅ 抓包测试通过！玩家2中招，揭晓其禁忌:【${caughtEv.word.text}】，抽中随机惩罚:【${caughtEv.punishment}】`);

    // 9. 测试换个惩罚 (reroll_punishment)
    const oldPunishment = caughtEv.punishment;
    const rerollRes = await new Promise((resolve) => {
      player2Socket.emit('reroll_punishment', {}, resolve);
    });
    if (!rerollRes || !rerollRes.success) {
      throw new Error(`换惩罚失败: ${JSON.stringify(rerollRes)}`);
    }
    await sleep(100);
    console.log(`✅ 换惩罚测试通过，新随机惩罚:【${hostRoomData.gameState.caughtEvent.punishment}】`);

    // 10. 测试换新词继续 (deal_new_word)
    const dealRes = await new Promise((resolve) => {
      hostSocket.emit('deal_new_word', { targetId: 'p_player2' }, resolve);
    });
    if (!dealRes || !dealRes.success) {
      throw new Error(`换新词失败: ${JSON.stringify(dealRes)}`);
    }
    await sleep(200);

    if (hostRoomData.gameState.caughtEvent !== null) {
      throw new Error('换新词后 caughtEvent 未被清空');
    }
    const newP2WordFromHostView = hostRoomData.players.find(p => p.id === 'p_player2').word;
    if (!newP2WordFromHostView.text) {
      throw new Error('玩家2未获得新禁忌词');
    }
    console.log(`✅ 换新词测试通过！玩家2获得新禁忌词:【${newP2WordFromHostView.text}】，弹窗已关闭无缝继续`);

    // 11. 测试返回大厅 (back_to_lobby)
    const backRes = await new Promise((resolve) => {
      hostSocket.emit('back_to_lobby', {}, resolve);
    });
    if (!backRes || !backRes.success) {
      throw new Error(`返回大厅失败: ${JSON.stringify(backRes)}`);
    }
    await sleep(100);

    if (hostRoomData.gameState.phase !== 'LOBBY') {
      throw new Error(`返回大厅后状态未重置: ${hostRoomData.gameState.phase}`);
    }
    console.log('✅ 返回大厅重置测试通过！');

    // 清理连接
    hostSocket.disconnect();
    player2Socket.disconnect();
    server.close();

    console.log('\n🎉🎉🎉 所有自动化测试用例 100% 全部通过！');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ 测试执行失败:', err);
    try { server.close(); } catch(e) {}
    process.exit(1);
  }
}

runTrapwordsTest();
