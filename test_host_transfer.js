const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const assert = require('assert');
const { setupUndercover } = require('./games/undercover/server');

async function runTest() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  setupUndercover(io, app);

  const PORT = 3998;
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
    const sHost = await connectClient('p_host', '原房主');
    const sGuest1 = await connectClient('p_guest1', '玩家小明');
    const sGuest2 = await connectClient('p_guest2', '玩家小红');
    sockets.push(sHost, sGuest1, sGuest2);

    let hostRoomData = null;
    let guest1RoomData = null;
    sHost.on('room_update', d => { hostRoomData = d; });
    sGuest1.on('room_update', d => { guest1RoomData = d; });

    // 1. 房主创建房间
    const createRes = await new Promise(r => {
      sHost.emit('create_room', {
        player: { id: 'p_host', name: '原房主' },
        settings: { undercoverCount: 1, whiteboardCount: 0 }
      }, r);
    });
    const code = createRes.roomCode;
    console.log(`[测试 1] 房主创建房间成功: ${code}`);

    // 2. 普通玩家加入
    await new Promise(r => sGuest1.emit('join_room', { roomCode: code, player: { id: 'p_guest1', name: '玩家小明' } }, r));
    await new Promise(r => sGuest2.emit('join_room', { roomCode: code, player: { id: 'p_guest2', name: '玩家小红' } }, r));
    await sleep(200);

    // 3. 测试非房主调用 start_game 必须被拦截且不能抢房主
    console.log('[测试 2] 非房主尝试开始游戏...');
    const guestStartRes = await new Promise(r => {
      sGuest1.emit('start_game', {}, r);
    });
    assert.strictEqual(guestStartRes && guestStartRes.success, false, '非房主调用 start_game 应该失败');
    assert.strictEqual(hostRoomData.hostId, 'p_host', '非房主点击 start_game 不应抢占房主');
    assert.strictEqual(hostRoomData.gameState.phase, 'LOBBY', '游戏阶段应依然停留在 LOBBY');
    console.log('  ✅ 非房主无法开始游戏，房主未被篡改！');

    // 4. 测试房主在线时，非房主调用 claim_host 必须被拒绝
    console.log('[测试 3] 房主在线时，非房主尝试 claim_host...');
    const claimResOnline = await new Promise(r => {
      sGuest1.emit('claim_host', r);
    });
    assert.strictEqual(claimResOnline && claimResOnline.success, false, '房主在线时 claim_host 应该失败');
    assert.strictEqual(hostRoomData.hostId, 'p_host', '房主应依然为 p_host');
    console.log('  ✅ 房主在线时禁止接管房主！');

    // 5. 测试房主断线未满 2 分钟时，非房主调用 claim_host 必须被拒绝
    console.log('[测试 4] 房主断开连接，测试 2 分钟保护期内 claim_host...');
    sHost.disconnect();
    await sleep(300);
    const claimResGrace = await new Promise(r => {
      sGuest1.emit('claim_host', r);
    });
    assert.strictEqual(claimResGrace && claimResGrace.success, false, '断线未满2分钟 claim_host 应该失败');
    assert.ok(claimResGrace && claimResGrace.message && claimResGrace.message.includes('分钟'), '应提示倒计时或缓冲期');
    console.log('  ✅ 断线未满 2 分钟禁止接管房主！');

    // 房主连回
    sHost.connect();
    await sleep(300);
    sHost.emit('sync_room', { roomCode: code, playerId: 'p_host' });
    await sleep(300);

    // 6. 测试非房主调用 transfer_host 必须被拒绝
    console.log('[测试 5] 非房主尝试 transfer_host...');
    const fakeTransfer = await new Promise(r => {
      sGuest1.emit('transfer_host', { targetPlayerId: 'p_guest2' }, r);
    });
    assert.strictEqual(fakeTransfer && fakeTransfer.success, false, '非房主 transfer_host 应该失败');
    console.log('  ✅ 非房主无法移交房主权限！');

    // 7. 测试房主主动调用 transfer_host 移交给玩家小明 (p_guest1)
    console.log('[测试 6] 房主主动调用 transfer_host 移交给玩家小明...');
    const validTransfer = await new Promise(r => {
      sHost.emit('transfer_host', { targetPlayerId: 'p_guest1' }, r);
    });
    assert.strictEqual(validTransfer && validTransfer.success, true, '房主主动移交应该成功');
    await sleep(200);
    assert.strictEqual(guest1RoomData.hostId, 'p_guest1', '新房主应为 p_guest1');
    const p1 = guest1RoomData.players.find(p => p.id === 'p_guest1');
    const pHost = guest1RoomData.players.find(p => p.id === 'p_host');
    assert.strictEqual(p1.isHost, true, 'p_guest1 的 isHost 应该为 true');
    assert.strictEqual(pHost.isHost, false, '原房主的 isHost 应该为 false');
    console.log('  ✅ 房主主动移交权限成功，新房主已就任！');

    // 8. 测试申请房主机制：玩家小红 (p_guest2) 申请成为房主，房主小明 (p_guest1) 收到并拒绝
    console.log('[测试 7] 玩家小红申请成为房主，房主小明拒绝...');
    let claimRequestReceived = null;
    sGuest1.on('host_claim_requested', d => { claimRequestReceived = d; });
    let claimResultReceived = null;
    sGuest2.on('host_claim_result', d => { claimResultReceived = d; });

    const applyRes1 = await new Promise(r => {
      sGuest2.emit('apply_host', r);
    });
    assert.strictEqual(applyRes1 && applyRes1.success, true, '申请发送应成功');
    await sleep(200);
    assert.ok(claimRequestReceived, '房主应收到 host_claim_requested 申请事件');
    assert.strictEqual(claimRequestReceived.applicantId, 'p_guest2', '申请人应为 p_guest2');

    // 房主小明拒绝
    const rejectRes = await new Promise(r => {
      sGuest1.emit('respond_host_claim', { applicantId: 'p_guest2', approved: false }, r);
    });
    assert.strictEqual(rejectRes && rejectRes.success, true, '房主拒绝操作成功');
    await sleep(200);
    assert.ok(claimResultReceived, '申请人应收到拒绝结果');
    assert.strictEqual(claimResultReceived.approved, false, '申请结果应为拒绝');
    assert.strictEqual(guest1RoomData.hostId, 'p_guest1', '被拒绝后房主应依然为 p_guest1');
    console.log('  ✅ 房主收到申请并拒绝，房主权限未发生变动！');

    // 9. 测试申请房主机制：玩家小红再次申请，房主小明同意移交
    console.log('[测试 8] 玩家小红再次申请，房主小明同意移交...');
    claimRequestReceived = null;
    claimResultReceived = null;
    const applyRes2 = await new Promise(r => {
      sGuest2.emit('apply_host', r);
    });
    assert.strictEqual(applyRes2 && applyRes2.success, true, '申请再次发送应成功');
    await sleep(200);
    assert.ok(claimRequestReceived, '房主应收到 host_claim_requested 申请事件');

    // 房主小明同意
    const approveRes = await new Promise(r => {
      sGuest1.emit('respond_host_claim', { applicantId: 'p_guest2', approved: true }, r);
    });
    assert.strictEqual(approveRes && approveRes.success, true, '房主同意操作成功');
    await sleep(200);
    assert.strictEqual(guest1RoomData.hostId, 'p_guest2', '新房主应成功变为 p_guest2');
    const p2 = guest1RoomData.players.find(p => p.id === 'p_guest2');
    assert.strictEqual(p2.isHost, true, 'p_guest2 的 isHost 应该为 true');
    console.log('  ✅ 房主同意移交，玩家小红正式成为新房主！');

    // 10. 测试新房主 (p_guest2) 能够正常开始游戏
    console.log('[测试 9] 新房主玩家小红开始游戏...');
    const newHostStart = await new Promise(r => {
      sGuest2.emit('start_game', {}, r);
    });
    assert.strictEqual(newHostStart && newHostStart.success, true, '新房主调用 start_game 应该成功');
    await sleep(200);
    assert.strictEqual(guest1RoomData.gameState.phase, 'CARD_VIEW', '游戏应成功进入看牌阶段');
    console.log('  ✅ 新房主成功开始游戏！');

    console.log('\n🎉 所有房主限制、主动移交与申请审批测试全部通过！');
  } finally {
    sockets.forEach(s => s.close());
    server.close();
  }
}

runTest().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
