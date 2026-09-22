// Werewolf Game Server (聚会狼人杀服务端逻辑)

const {
  TEAMS,
  ROLES,
  BOARD_PRESETS,
  getOneNightPreset,
  getClassicPreset,
  getDealerPreset,
  validateBoardSettings,
  getRolePoolFromSettings
} = require('./roles');

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
  const s = hostPlayer.settings || {};
  const mode = s.mode || 'CLASSIC';
  const isDealer = mode === 'DEALER';
  const isGod = isDealer ? true : !!(s.isGodMode === true || s.isGodMode === 'true');

  const room = {
    code,
    hostId: hostPlayer.id,
    godId: isGod ? hostPlayer.id : null,
    pendingGodRequests: new Map(),
    createdAt: Date.now(),
    lastActiveTime: Date.now(),
    settings: {
      mode, // 'CLASSIC', 'ONE_NIGHT' 或 'DEALER'
      isGodMode: isGod,
      boardPreset: s.boardPreset || '9_STANDARD',
      firstDaySheriffTiming: s.firstDaySheriffTiming || 'BEFORE_DEATH_ANNOUNCE',
      witchSelfSave: s.witchSelfSave || 'FIRST_NIGHT_ONLY',
      witchDoublePotion: !!s.witchDoublePotion,
      guardWitchConflict: s.guardWitchConflict || 'DIE',
      hasSheriff: s.hasSheriff !== undefined ? !!s.hasSheriff : true,
      winCondition: s.winCondition || 'KILL_SIDE',
      lastWordsRule: s.lastWordsRule || 'FIRST_NIGHT_AND_DAY',
      discussionTime: s.discussionTime || 180,
      customRoles: s.customRoles || null
    },
    players: new Map([[
      hostPlayer.id,
      {
        id: hostPlayer.id,
        socketId: hostPlayer.socketId,
        name: escapeHtml(hostPlayer.name || '房主'),
        avatar: escapeHtml(hostPlayer.avatar || '😎'),
        isHost: true,
        isGod: isGod,
        isSpectator: isGod,
        seatNumber: isGod ? 0 : 1,
        isOnline: true,
        isAi: false,
        isAlive: true,
        initialRole: isGod ? 'GOD' : null,
        currentRole: isGod ? 'GOD' : null,
        hasVoted: false,
        nightDone: false
      }
    ]]),
    gameState: {
      phase: 'LOBBY', // LOBBY, NIGHT, DAY_DISCUSSION, VOTING, GAME_OVER
      round: 1,
      sheriffPlayerId: null,
      currentSpeakerId: null,
      currentSpeechScript: '',
      isDeadFakeCall: false,
      stepHistory: [], // 用于 ⏪ 上一步撤回
      centerCards: [], // 一夜模式桌中 3 张底牌: [{ id, roleId }]
      activeNightStep: null, // 当前夜晚行动角色 ID
      nightLogs: [], // 夜晚发生的动作日志
      votes: {}, // { voterId: targetPlayerId }
      nightActions: {}, // 暂存玩家夜晚操作
      nightRecord: {
        guardTarget: null,
        lastGuardedTarget: null,
        wolfTarget: null,
        witchSaveUsed: false,
        witchPoisonUsed: false,
        witchSaveTarget: null,
        witchPoisonTarget: null,
        seerTarget: null,
        seerResult: null
      },
      dayRecord: {
        deadTonight: [],
        executedToday: null,
        pkCandidates: [],
        isPkRound: false
      },
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
  const isDealerMode = room.settings && room.settings.mode === 'DEALER';
  const godId = room.godId || ((room.settings && room.settings.isGodMode) || isDealerMode ? room.hostId : null);
  const isTargetGod = !!(godId && targetPlayerId === godId);

  const playersList = Array.from(room.players.values()).map(p => {
    const isMe = p.id === targetPlayerId;
    const canSeeRole = isMe || isGameOver || isTargetGod;
    const isThisPlayerGod = p.id === godId;
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      seatNumber: p.seatNumber,
      isHost: p.isHost,
      isGod: isThisPlayerGod,
      isSpectator: isThisPlayerGod,
      isOnline: p.isOnline,
      isAi: p.isAi,
      isAlive: p.isAlive,
      hasVoted: p.hasVoted,
      nightDone: p.nightDone,
      isSheriff: room.gameState.sheriffPlayerId === p.id,
      isImmuneExiled: !!p.isImmuneExiled,
      canShoot: isTargetGod ? !!p.canShoot : undefined,
      initialRole: canSeeRole ? p.initialRole : null,
      currentRole: (isGameOver || isTargetGod) ? p.currentRole : null
    };
  });

  const isGodExclusiveMode = !!(room.settings && (room.settings.isGodMode || isDealerMode));
  const playingCount = isGodExclusiveMode
    ? Array.from(room.players.values()).filter(p => p.id !== godId).length
    : room.players.size;

  const deckPool = (room.settings.mode === 'ONE_NIGHT')
    ? getOneNightPreset(playingCount)
    : (isDealerMode)
      ? getDealerPreset(playingCount, room.settings.boardPreset)
      : getRolePoolFromSettings(room.settings, playingCount);

  // 上帝全知底牌名单 (物理座次一览表: 1..N 号玩家姓名、座位、底牌与阵营)
  const godOverview = isTargetGod ? Array.from(room.players.values())
    .filter(p => p.id !== godId && p.seatNumber)
    .sort((a, b) => a.seatNumber - b.seatNumber)
    .map(p => {
      const def = ROLES[p.initialRole] || { name: p.initialRole || '未知', icon: '❓', color: '#cbd5e1', team: 'VILLAGER' };
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        seatNumber: p.seatNumber,
        isAlive: p.isAlive,
        roleId: p.initialRole,
        roleName: def.name,
        roleIcon: def.icon,
        roleColor: def.color,
        team: def.team,
        teamName: def.team === TEAMS.WEREWOLF ? '狼人阵营' : (def.team === TEAMS.TANNER ? '制皮匠' : '好人阵营')
      };
    }) : null;

  return {
    code: room.code,
    hostId: room.hostId,
    godId: godId,
    settings: room.settings,
    myPlayerId: targetPlayerId,
    mySeatNumber: myPlayer ? myPlayer.seatNumber : 0,
    myRole: (myPlayer && myPlayer.initialRole && ROLES[myPlayer.initialRole]) ? ROLES[myPlayer.initialRole] : null,
    godOverview,
    myPlayer: myPlayer ? {
      id: myPlayer.id,
      name: myPlayer.name,
      avatar: myPlayer.avatar,
      seatNumber: myPlayer.seatNumber,
      isHost: myPlayer.isHost,
      isGod: myPlayer.id === godId,
      isSpectator: myPlayer.id === godId,
      isAlive: myPlayer.isAlive,
      hasVoted: myPlayer.hasVoted,
      nightDone: myPlayer.nightDone,
      isSheriff: room.gameState.sheriffPlayerId === myPlayer.id,
      isImmuneExiled: !!myPlayer.isImmuneExiled,
      canShoot: !!myPlayer.canShoot,
      initialRole: myPlayer.initialRole,
      currentRole: (isGameOver || isTargetGod) ? myPlayer.currentRole : null
    } : null,
    players: playersList,
    deckPool,
    gameState: {
      phase: room.gameState.phase,
      round: room.gameState.round,
      mode: room.settings.mode,
      sheriffPlayerId: room.gameState.sheriffPlayerId,
      currentSpeakerId: room.gameState.currentSpeakerId,
      currentSpeechScript: room.gameState.currentSpeechScript || '',
      isDeadFakeCall: !!room.gameState.isDeadFakeCall,
      nightRecord: isTargetGod ? room.gameState.nightRecord : null,
      dayRecord: room.gameState.dayRecord,
      activeNightStep: room.gameState.activeNightStep,
      timerDeadline: room.gameState.timerDeadline,
      discussionTime: room.settings.discussionTime,
      votes: (room.gameState.phase === 'VOTING' || isGameOver || isTargetGod) ? room.gameState.votes : {},
      executedPlayers: room.gameState.executedPlayers,
      winnerTeam: room.gameState.winnerTeam,
      winnerRole: room.gameState.winnerRole,
      nightLogs: (isGameOver || isTargetGod) ? room.gameState.nightLogs : [],
      centerCards: (isGameOver || isTargetGod) ? room.gameState.centerCards : (room.gameState.centerCards.length > 0 ? [{}, {}, {}] : [])
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

  const isDealerMode = room.settings && room.settings.mode === 'DEALER';
  const godId = room.godId || ((room.settings && room.settings.isGodMode) || isDealerMode ? room.hostId : null);
  const isGodMode = !!(godId && ((room.settings && room.settings.isGodMode) || isDealerMode));
  const allPlayers = Array.from(room.players.values());
  const playingPlayers = isGodMode ? allPlayers.filter(p => p.id !== godId) : allPlayers;
  const count = playingPlayers.length;

  if (isGodMode && godId) {
    const god = room.players.get(godId);
    if (god) {
      god.isGod = true;
      god.isSpectator = true;
      god.initialRole = 'GOD';
      god.currentRole = 'GOD';
      god.seatNumber = 0;
    }
  }

  // 给普通参战玩家分配座位号 1..N
  playingPlayers.forEach((p, idx) => {
    p.seatNumber = idx + 1;
    p.isAlive = true;
    p.hasVoted = false;
    p.nightDone = false;
    p.isGod = false;
    p.isSpectator = false;
  });

  const rolePool = isDealerMode
    ? getDealerPreset(count, room.settings.boardPreset)
    : getRolePoolFromSettings(room.settings, count);

  // 洗牌
  for (let i = rolePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
  }

  // 给玩家发牌
  playingPlayers.forEach((p, idx) => {
    p.initialRole = rolePool[idx];
    p.currentRole = rolePool[idx];
  });

  // 如果是 DEALER 极简发牌助手模式:
  if (isDealerMode) {
    room.gameState.phase = 'DEAL_VIEW';
    room.gameState.round = 1;
    room.gameState.nightLogs = [];
    room.gameState.votes = {};
    room.gameState.executedPlayers = [];
    room.gameState.winnerTeam = null;
    room.gameState.winnerRole = null;
    broadcastRoom(werewolfIo, room);
    werewolfIo.to(room.code).emit('cards_dealt');
    return;
  }

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
  room.gameState.round = 1;
  room.gameState.nightLogs = [];
  room.gameState.votes = {};
  room.gameState.executedPlayers = [];
  room.gameState.winnerTeam = null;
  room.gameState.winnerRole = null;
  room.gameState.stepHistory = [];
  room.gameState.nightRecord = {
    guardTarget: null,
    lastGuardedTarget: null,
    wolfTarget: null,
    witchSaveUsed: false,
    witchPoisonUsed: false,
    witchSaveTarget: null,
    witchPoisonTarget: null,
    seerTarget: null,
    seerResult: null
  };
  room.gameState.dayRecord = {
    deadTonight: [],
    executedToday: null,
    pkCandidates: [],
    isPkRound: false
  };

  if (isGodMode) {
    room.gameState.activeNightStep = 'NIGHT_FALL';
    room.gameState.currentSpeechScript = '天黑请闭眼。请所有玩家低下头，闭上双眼，不要发出任何声音。';
    broadcastRoom(werewolfIo, room);
    werewolfIo.to(room.code).emit('night_fallen');
    return;
  }

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

/**
 * 依据阶段生成上帝大字提词台词
 */
function getGodPrompterScript(room, step, extra = {}) {
  switch (step) {
    case 'NIGHT_FALL':
      return '天黑请闭眼。请所有玩家低下头，闭上双眼，不要发出任何声音。';
    case 'GUARD':
      return '守卫请睁眼。守卫请示意你今晚要守护的玩家号码……守卫请闭眼。';
    case 'WEREWOLF':
      return '狼人请睁眼。狼人请互认同伴……请比划手势示意今晚要击杀的玩家号码……狼人请闭眼。';
    case 'WITCH': {
      const wolfTarget = room.players.get(room.gameState.nightRecord.wolfTarget);
      if (wolfTarget) {
        return `女巫请睁眼。今晚 ${wolfTarget.seatNumber}号 [${wolfTarget.name}] 倒台了，你有一瓶解药要使用吗？……你有一瓶毒药要使用吗？……女巫请闭眼。`;
      }
      return '女巫请睁眼。今晚 TA 倒台了，你有一瓶解药要使用吗？……你有一瓶毒药要使用吗？……女巫请闭眼。';
    }
    case 'SEER':
      return '预言家请睁眼。请指出你今晚想要查验的玩家号码……TA 的身份是这个……预言家请闭眼。';
    case 'NIGHT_END':
      return '夜晚行动全部结束。上帝请核对夜间记录，确认无误后点击天亮！';
    case 'DAY_SHERIFF':
      return '天亮了，昨夜死讯暂不公布。现在进入警长竞选，请上警的玩家举手示意！';
    case 'DAY_DEATH_ANNOUNCE': {
      const deadList = (extra && extra.deadTonight) || room.gameState.dayRecord.deadTonight || [];
      if (deadList.length === 0) {
        return '天亮了，大家请睁眼。昨夜是——平安夜！';
      }
      const names = deadList.map(p => `${p.seatNumber}号 [${p.name}]`).join('、');
      return `天亮了，大家请睁眼。昨夜出局的玩家是 ${names}。`;
    }
    case 'DAY_DISCUSS':
      return extra.speakerText
        ? `请 ${extra.speakerText} 开始顺序发言。`
        : '现在进入白天自由发言阶段。';
    case 'DAY_VOTING':
      return '发言结束，所有存活玩家请准备，3、2、1，请举手投票！';
    case 'DAY_PK_DISCUSS':
      return '平票玩家进行 PK 发言，请按顺序依次陈词。';
    case 'DAY_PK_VOTE':
      return 'PK 发言结束，除 PK 玩家外的其余存活玩家请举手投票！';
    case 'DAY_PEACE_DAY':
      return '二次投票仍然平票，今日为平安日，无人被放逐！';
    default:
      return '';
  }
}

function checkRoleStatus(room, roleId) {
  const playing = Array.from(room.players.values()).filter(p => !p.isGod);
  const playersWithRole = playing.filter(p => p.initialRole === roleId);
  if (playersWithRole.length === 0) {
    return { inGame: false, isAllDead: false };
  }
  const isAllDead = playersWithRole.every(p => !p.isAlive);
  return { inGame: true, isAllDead };
}

function getNightSequence(room) {
  const guardStatus = checkRoleStatus(room, 'GUARD');
  if (guardStatus.inGame) {
    return ['NIGHT_FALL', 'GUARD', 'WEREWOLF', 'WITCH', 'SEER', 'NIGHT_END'];
  }
  return ['NIGHT_FALL', 'WEREWOLF', 'WITCH', 'SEER', 'NIGHT_END'];
}

function resolveNightDeaths(room) {
  const rec = room.gameState.nightRecord;
  const deadTonightIds = [];

  // 1. 狼刀与守卫、女巫救
  if (rec.wolfTarget) {
    const isGuarded = (rec.guardTarget === rec.wolfTarget);
    const isSaved = (rec.witchSaveTarget === rec.wolfTarget);

    if (isGuarded && isSaved && room.settings.guardWitchConflict === 'DIE') {
      // 奶穿：同时被守且被救则判定死亡
      deadTonightIds.push(rec.wolfTarget);
    } else if (!isGuarded && !isSaved) {
      deadTonightIds.push(rec.wolfTarget);
    }
  }

  // 2. 女巫下毒
  if (rec.witchPoisonTarget && !deadTonightIds.includes(rec.witchPoisonTarget)) {
    deadTonightIds.push(rec.witchPoisonTarget);
  }

  // 3. 执行死亡与标记猎人/狼王开枪
  const deadTonightPlayers = [];
  deadTonightIds.forEach(id => {
    const p = room.players.get(id);
    if (p && p.isAlive) {
      p.isAlive = false;
      const isPoisoned = (id === rec.witchPoisonTarget);
      if (p.initialRole === 'HUNTER') {
        p.canShoot = !isPoisoned;
      }
      if (p.initialRole === 'WOLF_KING') {
        p.canShoot = !isPoisoned;
      }
      deadTonightPlayers.push({
        id: p.id,
        name: p.name,
        seatNumber: p.seatNumber,
        role: p.initialRole,
        canShoot: !!p.canShoot
      });
    }
  });

  room.gameState.dayRecord.deadTonight = deadTonightPlayers;
  room.gameState.nightRecord.lastGuardedTarget = rec.guardTarget;
  return deadTonightPlayers;
}

function checkGameWinner(room) {
  if (room.settings.mode === 'ONE_NIGHT') return null;

  const playing = Array.from(room.players.values()).filter(p => !p.isGod);
  const alivePlayers = playing.filter(p => p.isAlive);

  const aliveWolves = alivePlayers.filter(p => ['WEREWOLF', 'WHITE_WOLF', 'WOLF_KING'].includes(p.initialRole));
  const aliveCivilians = alivePlayers.filter(p => p.initialRole === 'VILLAGER');
  const aliveGods = alivePlayers.filter(p => ['SEER', 'WITCH', 'HUNTER', 'GUARD', 'IDIOT'].includes(p.initialRole));
  const aliveGoods = alivePlayers.filter(p => !['WEREWOLF', 'WHITE_WOLF', 'WOLF_KING', 'MINION'].includes(p.initialRole));

  // 狼人全部出局
  if (aliveWolves.length === 0) {
    if (aliveGoods.length === 0) {
      return { winnerTeam: 'TIE', winnerRole: '同归于尽 · 平局！(场上好人与恶狼同时全灭！)' };
    }
    return { winnerTeam: TEAMS.VILLAGER, winnerRole: '好人正义阵营获胜！(所有恶狼已被全部剿灭！)' };
  }

  // 屠边判定
  if (room.settings.winCondition === 'KILL_SIDE') {
    if (aliveCivilians.length === 0) {
      return { winnerTeam: TEAMS.WEREWOLF, winnerRole: '狼人阵营获胜！(平民已被屠杀殆尽，恶狼屠边成功！)' };
    }
    if (aliveGods.length === 0) {
      return { winnerTeam: TEAMS.WEREWOLF, winnerRole: '狼人阵营获胜！(神职已被屠杀殆尽，恶狼屠边成功！)' };
    }
  } else {
    // 屠城判定 (KILL_ALL)
    if (aliveGoods.length === 0) {
      return { winnerTeam: TEAMS.WEREWOLF, winnerRole: '狼人阵营获胜！(好人全员阵亡，恶狼屠城成功！)' };
    }
  }

  return null;
}

function setupWerewolf(io, app) {
  const werewolfIo = io.of('/werewolf');

  werewolfIo.on('connection', (socket) => {
    let currentRoomCode = null;
    let currentPlayerId = null;

    // 创建房间
    socket.on('create_room', (playerData, callback) => {
      try {
        const player = {
          id: playerData.id || playerData.playerId || socket.id,
          socketId: socket.id,
          name: playerData.name || playerData.nickname || '房主',
          avatar: playerData.avatar || '😎',
          settings: playerData.settings
        };
        const room = createRoom(player);
        currentRoomCode = room.code;
        currentPlayerId = player.id;
        socket.join(room.code);

        const safeData = getSafeRoomData(room, player.id);
        if (typeof callback === 'function') callback({ success: true, roomCode: room.code, room: safeData });
        broadcastRoom(werewolfIo, room);
      } catch (err) {
        console.error('create_room error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '创建失败' });
      }
    });

    // 加入房间
    socket.on('join_room', (data, callback) => {
      try {
        const roomCode = data.roomCode;
        const room = rooms.get(roomCode);
        if (!room) {
          if (typeof callback === 'function') callback({ success: false, message: '房间号不存在' });
          return;
        }

        const rawPlayer = data.player || data;
        const pid = rawPlayer.id || rawPlayer.playerId || socket.id;
        const pName = rawPlayer.nickname || rawPlayer.name;
        const pAvatar = rawPlayer.avatar;

        currentRoomCode = roomCode;
        currentPlayerId = pid;
        socket.join(roomCode);

        const isDealerMode = room.settings && room.settings.mode === 'DEALER';
        const godId = room.godId || ((room.settings && room.settings.isGodMode) || isDealerMode ? room.hostId : null);

        if (room.players.has(pid)) {
          const existing = room.players.get(pid);
          existing.socketId = socket.id;
          existing.isOnline = true;
          if (pName) existing.name = escapeHtml(pName);
          if (pAvatar) existing.avatar = escapeHtml(pAvatar);
        } else {
          const currentHumans = Array.from(room.players.values()).filter(p => p.id !== godId);
          const seatNum = currentHumans.length + 1;
          room.players.set(pid, {
            id: pid,
            socketId: socket.id,
            name: escapeHtml(pName || `玩家${seatNum}`),
            avatar: escapeHtml(pAvatar || '🤠'),
            seatNumber: seatNum,
            isHost: false,
            isGod: false,
            isSpectator: false,
            isOnline: true,
            isAi: false,
            isAlive: true,
            initialRole: null,
            currentRole: null,
            hasVoted: false,
            nightDone: false
          });
        }

        const safeData = getSafeRoomData(room, pid);
        if (typeof callback === 'function') callback({ success: true, roomCode, room: safeData });
        broadcastRoom(werewolfIo, room);
      } catch (err) {
        console.error('join_room error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '加入失败' });
      }
    });

    // 重新连接恢复房间状态
    socket.on('reconnect_room', ({ roomCode, playerId }, callback) => {
      try {
        const room = rooms.get(roomCode);
        if (!room) {
          if (typeof callback === 'function') callback({ success: false, error: '房间不存在' });
          return;
        }
        const player = room.players.get(playerId);
        if (!player) {
          if (typeof callback === 'function') callback({ success: false, error: '玩家不存在' });
          return;
        }

        player.socketId = socket.id;
        player.isOnline = true;
        currentRoomCode = room.code;
        currentPlayerId = player.id;
        socket.join(room.code);

        broadcastRoom(werewolfIo, room);
        const safeData = getSafeRoomData(room, player.id);
        if (typeof callback === 'function') callback({ success: true, roomData: safeData });
      } catch (err) {
        console.error('werewolf reconnect_room error:', err);
        if (typeof callback === 'function') callback({ success: false, error: '重连异常' });
      }
    });

    // 更新房间设置
    socket.on('update_settings', (newSettings, callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) {
        if (typeof callback === 'function') callback({ success: false, message: '无权限修改设置' });
        return;
      }
      if (room.gameState.phase !== 'LOBBY') {
        if (typeof callback === 'function') callback({ success: false, message: '游戏中无法修改设置' });
        return;
      }

      if (newSettings && typeof newSettings === 'object') {
        Object.assign(room.settings, newSettings);
        if (newSettings.isGodMode !== undefined) {
          const host = room.players.get(room.hostId);
          if (host) {
            host.isGod = !!newSettings.isGodMode;
            host.isSpectator = !!newSettings.isGodMode;
          }
        }
      }

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true, settings: room.settings });
    });

    socket.on('god_update_rules', (data, callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;
      if (data && data.settings) {
        Object.assign(room.settings, data.settings);
        if (data.settings.isGodMode !== undefined) {
          const host = room.players.get(room.hostId);
          if (host) {
            host.isGod = !!data.settings.isGodMode;
            host.isSpectator = !!data.settings.isGodMode;
          }
        }
      }
      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true, settings: room.settings });
    });

    // 切换游戏模式 (一夜终极 / 经典 / 极简发牌助手)
    socket.on('change_mode', (newMode) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;
      if (room.gameState.phase !== 'LOBBY') return;
      if (['ONE_NIGHT', 'CLASSIC', 'DEALER'].includes(newMode)) {
        room.settings.mode = newMode;
        if (newMode === 'DEALER') {
          room.settings.isGodMode = true;
          room.godId = room.godId || room.hostId;
          const host = room.players.get(room.hostId);
          if (host && room.godId === room.hostId) {
            host.isGod = true;
            host.isSpectator = true;
          }
        }
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

    // 开始游戏 / 一键发牌
    socket.on('start_game', (data, callback) => {
      const cb = (typeof data === 'function') ? data : callback;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const isDealerMode = room.settings && room.settings.mode === 'DEALER';
      const godId = room.godId || ((room.settings && room.settings.isGodMode) || isDealerMode ? room.hostId : null);
      const isAllowed = isDealerMode
        ? (currentPlayerId === room.hostId || (godId && currentPlayerId === godId))
        : (room.hostId === currentPlayerId);

      if (!isAllowed) {
        if (typeof cb === 'function') cb({ success: false, message: '无权发牌或开始游戏' });
        return;
      }
      if (room.gameState.phase !== 'LOBBY') return;

      const playingCount = (room.settings && (room.settings.isGodMode || isDealerMode))
        ? Array.from(room.players.values()).filter(p => p.id !== godId).length
        : room.players.size;

      if (playingCount < 3) {
        if (typeof cb === 'function') cb({ success: false, message: '至少需要 3 名参战玩家才能开局！' });
        return;
      }

      startGame(werewolfIo, room);
      if (typeof cb === 'function') cb({ success: true });
    });

    // 申请接任上帝 / 法官 (普通玩家发起，需当前上帝审批同意)
    socket.on('request_god', (callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, message: '房间不存在' });
        return;
      }
      const isDealerMode = room.settings && room.settings.mode === 'DEALER';
      const godId = room.godId || ((room.settings && room.settings.isGodMode) || isDealerMode ? room.hostId : null);

      if (currentPlayerId === godId) {
        if (typeof callback === 'function') callback({ success: false, message: '你当前已经是本局上帝/法官了' });
        return;
      }

      const applicant = room.players.get(currentPlayerId);
      if (!applicant) {
        if (typeof callback === 'function') callback({ success: false, message: '玩家不存在' });
        return;
      }

      const currentGod = room.players.get(godId);
      if (!currentGod || !currentGod.isOnline) {
        // 若当前上帝已离线，直接允许继位
        if (currentGod) {
          currentGod.isGod = false;
          currentGod.isSpectator = false;
        }
        applicant.isGod = true;
        applicant.isSpectator = true;
        applicant.initialRole = 'GOD';
        applicant.currentRole = 'GOD';
        applicant.seatNumber = 0;
        room.godId = applicant.id;
        broadcastRoom(werewolfIo, room);
        if (typeof callback === 'function') callback({ success: true, message: '前任上帝已离线，你已接任上帝！' });
        return;
      }

      if (!room.pendingGodRequests) room.pendingGodRequests = new Map();
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      room.pendingGodRequests.set(requestId, {
        applicantId: currentPlayerId,
        applicantName: applicant.name,
        socketId: socket.id
      });

      // 发送审批通知至当前上帝
      if (currentGod.socketId) {
        werewolfIo.to(currentGod.socketId).emit('god_request_received', {
          requestId,
          applicantId: currentPlayerId,
          applicantName: applicant.name
        });
      }

      if (typeof callback === 'function') callback({ success: true, message: '申请已提交，等待当前上帝审批' });
    });

    // 当前上帝审批让位申请
    socket.on('respond_god_request', ({ requestId, approved }, callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const isDealerMode = room.settings && room.settings.mode === 'DEALER';
      const godId = room.godId || ((room.settings && room.settings.isGodMode) || isDealerMode ? room.hostId : null);

      if (currentPlayerId !== godId) {
        if (typeof callback === 'function') callback({ success: false, message: '只有当前上帝有权审批' });
        return;
      }

      if (!room.pendingGodRequests || !room.pendingGodRequests.has(requestId)) {
        if (typeof callback === 'function') callback({ success: false, message: '申请已失效或不存在' });
        return;
      }

      const req = room.pendingGodRequests.get(requestId);
      room.pendingGodRequests.delete(requestId);

      const applicant = room.players.get(req.applicantId);
      const currentGod = room.players.get(godId);

      if (approved && applicant) {
        // 当前上帝让位退位
        if (currentGod) {
          currentGod.isGod = false;
          currentGod.isSpectator = false;
          currentGod.initialRole = null;
          currentGod.currentRole = null;
        }
        applicant.isGod = true;
        applicant.isSpectator = true;
        applicant.initialRole = 'GOD';
        applicant.currentRole = 'GOD';
        applicant.seatNumber = 0;
        room.godId = applicant.id;

        broadcastRoom(werewolfIo, room);
        if (req.socketId) {
          werewolfIo.to(req.socketId).emit('god_request_approved');
        }
      } else {
        if (req.socketId) {
          werewolfIo.to(req.socketId).emit('god_request_rejected', { message: '当前上帝拒绝了让位申请' });
        }
      }

      if (typeof callback === 'function') callback({ success: true, approved });
    });

    // 当前上帝主动移交法官
    socket.on('transfer_god', ({ targetPlayerId }, callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const isDealerMode = room.settings && room.settings.mode === 'DEALER';
      const godId = room.godId || ((room.settings && room.settings.isGodMode) || isDealerMode ? room.hostId : null);

      if (currentPlayerId !== godId) {
        if (typeof callback === 'function') callback({ success: false, message: '只有当前上帝有权主动移交' });
        return;
      }

      const targetPlayer = room.players.get(targetPlayerId);
      if (!targetPlayer) {
        if (typeof callback === 'function') callback({ success: false, message: '目标玩家不存在' });
        return;
      }

      const currentGod = room.players.get(godId);
      if (currentGod) {
        currentGod.isGod = false;
        currentGod.isSpectator = false;
        currentGod.initialRole = null;
        currentGod.currentRole = null;
      }

      targetPlayer.isGod = true;
      targetPlayer.isSpectator = true;
      targetPlayer.initialRole = 'GOD';
      targetPlayer.currentRole = 'GOD';
      targetPlayer.seatNumber = 0;
      room.godId = targetPlayer.id;

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true, newGodId: targetPlayer.id });
    });

    // 重新洗牌发牌 (redeal_cards)
    socket.on('redeal_cards', (data, callback) => {
      const cb = (typeof data === 'function') ? data : callback;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const isDealerMode = room.settings && room.settings.mode === 'DEALER';
      const godId = room.godId || ((room.settings && room.settings.isGodMode) || isDealerMode ? room.hostId : null);
      const isAllowed = isDealerMode
        ? (currentPlayerId === room.hostId || (godId && currentPlayerId === godId))
        : (room.hostId === currentPlayerId);

      if (!isAllowed) {
        if (typeof cb === 'function') cb({ success: false, message: '无权重新发牌' });
        return;
      }

      startGame(werewolfIo, room);
      werewolfIo.to(room.code).emit('cards_redealt');
      if (typeof cb === 'function') cb({ success: true });
    });

    // 返回大厅 (从发牌视图返回大厅)
    socket.on('return_to_lobby', (data, callback) => {
      const cb = (typeof data === 'function') ? data : callback;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const isDealerMode = room.settings && room.settings.mode === 'DEALER';
      const godId = room.godId || ((room.settings && room.settings.isGodMode) || isDealerMode ? room.hostId : null);
      const isAllowed = isDealerMode
        ? (currentPlayerId === room.hostId || (godId && currentPlayerId === godId))
        : (room.hostId === currentPlayerId);

      if (!isAllowed) {
        if (typeof cb === 'function') cb({ success: false, message: '无权返回大厅' });
        return;
      }

      room.gameState.phase = 'LOBBY';
      for (const p of room.players.values()) {
        p.initialRole = p.isGod ? 'GOD' : null;
        p.currentRole = p.isGod ? 'GOD' : null;
        p.isAlive = true;
        p.hasVoted = false;
        p.nightDone = false;
      }
      broadcastRoom(werewolfIo, room);
      if (typeof cb === 'function') cb({ success: true });
    });

    // 获取当前完整房间脱敏数据
    socket.on('get_room_state', (callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const safeData = getSafeRoomData(room, currentPlayerId);
      if (typeof callback === 'function') callback(safeData);
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

    // 玩家退出房间
    socket.on('leave_room', (callback) => {
      try {
        if (currentRoomCode && currentPlayerId) {
          const room = rooms.get(currentRoomCode);
          if (room) {
            room.players.delete(currentPlayerId);
            socket.leave(currentRoomCode);

            // 房主顺位转移
            if (room.hostId === currentPlayerId) {
              const nextHost = Array.from(room.players.values()).find(p => p.isOnline && !p.isAi);
              if (nextHost) {
                room.hostId = nextHost.id;
                room.players.forEach(p => { p.isHost = (p.id === nextHost.id); });
              }
            }

            const activeHumans = Array.from(room.players.values()).filter(p => p.isOnline && !p.isAi);
            if (activeHumans.length === 0) {
              clearRoomTimer(room);
              rooms.delete(currentRoomCode);
            } else {
              broadcastRoom(werewolfIo, room);
            }
          }
        }
        currentRoomCode = null;
        currentPlayerId = null;
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('werewolf leave_room error:', err);
        if (typeof callback === 'function') callback({ success: false });
      }
    });

    // ===== 上帝模式专属事件 =====

    // 1. 夜间手动推进
    socket.on('god_night_step', ({ roomCode, step, actionData }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) {
        if (typeof callback === 'function') callback({ success: false, message: '无权限' });
        return;
      }
      if (room.gameState.phase !== 'NIGHT') {
        if (typeof callback === 'function') callback({ success: false, message: '非夜晚阶段' });
        return;
      }

      // 保存快照供 ⏪ 上一步撤回
      room.gameState.stepHistory.push({
        activeNightStep: room.gameState.activeNightStep,
        currentSpeechScript: room.gameState.currentSpeechScript,
        isDeadFakeCall: room.gameState.isDeadFakeCall,
        nightRecord: JSON.parse(JSON.stringify(room.gameState.nightRecord))
      });

      const seq = getNightSequence(room);
      const currStep = step || room.gameState.activeNightStep;
      const currIdx = seq.indexOf(currStep);
      const nextStep = (currIdx >= 0 && currIdx < seq.length - 1) ? seq[currIdx + 1] : 'NIGHT_END';

      let seerResultData = null;

      // 录入动作
      if (currStep === 'GUARD') {
        if (actionData && actionData.targetId) {
          room.gameState.nightRecord.guardTarget = actionData.targetId;
        } else {
          room.gameState.nightRecord.guardTarget = null;
        }
      } else if (currStep === 'WEREWOLF') {
        if (actionData && actionData.targetId) {
          room.gameState.nightRecord.wolfTarget = actionData.targetId;
        }
      } else if (currStep === 'WITCH') {
        if (actionData) {
          if (actionData.saveTarget) {
            room.gameState.nightRecord.witchSaveUsed = true;
            room.gameState.nightRecord.witchSaveTarget = actionData.saveTarget;
          }
          if (actionData.poisonTarget) {
            room.gameState.nightRecord.witchPoisonUsed = true;
            room.gameState.nightRecord.witchPoisonTarget = actionData.poisonTarget;
          }
        }
      } else if (currStep === 'SEER') {
        if (actionData && actionData.targetId) {
          room.gameState.nightRecord.seerTarget = actionData.targetId;
          const target = room.players.get(actionData.targetId);
          const isWolf = target ? ['WEREWOLF', 'WHITE_WOLF', 'WOLF_KING'].includes(target.initialRole) : false;
          room.gameState.nightRecord.seerResult = isWolf ? 'WEREWOLF' : 'GOOD';
          seerResultData = {
            success: true,
            isWolf,
            roleName: isWolf ? '狼人' : '好人'
          };
        }
      }

      // 步进到下一阶段
      room.gameState.activeNightStep = nextStep;

      // 检查神职空唤防泄密标记
      if (['GUARD', 'WITCH', 'SEER'].includes(nextStep)) {
        const roleStatus = checkRoleStatus(room, nextStep);
        room.gameState.isDeadFakeCall = roleStatus.inGame && roleStatus.isAllDead;
      } else {
        room.gameState.isDeadFakeCall = false;
      }

      room.gameState.currentSpeechScript = getGodPrompterScript(room, nextStep);
      broadcastRoom(werewolfIo, room);

      if (seerResultData) {
        if (typeof callback === 'function') callback(seerResultData);
      } else {
        if (typeof callback === 'function') callback({ success: true, nextStep });
      }
    });

    // 2. 夜间 ⏪ 上一步撤回
    socket.on('god_night_prev_step', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) {
        if (typeof callback === 'function') callback({ success: false, message: '无权限' });
        return;
      }
      if (room.gameState.stepHistory && room.gameState.stepHistory.length > 0) {
        const snapshot = room.gameState.stepHistory.pop();
        room.gameState.activeNightStep = snapshot.activeNightStep;
        room.gameState.currentSpeechScript = snapshot.currentSpeechScript;
        room.gameState.isDeadFakeCall = snapshot.isDeadFakeCall;
        room.gameState.nightRecord = snapshot.nightRecord;
        broadcastRoom(werewolfIo, room);
        if (typeof callback === 'function') callback({ success: true, restoredStep: snapshot.activeNightStep });
      } else {
        if (typeof callback === 'function') callback({ success: false, message: '没有可撤回的步骤' });
      }
    });

    // 3. 上帝确认天亮结算死伤
    socket.on('god_announce_dawn', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) {
        if (typeof callback === 'function') callback({ success: false, message: '无权限' });
        return;
      }
      if (room.gameState.phase !== 'NIGHT') {
        if (typeof callback === 'function') callback({ success: false, message: '非夜晚阶段' });
        return;
      }

      const deadTonight = resolveNightDeaths(room);

      // 检查胜负
      const winResult = checkGameWinner(room);
      if (winResult) {
        room.gameState.phase = 'GAME_OVER';
        room.gameState.winnerTeam = winResult.winnerTeam;
        room.gameState.winnerRole = winResult.winnerRole;
        broadcastRoom(werewolfIo, room);
        if (typeof callback === 'function') callback({ success: true, deadTonight, phase: 'GAME_OVER' });
        return;
      }

      // 检查首日警长竞选时序
      if (room.gameState.round === 1 && room.settings.hasSheriff) {
        if (room.settings.firstDaySheriffTiming === 'BEFORE_DEATH_ANNOUNCE') {
          room.gameState.phase = 'DAY_SHERIFF';
          room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_SHERIFF');
        } else {
          room.gameState.phase = 'DAY_DEATH_ANNOUNCE';
          room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_DEATH_ANNOUNCE', { deadTonight });
        }
      } else {
        room.gameState.phase = 'DAY_DEATH_ANNOUNCE';
        room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_DEATH_ANNOUNCE', { deadTonight });
      }

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true, deadTonight, phase: room.gameState.phase });
    });

    // 4. 警长竞选与授徽
    socket.on('god_sheriff_action', ({ roomCode, action, targetId }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      if (action === 'elect_badge' && targetId) {
        room.gameState.sheriffPlayerId = targetId;

        // 若时序为先竞选后报死，授徽后进入死讯公告
        if (room.settings.firstDaySheriffTiming === 'BEFORE_DEATH_ANNOUNCE') {
          room.gameState.phase = 'DAY_DEATH_ANNOUNCE';
          room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_DEATH_ANNOUNCE');
        } else {
          room.gameState.phase = 'DAY_DISCUSS';
          room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_DISCUSS');
        }
      } else if (action === 'skip') {
        if (room.settings.firstDaySheriffTiming === 'BEFORE_DEATH_ANNOUNCE') {
          room.gameState.phase = 'DAY_DEATH_ANNOUNCE';
          room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_DEATH_ANNOUNCE');
        } else {
          room.gameState.phase = 'DAY_DISCUSS';
          room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_DISCUSS');
        }
      }

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true, phase: room.gameState.phase });
    });

    // 5. 警长阵亡移交或撕毁警徽
    socket.on('god_transfer_badge', ({ roomCode, action, targetId }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      if (action === 'transfer' && targetId) {
        room.gameState.sheriffPlayerId = targetId;
      } else if (action === 'tear') {
        room.gameState.sheriffPlayerId = null;
        room.settings.hasSheriff = false;
      }

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true, sheriffPlayerId: room.gameState.sheriffPlayerId });
    });

    // 6. 白天发言人标记
    socket.on('god_select_speaker', ({ roomCode, playerId }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      room.gameState.currentSpeakerId = playerId;
      const sp = room.players.get(playerId);
      const spText = sp ? `${sp.seatNumber}号 [${sp.name}]` : '';
      room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_DISCUSS', { speakerText: spText });

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true });
    });

    // 7. 狼人自爆 (普通狼自爆入夜 / 白狼王自爆带人入夜)
    socket.on('god_wolf_explode', ({ roomCode, wolfPlayerId, targetId }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      const wolf = room.players.get(wolfPlayerId);
      if (wolf) wolf.isAlive = false;

      if (targetId) {
        const victim = room.players.get(targetId);
        if (victim) victim.isAlive = false;
      }

      // 检查胜负
      const winResult = checkGameWinner(room);
      if (winResult) {
        room.gameState.phase = 'GAME_OVER';
        room.gameState.winnerTeam = winResult.winnerTeam;
        room.gameState.winnerRole = winResult.winnerRole;
      } else {
        // 自爆直接强制入夜
        room.gameState.phase = 'NIGHT';
        room.gameState.round++;
        room.gameState.activeNightStep = 'NIGHT_FALL';
        room.gameState.currentSpeechScript = getGodPrompterScript(room, 'NIGHT_FALL');
        room.gameState.stepHistory = [];
        room.gameState.nightRecord = {
          guardTarget: null,
          lastGuardedTarget: room.gameState.nightRecord.lastGuardedTarget,
          wolfTarget: null,
          witchSaveUsed: room.gameState.nightRecord.witchSaveUsed,
          witchPoisonUsed: room.gameState.nightRecord.witchPoisonUsed,
          witchSaveTarget: null,
          witchPoisonTarget: null,
          seerTarget: null,
          seerResult: null
        };
      }

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true, phase: room.gameState.phase });
    });

    // 8. 触发平票 PK
    socket.on('god_trigger_pk', ({ roomCode, candidateIds }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      room.gameState.phase = 'DAY_PK_DISCUSS';
      room.gameState.dayRecord.pkCandidates = candidateIds || [];
      room.gameState.dayRecord.isPkRound = true;
      room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_PK_DISCUSS');

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true });
    });

    // 9. 二次投票平票判定平安日
    socket.on('god_peace_day', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      room.gameState.phase = 'DAY_PEACE_DAY';
      room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_PEACE_DAY');

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true });
    });

    // 10. 公投票决出局 (包含白痴翻牌免死)
    socket.on('god_vote_execute', ({ roomCode, targetPlayerId }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      const target = room.players.get(targetPlayerId);
      if (!target) return;

      let isIdiotImmune = false;
      if (target.initialRole === 'IDIOT' && !target.isImmuneExiled) {
        target.isImmuneExiled = true;
        isIdiotImmune = true;
        room.gameState.currentSpeechScript = `${target.seatNumber}号 [${target.name}] 为白痴，翻牌免死，保留发言权但永久失去投票权！`;
      } else {
        target.isAlive = false;
        if (target.initialRole === 'HUNTER' || target.initialRole === 'WOLF_KING') {
          target.canShoot = true;
        }
      }

      room.gameState.dayRecord.executedToday = targetPlayerId;

      // 检查胜负
      const winResult = checkGameWinner(room);
      if (winResult) {
        room.gameState.phase = 'GAME_OVER';
        room.gameState.winnerTeam = winResult.winnerTeam;
        room.gameState.winnerRole = winResult.winnerRole;
      }

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') {
        callback({
          success: true,
          isIdiotImmune,
          canShoot: !!target.canShoot,
          isSheriffDead: room.gameState.sheriffPlayerId === targetPlayerId,
          phase: room.gameState.phase
        });
      }
    });

    // 4.5. 死讯公告完毕，推进至竞选或讨论
    socket.on('god_confirm_death', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      if (room.gameState.round === 1 && room.settings.hasSheriff && room.settings.firstDaySheriffTiming === 'AFTER_DEATH_ANNOUNCE' && !room.gameState.sheriffPlayerId) {
        room.gameState.phase = 'DAY_SHERIFF';
        room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_SHERIFF');
      } else {
        room.gameState.phase = 'DAY_DISCUSS';
        room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_DISCUSS');
      }

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true, phase: room.gameState.phase });
    });

    // 4.6. 发言结束进入公投 / PK投票
    socket.on('god_start_vote', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      if (room.gameState.phase === 'DAY_PK_DISCUSS') {
        room.gameState.phase = 'DAY_PK_VOTE';
        room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_PK_VOTE');
      } else {
        room.gameState.phase = 'DAY_VOTING';
        room.gameState.currentSpeechScript = getGodPrompterScript(room, 'DAY_VOTING');
      }

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true, phase: room.gameState.phase });
    });

    // 10.5. 猎人 / 狼王开枪带人
    socket.on('god_shoot_kill', ({ roomCode, shooterId, targetId }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      const shooter = room.players.get(shooterId);
      if (shooter) {
        shooter.canShoot = false;
      }

      const target = room.players.get(targetId);
      if (target) {
        target.isAlive = false;
        if (target.initialRole === 'HUNTER' || target.initialRole === 'WOLF_KING') {
          target.canShoot = true; // 被枪杀可继续开枪
        }
        room.gameState.currentSpeechScript = `${shooter ? shooter.seatNumber : ''}号 [${shooter ? shooter.name : ''}] 开枪带走了 ${target.seatNumber}号 [${target.name}]！`;
      }

      const winResult = checkGameWinner(room);
      if (winResult) {
        room.gameState.phase = 'GAME_OVER';
        room.gameState.winnerTeam = winResult.winnerTeam;
        room.gameState.winnerRole = winResult.winnerRole;
      }

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') {
        callback({
          success: true,
          phase: room.gameState.phase,
          targetCanShoot: target ? !!target.canShoot : false,
          isSheriffDead: target ? room.gameState.sheriffPlayerId === target.id : false
        });
      }
    });

    // 10.6. 法官直接裁判淘汰违规玩家
    socket.on('god_judge_eliminate', ({ roomCode, targetPlayerId, reason }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      const p = room.players.get(targetPlayerId);
      if (p) {
        p.isAlive = false;
        p.eliminateReason = reason || '裁判裁决淘汰';
      }

      const winResult = checkGameWinner(room);
      if (winResult) {
        room.gameState.phase = 'GAME_OVER';
        room.gameState.winnerTeam = winResult.winnerTeam;
        room.gameState.winnerRole = winResult.winnerRole;
      }

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true, phase: room.gameState.phase });
    });

    // 11. 法官裁判强制终局
    socket.on('god_force_end', ({ roomCode, winnerTeam }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      room.gameState.phase = 'GAME_OVER';
      room.gameState.winnerTeam = winnerTeam || 'TIE';
      room.gameState.winnerRole = '法官裁决强制终局';

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true });
    });

    // 12. 重新发牌洗牌
    socket.on('god_redeal', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      startGame(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true });
    });

    // 13. 进入下一夜 (白天讨论或投票结束后手动进入下一夜)
    socket.on('god_enter_next_night', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode || currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;

      room.gameState.round++;
      room.gameState.phase = 'NIGHT';
      room.gameState.activeNightStep = 'NIGHT_FALL';
      room.gameState.currentSpeechScript = getGodPrompterScript(room, 'NIGHT_FALL');
      room.gameState.stepHistory = [];
      room.gameState.nightRecord = {
        guardTarget: null,
        lastGuardedTarget: room.gameState.nightRecord.lastGuardedTarget,
        wolfTarget: null,
        witchSaveUsed: room.gameState.nightRecord.witchSaveUsed,
        witchPoisonUsed: room.gameState.nightRecord.witchPoisonUsed,
        witchSaveTarget: null,
        witchPoisonTarget: null,
        seerTarget: null,
        seerResult: null
      };
      room.gameState.dayRecord = {
        deadTonight: [],
        executedToday: null,
        pkCandidates: [],
        isPkRound: false
      };

      broadcastRoom(werewolfIo, room);
      if (typeof callback === 'function') callback({ success: true });
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
