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

    // ================= Task 3 用例 =================
    console.log('\n--- 开始测试 Task 3: 夜间零倒计时手动推进、空唤与撤回 ---');
    // 当前阶段应为 NIGHT, activeNightStep: 'NIGHT_FALL'
    assert.strictEqual(hostRoomData.gameState.activeNightStep, 'NIGHT_FALL');
    assert.ok(hostRoomData.gameState.currentSpeechScript.includes('天黑请闭眼'));

    // 1. 上帝手动从 NIGHT_FALL 推进到狼人 (9人预女猎板子无守卫，直接进入 WEREWOLF)
    await new Promise(r => {
      sHost.emit('god_night_step', {
        roomCode: code,
        step: 'NIGHT_FALL'
      }, r);
    });
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.activeNightStep, 'WEREWOLF');
    assert.ok(hostRoomData.gameState.currentSpeechScript.includes('狼人请睁眼'));
    console.log('  ✅ [用例 3.1] 入夜推进至狼人环节，提词正确更新！');

    // 2. 狼人刀 1 号玩家 (p_g_1)
    await new Promise(r => {
      sHost.emit('god_night_step', {
        roomCode: code,
        step: 'WEREWOLF',
        actionData: { targetId: 'p_g_1' }
      }, r);
    });
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.activeNightStep, 'WITCH');
    assert.strictEqual(hostRoomData.gameState.nightRecord.wolfTarget, 'p_g_1');
    assert.ok(hostRoomData.gameState.currentSpeechScript.includes('女巫请睁眼'));
    console.log('  ✅ [用例 3.2] 狼人击杀录入成功，推进至女巫环节！');

    // 3. 测试 ⏪ 上一步撤销功能：回退到狼人环节并修改刀 2 号玩家
    await new Promise(r => {
      sHost.emit('god_night_prev_step', { roomCode: code }, r);
    });
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.activeNightStep, 'WEREWOLF', '应回退至狼人环节');
    // 改刀 2 号
    await new Promise(r => {
      sHost.emit('god_night_step', {
        roomCode: code,
        step: 'WEREWOLF',
        actionData: { targetId: 'p_g_2' }
      }, r);
    });
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.activeNightStep, 'WITCH');
    assert.strictEqual(hostRoomData.gameState.nightRecord.wolfTarget, 'p_g_2', '狼刀目标已更新为2号');
    console.log('  ✅ [用例 3.3] 【⏪ 上一步】无损撤销并重新录入狼刀生效！');

    // 4. 女巫使用解药救 2 号
    await new Promise(r => {
      sHost.emit('god_night_step', {
        roomCode: code,
        step: 'WITCH',
        actionData: { saveTarget: 'p_g_2', poisonTarget: null }
      }, r);
    });
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.activeNightStep, 'SEER');
    assert.ok(hostRoomData.gameState.currentSpeechScript.includes('预言家请睁眼'));
    console.log('  ✅ [用例 3.4] 女巫使用解药录入，推进至预言家查验环节！');

    // 5. 预言家查验并即时返回大字反馈
    const aWolf = hostRoomData.players.find(p => p.initialRole === 'WEREWOLF' && p.id !== 'p_god_host');
    const seerCheckRes = await new Promise(r => {
      sHost.emit('god_night_step', {
        roomCode: code,
        step: 'SEER',
        actionData: { targetId: aWolf.id }
      }, r);
    });
    assert.strictEqual(seerCheckRes.success, true);
    assert.strictEqual(seerCheckRes.isWolf, true, '预言家查验狼人应返回 isWolf: true');
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.activeNightStep, 'NIGHT_END');
    console.log('  ✅ [用例 3.5] 预言家查验即时大字反馈【狼人 🔴】！');

    // 6. 上帝确认天亮结算死伤
    await new Promise(r => {
      sHost.emit('god_announce_dawn', { roomCode: code }, r);
    });
    await sleep(100);
    // 因为狼刀2号，女巫救2号，应为平安夜！
    assert.strictEqual(hostRoomData.gameState.dayRecord.deadTonight.length, 0, '女巫开解药应为平安夜');
    // 首日先竞选警长 (BEFORE_DEATH_ANNOUNCE)
    assert.strictEqual(hostRoomData.gameState.phase, 'DAY_SHERIFF', '首日应先进入警长竞选');
    assert.ok(hostRoomData.gameState.currentSpeechScript.includes('警长竞选'));
    console.log('  ✅ [用例 3.6] 天亮自动防呆结算（女巫解药生效平安夜，首日先竞选警长）！');
    console.log('🎉 Task 2 & Task 3 测试用例全部通过！');

    // ================= Task 4 & Task 6 用例 =================
    console.log('\n--- 开始测试 Task 4: 白天流程、警长时序分支、平票 PK、警徽流转与胜负判定 ---');

    // 1. 警长竞选：授徽给 3 号玩家
    const electRes = await new Promise(r => {
      sHost.emit('god_sheriff_action', {
        roomCode: code,
        action: 'elect_badge',
        targetId: 'p_g_3'
      }, r);
    });
    assert.strictEqual(electRes.success, true);
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.sheriffPlayerId, 'p_g_3', '3号玩家当选警长');
    assert.strictEqual(hostRoomData.gameState.phase, 'DAY_DEATH_ANNOUNCE', '先竞选后报死：授徽后进入死讯公告');
    console.log('  ✅ [用例 4.1] 警长竞选授徽成功，时序正确推进至死讯公告！');

    // 2. 宣布死讯（平安夜）并推进至自由讨论
    await new Promise(r => {
      sHost.emit('god_confirm_death', { roomCode: code }, r);
    });
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.phase, 'DAY_DISCUSS', '死讯宣布完毕进入讨论阶段');
    console.log('  ✅ [用例 4.2] 确认死讯后顺利进入白天讨论阶段！');

    // 3. 标记白天发言人
    await new Promise(r => {
      sHost.emit('god_select_speaker', { roomCode: code, playerId: 'p_g_3' }, r);
    });
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.currentSpeakerId, 'p_g_3');
    assert.ok(hostRoomData.gameState.currentSpeechScript.includes('3号 [玩家3号] 开始顺序发言'));
    console.log('  ✅ [用例 5] 上帝标记发言人成功，提词器精准对焦并更新台词！');

    // 4. 触发平票 PK 与平安日
    await new Promise(r => {
      sHost.emit('god_trigger_pk', {
        roomCode: code,
        candidateIds: ['p_g_4', 'p_g_5']
      }, r);
    });
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.phase, 'DAY_PK_DISCUSS');
    assert.deepStrictEqual(hostRoomData.gameState.dayRecord.pkCandidates, ['p_g_4', 'p_g_5']);

    // 推进至 PK 投票
    await new Promise(r => {
      sHost.emit('god_start_vote', { roomCode: code }, r);
    });
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.phase, 'DAY_PK_VOTE');

    // 二次平票判定平安日
    await new Promise(r => {
      sHost.emit('god_peace_day', { roomCode: code }, r);
    });
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.phase, 'DAY_PEACE_DAY');
    console.log('  ✅ [用例 6] 平票 PK 讨论、二次投票与平安日状态机流转正确！');

    // 5. 神职阵亡空唤防泄密机制（制造预言家出局，进入第二夜验证）
    const seerPlayer = hostRoomData.players.find(p => p.initialRole === 'SEER');
    assert.ok(seerPlayer, '应存在预言家');
    await new Promise(r => {
      sHost.emit('god_judge_eliminate', {
        roomCode: code,
        targetPlayerId: seerPlayer.id,
        reason: '线下离场'
      }, r);
    });
    await sleep(100);
    assert.strictEqual(hostRoomData.players.find(p => p.id === seerPlayer.id).isAlive, false);

    // 进入第二夜
    await new Promise(r => {
      sHost.emit('god_enter_next_night', { roomCode: code }, r);
    });
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.round, 2);
    assert.strictEqual(hostRoomData.gameState.phase, 'NIGHT');

    // 步进：NIGHT_FALL -> WEREWOLF -> WITCH -> SEER
    await new Promise(r => sHost.emit('god_night_step', { roomCode: code, step: 'NIGHT_FALL' }, r));
    await sleep(50);
    await new Promise(r => sHost.emit('god_night_step', { roomCode: code, step: 'WEREWOLF', actionData: { targetId: 'p_g_6' } }, r));
    await sleep(50);
    await new Promise(r => sHost.emit('god_night_step', { roomCode: code, step: 'WITCH', actionData: { saveTarget: null, poisonTarget: null } }, r));
    await sleep(50);
    // 此时步进到 SEER，预言家已阵亡，应当触发 isDeadFakeCall: true
    assert.strictEqual(hostRoomData.gameState.activeNightStep, 'SEER');
    assert.strictEqual(hostRoomData.gameState.isDeadFakeCall, true, '预言家阵亡下一夜应触发空唤防泄密！');
    assert.ok(hostRoomData.gameState.currentSpeechScript.includes('预言家请睁眼'), '即使空唤仍必须下发标准念白');
    console.log('  ✅ [用例 7] 神职阵亡空唤防泄密机制生效（isDeadFakeCall: true，提词照常）！');

    // 步进到 NIGHT_END 并天亮
    await new Promise(r => sHost.emit('god_night_step', { roomCode: code, step: 'SEER' }, r));
    await sleep(50);
    await new Promise(r => sHost.emit('god_announce_dawn', { roomCode: code }, r));
    await sleep(100);
    // 确认死讯进入白天讨论
    await new Promise(r => sHost.emit('god_confirm_death', { roomCode: code }, r));
    await sleep(100);

    // 6. 白狼王自爆带人
    const aLivingWolf = hostRoomData.players.find(p => p.initialRole === 'WEREWOLF' && p.isAlive && p.id !== 'p_god_host');
    const aLivingCivilian = hostRoomData.players.find(p => p.initialRole === 'VILLAGER' && p.isAlive);
    const explodeRes = await new Promise(r => {
      sHost.emit('god_wolf_explode', {
        roomCode: code,
        wolfPlayerId: aLivingWolf.id,
        targetId: aLivingCivilian.id
      }, r);
    });
    assert.strictEqual(explodeRes.success, true);
    await sleep(100);
    assert.strictEqual(hostRoomData.players.find(p => p.id === aLivingWolf.id).isAlive, false, '自爆狼应出局');
    assert.strictEqual(hostRoomData.players.find(p => p.id === aLivingCivilian.id).isAlive, false, '被带走玩家应出局');
    assert.strictEqual(hostRoomData.gameState.phase, 'NIGHT', '自爆后直接强制入夜！');
    console.log('  ✅ [用例 8] 狼人自爆带人成功，并且白天直接中止强制入夜！');

    // 天亮并再次进入白天讨论
    await new Promise(r => sHost.emit('god_announce_dawn', { roomCode: code }, r));
    await sleep(50);
    await new Promise(r => sHost.emit('god_confirm_death', { roomCode: code }, r));
    await sleep(50);

    // 7. 警长出局与强制移交警徽
    // 3号为警长，投票投出3号
    const voteSheriffRes = await new Promise(r => {
      sHost.emit('god_vote_execute', {
        roomCode: code,
        targetPlayerId: 'p_g_3'
      }, r);
    });
    assert.strictEqual(voteSheriffRes.success, true);
    assert.strictEqual(voteSheriffRes.isSheriffDead, true, '警长出局应标记 isSheriffDead');

    // 移交警徽给 2 号
    const transferRes = await new Promise(r => {
      sHost.emit('god_transfer_badge', {
        roomCode: code,
        action: 'transfer',
        targetId: 'p_g_2'
      }, r);
    });
    assert.strictEqual(transferRes.success, true);
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.sheriffPlayerId, 'p_g_2', '警徽已成功移交至2号');
    console.log('  ✅ [用例 9] 警长出局精准拦截并成功强制流转警徽！');

    // 8. 裁判强制终局特权 god_force_end
    await new Promise(r => {
      sHost.emit('god_force_end', {
        roomCode: code,
        winnerTeam: 'VILLAGER'
      }, r);
    });
    await sleep(100);
    assert.strictEqual(hostRoomData.gameState.phase, 'GAME_OVER');
    assert.strictEqual(hostRoomData.gameState.winnerTeam, 'VILLAGER');
    console.log('  ✅ [用例 10] 裁判 god_force_end 强制终局裁决生效！');

    // 9. 时序分支测试：AFTER_DEATH_ANNOUNCE (先报死后竞选)
    console.log('\n--- 开始测试 时序分支: AFTER_DEATH_ANNOUNCE (先公布死讯再竞选警长) ---');
    const sHost2 = await connectClient('法官2');
    const guests2 = [];
    for (let i = 1; i <= 6; i++) {
      guests2.push(await connectClient(`玩家B${i}号`));
    }
    sockets.push(sHost2, ...guests2);

    let host2RoomData = null;
    sHost2.on('room_update', d => { host2RoomData = d; });

    const create2Res = await new Promise(r => {
      sHost2.emit('create_room', {
        id: 'p_god_host2',
        name: '法官2',
        settings: {
          isGodMode: true,
          mode: 'CLASSIC',
          customRoles: { WEREWOLF: 2, IDIOT: 1, SEER: 1, VILLAGER: 2 },
          firstDaySheriffTiming: 'AFTER_DEATH_ANNOUNCE',
          hasSheriff: true
        }
      }, r);
    });
    const code2 = create2Res.roomCode;

    for (let i = 0; i < 6; i++) {
      await new Promise(r => {
        guests2[i].emit('join_room', {
          roomCode: code2,
          player: { id: `p_b_${i+1}`, name: `玩家B${i+1}号` }
        }, r);
      });
    }
    await sleep(100);

    await new Promise(r => sHost2.emit('start_game', {}, r));
    await sleep(100);

    // 推进夜晚并天亮
    await new Promise(r => sHost2.emit('god_announce_dawn', { roomCode: code2 }, r));
    await sleep(100);

    // AFTER_DEATH_ANNOUNCE 时序：天亮先进入 DAY_DEATH_ANNOUNCE
    assert.strictEqual(host2RoomData.gameState.phase, 'DAY_DEATH_ANNOUNCE', '娱乐赛制应先公布死讯');
    // 报死完毕后，进入 DAY_SHERIFF
    await new Promise(r => sHost2.emit('god_confirm_death', { roomCode: code2 }, r));
    await sleep(100);
    assert.strictEqual(host2RoomData.gameState.phase, 'DAY_SHERIFF', '报死完毕后顺利进入警长竞选');
    console.log('  ✅ [用例 11] AFTER_DEATH_ANNOUNCE 先报死后竞选时序验证通过！');

    // 10. 白痴翻牌免死独立校验
    const idiotPlayer = host2RoomData.players.find(p => p.initialRole === 'IDIOT');
    assert.ok(idiotPlayer, '应发到白痴牌');
    const idiotVoteRes = await new Promise(r => {
      sHost2.emit('god_vote_execute', {
        roomCode: code2,
        targetPlayerId: idiotPlayer.id
      }, r);
    });
    assert.strictEqual(idiotVoteRes.isIdiotImmune, true, '白痴首次被投应翻牌免死');
    const liveIdiot = host2RoomData.players.find(p => p.id === idiotPlayer.id);
    assert.strictEqual(liveIdiot.isAlive, true, '白痴翻牌后仍然存活');
    assert.strictEqual(liveIdiot.isImmuneExiled, true, '白痴应标记已翻牌');
    console.log('  ✅ [用例 12] 白痴翻牌免死机制验证通过！');

    console.log('\n🎉 狼人杀线下上帝模式全部用例验证通过！');
  } finally {
    sockets.forEach(s => s.close());
    server.close();
  }
}

runWerewolfGodModeTest().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
