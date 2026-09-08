// Werewolf Game Server (聚会狼人杀服务端逻辑)

const { TEAMS, ROLES, getOneNightPreset, getClassicPreset } = require('./roles');

const rooms = new Map();

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(code));
  return code;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const AI_NAMES = ['名侦探阿福', '福尔摩斯', '华生医生', '神秘莫测的狼', '森林隐士', '敏锐学者', '暗影潜伏者'];
const AI_AVATARS = ['🕵️', '🧙‍♂️', '🧔', '🐺', '🧝', '🦉', '🦊'];

function createRoom(hostPlayer) {
  const code = generateRoomCode();
  const room = {
    code,
    hostId: hostPlayer.id,
    createdAt: Date.now(),
    lastActiveTime: Date.now(),
    settings: {
      mode: 'ONE_NIGHT', // 'ONE_NIGHT' (一夜终极模式) 或 'CLASSIC' (经典多轮模式)
      discussionTime: 180, // 白天讨论时长 (秒)
      customRoles: null
    },
    players: new Map([[
      hostPlayer.id,
      {
        id: hostPlayer.id,
        socketId: hostPlayer.socketId,
        name: escapeHtml(hostPlayer.name || '玩家1'),
        avatar: escapeHtml(hostPlayer.avatar || '😎'),
        isHost: true,
        isOnline: true,
        isAi: false,
        isAlive: true,
        initialRole: null,
        currentRole: null,
        hasVoted: false,
        nightDone: false
      }
    ]]),
    gameState: {
      phase: 'LOBBY', // LOBBY, NIGHT, DAY_DISCUSSION, VOTING, GAME_OVER
      round: 1,
      centerCards: [], // 一夜模式桌中 3 张底牌: [{ id, roleId }]
      activeNightStep: null, // 当前夜晚行动角色 ID
      nightLogs: [], // 夜晚发生的动作日志
      votes: {}, // { voterId: targetPlayerId }
      nightActions: {}, // 暂存玩家夜晚操作
      timerDeadline: null,
      winnerTeam: null,
      winnerRole: null,
      executedPlayers: []
    },
    timer: null
  };
  rooms.set(code, room);
  return room;
}

function getSafeRoomData(room, targetPlayerId) {
  const myPlayer = room.players.get(targetPlayerId);
  const isGameOver = room.gameState.phase === 'GAME_OVER';

  const playersList = Array.from(room.players.values()).map(p => {
    const isMe = p.id === targetPlayerId;
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.isHost,
      isOnline: p.isOnline,
      isAi: p.isAi,
      isAlive: p.isAlive,
      hasVoted: p.hasVoted,
      nightDone: p.nightDone,
      // 只有在游戏结算复盘时，或者对自己才显示身份
      initialRole: (isMe || isGameOver) ? p.initialRole : null,
      currentRole: isGameOver ? p.currentRole : null
    };
  });

  const deckPool = (room.settings.mode === 'ONE_NIGHT')
    ? getOneNightPreset(room.players.size)
    : getClassicPreset(room.players.size);

  return {
    code: room.code,
    hostId: room.hostId,
    settings: room.settings,
    myPlayerId: targetPlayerId,
    myPlayer: myPlayer ? {
      id: myPlayer.id,
      name: myPlayer.name,
      avatar: myPlayer.avatar,
      isHost: myPlayer.isHost,
      isAlive: myPlayer.isAlive,
      hasVoted: myPlayer.hasVoted,
      nightDone: myPlayer.nightDone,
      initialRole: myPlayer.initialRole,
      currentRole: isGameOver ? myPlayer.currentRole : null
    } : null,
    players: playersList,
    deckPool,
    gameState: {
      phase: room.gameState.phase,
      mode: room.settings.mode,
      activeNightStep: room.gameState.activeNightStep,
      timerDeadline: room.gameState.timerDeadline,
      discussionTime: room.settings.discussionTime,
      votes: (room.gameState.phase === 'VOTING' || isGameOver) ? room.gameState.votes : {},
      executedPlayers: room.gameState.executedPlayers,
      winnerTeam: room.gameState.winnerTeam,
      winnerRole: room.gameState.winnerRole,
      nightLogs: isGameOver ? room.gameState.nightLogs : [],
      centerCards: isGameOver ? room.gameState.centerCards : (room.gameState.centerCards.length > 0 ? [{}, {}, {}] : [])
    },
    availableRoles: ROLES
  };
}

function broadcastRoom(werewolfIo, room) {
  if (!room) return;
  room.lastActiveTime = Date.now();
  for (const p of room.players.values()) {
    if (p.socketId && p.isOnline && !p.isAi) {
      werewolfIo.to(p.socketId).emit('room_update', getSafeRoomData(room, p.id));
    }
  }
}

function clearRoomTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

/**
 * 开始发牌并进入夜晚
 */
function startGame(werewolfIo, room) {
  clearRoomTimer(room);

  const playersList = Array.from(room.players.values());
  const count = playersList.length;

  let rolePool = [];
  if (room.settings.mode === 'ONE_NIGHT') {
    rolePool = getOneNightPreset(count);
  } else {
    rolePool = getClassicPreset(count);
  }

  // 洗牌
  for (let i = rolePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
  }

  // 给玩家发牌
  playersList.forEach((p, idx) => {
    p.isAlive = true;
    p.hasVoted = false;
    p.nightDone = false;
    p.initialRole = rolePool[idx];
    p.currentRole = rolePool[idx];
  });

  // 一夜模式剩余 3 张作为桌中底牌
  if (room.settings.mode === 'ONE_NIGHT') {
    room.gameState.centerCards = [
      { id: 0, roleId: rolePool[count] },
      { id: 1, roleId: rolePool[count + 1] },
      { id: 2, roleId: rolePool[count + 2] }
    ];
  } else {
    room.gameState.centerCards = [];
  }

  room.gameState.phase = 'NIGHT';
  room.gameState.nightLogs = [];
  room.gameState.votes = {};
  room.gameState.executedPlayers = [];
  room.gameState.winnerTeam = null;
  room.gameState.winnerRole = null;

  broadcastRoom(werewolfIo, room);
  werewolfIo.to(room.code).emit('night_fallen');

  // 启动夜晚行动流
  if (room.settings.mode === 'ONE_NIGHT') {
    startOneNightSequence(werewolfIo, room);
  } else {
    startClassicNightSequence(werewolfIo, room);
  }
}

/**
 * 一夜终极狼人杀夜晚行动序列
 * 行动角色顺序: WEREWOLF -> MINION -> SEER -> ROBBER -> TROUBLEMAKER -> DRUNK -> INSOMNIAC
 */
const ONE_NIGHT_STEPS = ['WEREWOLF', 'MINION', 'SEER', 'ROBBER', 'TROUBLEMAKER', 'DRUNK', 'INSOMNIAC'];

function startOneNightSequence(werewolfIo, room) {
  let stepIndex = 0;

  function nextStep() {
    clearRoomTimer(room);

    if (stepIndex >= ONE_NIGHT_STEPS.length) {
      // 夜晚全部行动完成，天亮进入白天讨论！
      startDayDiscussion(werewolfIo, room);
      return;
    }

    const currentRole = ONE_NIGHT_STEPS[stepIndex];
    stepIndex++;

    room.gameState.activeNightStep = currentRole;
    room.gameState.timerDeadline = Date.now() + 14 * 1000;

    broadcastRoom(werewolfIo, room);
    werewolfIo.to(room.code).emit('night_step_start', { role: currentRole, duration: 14 });

    // 检查是否有真实玩家拥有该行动角色
    const actors = Array.from(room.players.values()).filter(p => p.initialRole === currentRole && !p.isAi && p.isOnline);
    const allWolves = Array.from(room.players.values()).filter(p => p.initialRole === 'WEREWOLF');

    // 向拥有该行动角色的真实玩家推送专属私有数据
    actors.forEach(actor => {
      let privateData = {};
      if (currentRole === 'WEREWOLF') {
        const otherWolves = allWolves.filter(w => w.id !== actor.id);
        privateData = {
          isLoneWolf: otherWolves.length === 0,
          otherWolves: otherWolves.map(w => ({ id: w.id, name: w.name, avatar: w.avatar }))
        };
      } else if (currentRole === 'MINION') {
        privateData = {
          werewolves: allWolves.map(w => ({ id: w.id, name: w.name, avatar: w.avatar }))
        };
      } else if (currentRole === 'INSOMNIAC') {
        privateData = {
          currentRole: actor.currentRole,
          roleDef: ROLES[actor.currentRole]
        };
      }

      if (actor.socketId) {
        werewolfIo.to(actor.socketId).emit('my_role_night_turn', {
          role: currentRole,
          privateData
        });
      }
    });

    // 若无该角色的真人玩家（在底牌或电脑），拟真延时 4~7 秒跳过，防止被时间长短推断！
    const stepDuration = (actors.length > 0) ? 14000 : (4000 + Math.floor(Math.random() * 3000));

    // 如果包含 AI 拥有该角色，执行 AI 虚拟操作
    handleAiNightAction(room, currentRole);

    room.timer = setTimeout(() => {
      nextStep();
    }, stepDuration);
  }

  // 延时 2 秒后开始第一个夜晚步骤
  setTimeout(() => {
    nextStep();
  }, 2000);
}

/**
 * AI 夜晚虚拟操作 (维持牌局平衡)
 */
function handleAiNightAction(room, roleId) {
  const aiPlayers = Array.from(room.players.values()).filter(p => p.initialRole === roleId && p.isAi);
  if (aiPlayers.length === 0) return;

  const otherPlayers = Array.from(room.players.values());

  aiPlayers.forEach(ai => {
    if (roleId === 'ROBBER') {
      // 强盗 AI 随机偷换一名非自身玩家
      const targets = otherPlayers.filter(p => p.id !== ai.id);
      if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        const temp = ai.currentRole;
        ai.currentRole = target.currentRole;
        target.currentRole = temp;
        room.gameState.nightLogs.push(`强盗 [${ai.name}] 交换了 [${target.name}] 的身份牌`);
      }
    } else if (roleId === 'TROUBLEMAKER') {
      // 捣蛋鬼 AI 随机调换另外两名玩家
      const targets = otherPlayers.filter(p => p.id !== ai.id);
      if (targets.length >= 2) {
        const p1 = targets[0];
        const p2 = targets[1];
        const temp = p1.currentRole;
        p1.currentRole = p2.currentRole;
        p2.currentRole = temp;
        room.gameState.nightLogs.push(`捣蛋鬼 [${ai.name}] 调换了 [${p1.name}] 与 [${p2.name}] 的身份牌`);
      }
    } else if (roleId === 'DRUNK') {
      // 醉鬼 AI 随机调换一张底牌
      if (room.gameState.centerCards.length > 0) {
        const cIdx = Math.floor(Math.random() * room.gameState.centerCards.length);
        const center = room.gameState.centerCards[cIdx];
        const temp = ai.currentRole;
        ai.currentRole = center.roleId;
        center.roleId = temp;
        room.gameState.nightLogs.push(`醉鬼 [${ai.name}] 与桌中第 ${cIdx + 1} 张底牌交换了身份`);
      }
    }
  });
}

/**
 * 经典多夜模式流程
 */
function startClassicNightSequence(werewolfIo, room) {
  // 简版经典模式夜晚：直接全员天黑，15秒后天亮
  room.gameState.timerDeadline = Date.now() + 15 * 1000;
  broadcastRoom(werewolfIo, room);

  room.timer = setTimeout(() => {
    startDayDiscussion(werewolfIo, room);
  }, 15000);
}

/**
 * 进入白天发言讨论
 */
function startDayDiscussion(werewolfIo, room) {
  clearRoomTimer(room);
  room.gameState.phase = 'DAY_DISCUSSION';
  room.gameState.activeNightStep = null;
  room.gameState.timerDeadline = Date.now() + room.settings.discussionTime * 1000;

  broadcastRoom(werewolfIo, room);
  werewolfIo.to(room.code).emit('day_dawn', { message: '天亮了！公鸡打鸣，全员请睁眼讨论！' });

  // 讨论时间结束自动进入投票
  room.timer = setTimeout(() => {
    startVotingPhase(werewolfIo, room);
  }, room.settings.discussionTime * 1000);
}

/**
 * 进入投票处决阶段
 */
function startVotingPhase(werewolfIo, room) {
  clearRoomTimer(room);
  room.gameState.phase = 'VOTING';
  room.gameState.votes = {};
  room.gameState.timerDeadline = Date.now() + 25 * 1000;

  for (const p of room.players.values()) {
    p.hasVoted = false;
  }

  broadcastRoom(werewolfIo, room);
  werewolfIo.to(room.code).emit('voting_started', { duration: 25 });

  // AI 自动随机投票
  setTimeout(() => {
    handleAiVotes(werewolfIo, room);
  }, 3000);

  // 超时自动结算投票
  room.timer = setTimeout(() => {
    resolveVotes(werewolfIo, room);
  }, 26000);
}

function handleAiVotes(werewolfIo, room) {
  const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive);
  const aiList = alivePlayers.filter(p => p.isAi && !p.hasVoted);

  aiList.forEach(ai => {
    const candidates = alivePlayers.filter(p => p.id !== ai.id);
    if (candidates.length > 0) {
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      ai.hasVoted = true;
      room.gameState.votes[ai.id] = target.id;
    }
  });

  checkAllVoted(werewolfIo, room);
}

function checkAllVoted(werewolfIo, room) {
  const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive);
  const allVoted = alivePlayers.every(p => p.hasVoted);

  if (allVoted) {
    clearRoomTimer(room);
    setTimeout(() => {
      resolveVotes(werewolfIo, room);
    }, 1000);
  }
}

/**
 * 结算投票与判定胜利
 */
function resolveVotes(werewolfIo, room) {
  clearRoomTimer(room);
  room.gameState.phase = 'GAME_OVER';

  const votes = room.gameState.votes;
  const tally = {};

  Object.values(votes).forEach(targetId => {
    tally[targetId] = (tally[targetId] || 0) + 1;
  });

  let maxVotes = 0;
  Object.values(tally).forEach(c => {
    if (c > maxVotes) maxVotes = c;
  });

  const executed = [];
  // 只有当票数大于 1 票时才处决；若所有人各得 1 票（全员平票且仅1票），则无人死亡
  if (maxVotes > 1) {
    Object.keys(tally).forEach(id => {
      if (tally[id] === maxVotes) {
        executed.push(id);
      }
    });
  }

  // 猎人带人逻辑 (一夜终极猎人若死，其票指目标也死)
  executed.forEach(deadId => {
    const p = room.players.get(deadId);
    if (p && p.currentRole === 'HUNTER' && votes[deadId] && !executed.includes(votes[deadId])) {
      executed.push(votes[deadId]);
    }
  });

  room.gameState.executedPlayers = executed;

  // 判定胜利阵营
  const deadRoles = executed.map(id => {
    const p = room.players.get(id);
    return p ? p.currentRole : null;
  });

  const allFinalRoles = Array.from(room.players.values()).map(p => p.currentRole);
  const werewolvesInPlay = allFinalRoles.some(r => r === 'WEREWOLF');
  const minionInPlay = allFinalRoles.some(r => r === 'MINION');

  let winnerTeam = TEAMS.VILLAGER;
  let winnerRole = '好人村民阵营获胜！';

  const tannerKilled = deadRoles.includes('TANNER');
  const wolfKilled = deadRoles.includes('WEREWOLF');
  const minionKilled = deadRoles.includes('MINION');

  // 1. 若制皮匠死亡
  if (tannerKilled) {
    if (wolfKilled) {
      winnerTeam = TEAMS.TANNER;
      winnerRole = '制皮匠 & 好人阵营共同获胜！(制皮匠求死成功，恶狼亦被处决！)';
    } else {
      winnerTeam = TEAMS.TANNER;
      winnerRole = '制皮匠获胜！(成功一心求死，独自加冕！)';
    }
  }
  // 2. 若场上有狼人
  else if (werewolvesInPlay) {
    if (wolfKilled) {
      winnerTeam = TEAMS.VILLAGER;
      winnerRole = '好人村民阵营获胜！(成功驱逐恶狼！)';
    } else {
      winnerTeam = TEAMS.WEREWOLF;
      winnerRole = '狼人阵营获胜！(恶狼躲过审判，潜伏胜利！)';
    }
  }
  // 3. 若场上原本就无狼人（双狼全在底牌）
  else {
    if (executed.length === 0) {
      winnerTeam = TEAMS.VILLAGER;
      winnerRole = '好人村民阵营获胜！(场上无狼，全员弃投保全，智慧获胜！)';
    } else if (minionInPlay && !minionKilled) {
      winnerTeam = TEAMS.WEREWOLF;
      winnerRole = '狼人爪牙获胜！(场上无狼，爪牙诱导处决了好人！)';
    } else {
      winnerTeam = TEAMS.WEREWOLF;
      winnerRole = '无狼对局 · 误杀好人 (全员失败，底牌恶狼狂喜！)';
    }
  }

  room.gameState.winnerTeam = winnerTeam;
  room.gameState.winnerRole = winnerRole;

  broadcastRoom(werewolfIo, room);

  werewolfIo.to(room.code).emit('game_settled', {
    winnerTeam,
    winnerRole,
    executed,
    nightLogs: room.gameState.nightLogs,
    centerCards: room.gameState.centerCards
  });
}

// 自动清理闲置房间
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const realPlayers = Array.from(room.players.values()).filter(p => !p.isAi && p.isOnline);
    const lastActive = room.lastActiveTime || now;
    if (realPlayers.length === 0 && (now - lastActive > 20 * 60 * 1000)) {
      clearRoomTimer(room);
      rooms.delete(code);
      console.log(`[狼人杀] 闲置房间 ${code} 已自动清理释放内存`);
    }
  }
}, 10 * 60 * 1000).unref();

function setupWerewolf(io, app) {
  const werewolfIo = io.of('/werewolf');

  werewolfIo.on('connection', (socket) => {
    let currentRoomCode = null;
    let currentPlayerId = null;

    // 创建房间
    socket.on('create_room', (playerData, callback) => {
      try {
        const player = {
          id: playerData.id || `p_${Date.now()}`,
          socketId: socket.id,
          name: playerData.name || '房主',
          avatar: playerData.avatar || '😎'
        };
        const room = createRoom(player);
        currentRoomCode = room.code;
        currentPlayerId = player.id;
        socket.join(room.code);

        if (typeof callback === 'function') callback({ success: true, roomCode: room.code });
        broadcastRoom(werewolfIo, room);
      } catch (err) {
        console.error('create_room error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '创建失败' });
      }
    });

    // 加入房间
    socket.on('join_room', ({ roomCode, player }, callback) => {
      try {
        const room = rooms.get(roomCode);
        if (!room) {
          if (typeof callback === 'function') callback({ success: false, message: '房间号不存在' });
          return;
        }

        const pid = player.id;
        currentRoomCode = roomCode;
        currentPlayerId = pid;
        socket.join(roomCode);

        if (room.players.has(pid)) {
          const existing = room.players.get(pid);
          existing.socketId = socket.id;
          existing.isOnline = true;
          if (player.name) existing.name = escapeHtml(player.name);
          if (player.avatar) existing.avatar = escapeHtml(player.avatar);
        } else {
          room.players.set(pid, {
            id: pid,
            socketId: socket.id,
            name: escapeHtml(player.name || `玩家${room.players.size + 1}`),
            avatar: escapeHtml(player.avatar || '🤠'),
            isHost: false,
            isOnline: true,
            isAi: false,
            isAlive: true,
            initialRole: null,
            currentRole: null,
            hasVoted: false,
            nightDone: false
          });
        }

        if (typeof callback === 'function') callback({ success: true, roomCode });
        broadcastRoom(werewolfIo, room);
      } catch (err) {
        console.error('join_room error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '加入失败' });
      }
    });

    // 切换游戏模式 (一夜终极 / 经典)
    socket.on('change_mode', (newMode) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;
      if (room.gameState.phase !== 'LOBBY') return;
      if (['ONE_NIGHT', 'CLASSIC'].includes(newMode)) {
        room.settings.mode = newMode;
        broadcastRoom(werewolfIo, room);
      }
    });

    // 添加 AI 补位
    socket.on('add_ai', (callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;
      if (room.gameState.phase !== 'LOBBY') return;
      if (room.players.size >= 10) {
        if (typeof callback === 'function') callback({ success: false, message: '房间人数已达上限' });
        return;
      }

      const idx = room.players.size;
      const aiName = AI_NAMES[idx % AI_NAMES.length];
      const aiAvatar = AI_AVATARS[idx % AI_AVATARS.length];
      const aiId = `ai_${Date.now()}_${idx}`;

      room.players.set(aiId, {
        id: aiId,
        socketId: null,
        name: aiName,
        avatar: aiAvatar,
        isHost: false,
        isOnline: true,
        isAi: true,
        isAlive: true,
        initialRole: null,
        currentRole: null,
        hasVoted: false,
        nightDone: true
      });

      if (typeof callback === 'function') callback({ success: true });
      broadcastRoom(werewolfIo, room);
    });

    // 踢出玩家 / 电脑
    socket.on('kick_player', (targetId) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;
      if (targetId === room.hostId) return;
      if (room.gameState.phase !== 'LOBBY') return;

      const p = room.players.get(targetId);
      if (p) {
        if (p.socketId) werewolfIo.to(p.socketId).emit('kicked_from_room');
        room.players.delete(targetId);
        broadcastRoom(werewolfIo, room);
      }
    });

    // 开始游戏
    socket.on('start_game', (callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;
      if (room.gameState.phase !== 'LOBBY') return;

      if (room.players.size < 3) {
        if (typeof callback === 'function') callback({ success: false, message: '至少需要 3 名玩家才能开局！' });
        return;
      }

      startGame(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true });
    });

    // 提前结束发言讨论，进入投票
    socket.on('advance_to_voting', () => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;
      if (room.gameState.phase !== 'DAY_DISCUSSION') return;
      startVotingPhase(werewolfIo, room);
    });

    // 延长白天讨论 (加时 60 秒)
    socket.on('extend_discussion', () => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;
      if (room.gameState.phase !== 'DAY_DISCUSSION') return;
      clearRoomTimer(room);
      room.gameState.timerDeadline = (room.gameState.timerDeadline || Date.now()) + 60 * 1000;
      const remaining = Math.max(1, Math.ceil((room.gameState.timerDeadline - Date.now()) / 1000));
      broadcastRoom(werewolfIo, room);
      werewolfIo.to(room.code).emit('discussion_extended', { seconds: 60 });
      room.timer = setTimeout(() => {
        startVotingPhase(werewolfIo, room);
      }, remaining * 1000);
    });

    // 夜晚技能操作响应
    socket.on('night_action', (data, callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.gameState.phase !== 'NIGHT') return;
      const player = room.players.get(currentPlayerId);
      if (!player) return;

      const role = player.initialRole;
      player.nightDone = true;

      // 1. 预言家查验
      if (role === 'SEER') {
        if (data.type === 'PLAYER' && data.targetId) {
          const target = room.players.get(data.targetId);
          if (target) {
            room.gameState.nightLogs.push(`预言家 [${player.name}] 查验了 [${target.name}] 的身份`);
            if (typeof callback === 'function') {
              callback({
                success: true,
                type: 'PLAYER',
                targetName: target.name,
                role: ROLES[target.currentRole],
                result: `查验结果：玩家 [${target.name}] 当前的身份是 [${ROLES[target.currentRole].name} ${ROLES[target.currentRole].icon}]！`
              });
            }
          }
        } else if (data.type === 'CENTER' && Array.isArray(data.indices)) {
          const validIndices = data.indices.filter(i => typeof i === 'number' && i >= 0 && i < 3).slice(0, 2);
          const cards = validIndices.map(i => {
            const c = room.gameState.centerCards[i];
            return {
              index: i,
              role: c ? ROLES[c.roleId] : null
            };
          });
          room.gameState.nightLogs.push(`预言家 [${player.name}] 查验了桌中 2 张底牌`);
          if (typeof callback === 'function') {
            callback({
              success: true,
              type: 'CENTER',
              cards,
              result: `底牌查验结果：${cards.map(c => `[底牌${c.index + 1}: ${c.role.name} ${c.role.icon}]`).join(' 和 ')}`
            });
          }
        }
      }
      // 2. 强盗对调并查看
      else if (role === 'ROBBER') {
        if (data.skip) {
          room.gameState.nightLogs.push(`强盗 [${player.name}] 放弃了偷换身份`);
          if (typeof callback === 'function') {
            callback({
              success: true,
              type: 'SKIP',
              result: '你选择放弃偷换，保持原有强盗身份。'
            });
          }
        } else if (data.targetId) {
          const target = room.players.get(data.targetId);
          if (target && target.id !== player.id) {
            const myOriginal = player.currentRole;
            player.currentRole = target.currentRole;
            target.currentRole = myOriginal;
            room.gameState.nightLogs.push(`强盗 [${player.name}] 偷换了 [${target.name}] 的身份牌并查看了新牌`);
            if (typeof callback === 'function') {
              callback({
                success: true,
                type: 'SWAP',
                targetName: target.name,
                newRole: ROLES[player.currentRole],
                result: `偷换成功！你换到了 [${target.name}] 的身份牌: [${ROLES[player.currentRole].name} ${ROLES[player.currentRole].icon}]！`
              });
            }
          }
        }
      }
      // 3. 捣蛋鬼对调两人
      else if (role === 'TROUBLEMAKER' && data.target1 && data.target2) {
        const p1 = room.players.get(data.target1);
        const p2 = room.players.get(data.target2);
        if (p1 && p2 && p1.id !== player.id && p2.id !== player.id && p1.id !== p2.id) {
          const temp = p1.currentRole;
          p1.currentRole = p2.currentRole;
          p2.currentRole = temp;
          room.gameState.nightLogs.push(`捣蛋鬼 [${player.name}] 调换了 [${p1.name}] 与 [${p2.name}] 的身份牌`);
          if (typeof callback === 'function') {
            callback({
              success: true,
              type: 'TROUBLE',
              result: `成功将 [${p1.name}] 与 [${p2.name}] 的身份牌互换！你不知晓两人的具体牌面。`
            });
          }
        }
      }
      // 4. 醉鬼对调底牌
      else if (role === 'DRUNK' && typeof data.centerIndex === 'number') {
        const center = room.gameState.centerCards[data.centerIndex];
        if (center) {
          const temp = player.currentRole;
          player.currentRole = center.roleId;
          center.roleId = temp;
          room.gameState.nightLogs.push(`醉鬼 [${player.name}] 盲换了第 ${data.centerIndex + 1} 张底牌`);
          if (typeof callback === 'function') {
            callback({
              success: true,
              type: 'DRUNK',
              centerIndex: data.centerIndex,
              result: `你已将自己的牌与第 ${data.centerIndex + 1} 张底牌盲目对调（不能看换到了什么）！`
            });
          }
        }
      }
      // 5. 失眠者查看自己当前牌
      else if (role === 'INSOMNIAC') {
        room.gameState.nightLogs.push(`失眠者 [${player.name}] 醒来确认了自己的身份`);
        if (typeof callback === 'function') {
          callback({
            success: true,
            type: 'INSOMNIAC',
            role: ROLES[player.currentRole],
            result: `你目前的最新最终身份牌是: [${ROLES[player.currentRole].name} ${ROLES[player.currentRole].icon}]！`
          });
        }
      }
      // 6. 狼人独狼单独看底牌
      else if (role === 'WEREWOLF' && typeof data.centerIndex === 'number') {
        const center = room.gameState.centerCards[data.centerIndex];
        if (center) {
          room.gameState.nightLogs.push(`独狼 [${player.name}] 偷看了一张桌中底牌`);
          if (typeof callback === 'function') {
            callback({
              success: true,
              type: 'WEREWOLF_CENTER',
              centerIndex: data.centerIndex,
              role: ROLES[center.roleId],
              result: `独狼查看桌中第 ${data.centerIndex + 1} 张底牌为: [${ROLES[center.roleId].name} ${ROLES[center.roleId].icon}]`
            });
          }
        }
      }
    });

    // 投出处决票
    socket.on('cast_vote', (targetId) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.gameState.phase !== 'VOTING') return;
      const player = room.players.get(currentPlayerId);
      if (!player || !player.isAlive || player.hasVoted) return;

      player.hasVoted = true;
      room.gameState.votes[currentPlayerId] = targetId;

      broadcastRoom(werewolfIo, room);
      checkAllVoted(werewolfIo, room);
    });

    // 再来一局 (重回大厅)
    socket.on('play_again', () => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      room.gameState.phase = 'LOBBY';
      room.gameState.activeNightStep = null;
      room.gameState.votes = {};
      room.gameState.executedPlayers = [];
      room.gameState.winnerTeam = null;

      for (const p of room.players.values()) {
        p.isAlive = true;
        p.hasVoted = false;
        p.nightDone = false;
        p.initialRole = null;
        p.currentRole = null;
      }

      broadcastRoom(werewolfIo, room);
    });

    // 掉线
    socket.on('disconnect', () => {
      if (!currentRoomCode || !currentPlayerId) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const p = room.players.get(currentPlayerId);
      if (p) {
        p.isOnline = false;
        // 若在投票阶段掉线，自动视为弃投或随机投
        if (room.gameState.phase === 'VOTING' && !p.hasVoted) {
          p.hasVoted = true;
          checkAllVoted(werewolfIo, room);
        }
        broadcastRoom(werewolfIo, room);
      }
    });
  });
}

module.exports = { setupWerewolf };
