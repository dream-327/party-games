// 间谍危机 (Spyfall) - 服务端核心状态机与数据脱敏模块
const {
  CLUSTERS,
  UNIVERSAL_ROLES,
  LOCATIONS,
  getRandomLocation,
  generateCandidateLocations
} = require('./locations');

const rooms = new Map();

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(code));
  return code;
}

const PHASES = {
  LOBBY: 'LOBBY',
  PLAYING: 'PLAYING',
  PAUSED_ACCUSE: 'PAUSED_ACCUSE',
  SPY_GUESSING: 'SPY_GUESSING',
  GAME_OVER: 'GAME_OVER'
};

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const HOST_DISCONNECT_GRACE_PERIOD_MS = 120 * 1000;

function ensureRoomHost(room) {
  if (!room) return;
  const currentHost = room.players.get(room.hostId);

  const isHostMissing = !currentHost;
  const now = Date.now();
  const isHostOfflineTimedOut = currentHost && !currentHost.isOnline && (
    (now - (currentHost.lastOfflineTime || now)) >= HOST_DISCONNECT_GRACE_PERIOD_MS
  );

  if (isHostMissing || isHostOfflineTimedOut) {
    const candidate = Array.from(room.players.values()).find(p => p.isOnline)
      || Array.from(room.players.values())[0];
    if (candidate) {
      room.hostId = candidate.id;
      if (room.hostMigrateTimer) {
        clearTimeout(room.hostMigrateTimer);
        room.hostMigrateTimer = null;
      }
    }
  }

  room.players.forEach(p => {
    p.isHost = (p.id === room.hostId);
  });
}

/**
 * 创建新房间
 */
function createGameRoom(code, hostPlayer, settings = {}) {
  const roomCode = code || generateRoomCode();
  const hostId = (hostPlayer && hostPlayer.id) || `p_${Date.now()}`;
  const host = {
    id: hostId,
    name: escapeHtml((hostPlayer && hostPlayer.name) || '房主'),
    avatar: (hostPlayer && hostPlayer.avatar) || '🤠',
    socketId: (hostPlayer && hostPlayer.socketId) || null,
    isHost: true,
    isOnline: true,
    hasAccused: false,
    role: null,
    isSpy: false
  };

  const parsedDuration = (settings && Number(settings.durationMinutes)) || 8;
  const durationMinutes = Math.min(20, Math.max(3, parsedDuration));
  const room = {
    code: roomCode,
    hostId: host.id,
    createdAt: Date.now(),
    lastActiveTime: Date.now(),
    settings: {
      durationMinutes
    },
    players: new Map([[host.id, host]]),
    spyId: null,
    targetLocation: null,
    candidateLocations: [],
    gameState: {
      phase: PHASES.LOBBY,
      durationMinutes,
      startTime: null,
      expiresAt: null,
      remainingMs: durationMinutes * 60 * 1000,
      isPaused: false,
      winner: null,
      winReason: null,
      firstQuestionerId: null
    },
    currentAccuse: null,
    settlement: null,
    gameEndTimer: null,
    hostMigrateTimer: null,
    _io: null
  };

  rooms.set(roomCode, room);
  return room;
}

/**
 * 开始对局：抽取真实地点、混淆池生成、间谍与平民角色分配、绝对时钟启动
 */
function startGameForRoom(room, settings = {}) {
  if (!room) return { success: false, message: '房间不存在' };
  if (room.players.size < 3) {
    return { success: false, message: '至少需要 3 名玩家才能开始游戏' };
  }

  const parsedDuration = (settings && Number(settings.durationMinutes))
    || (room.settings && room.settings.durationMinutes)
    || 8;
  const durationMinutes = Math.min(20, Math.max(3, parsedDuration));
  room.settings.durationMinutes = durationMinutes;

  // 1. 抽取真实目标地点
  const target = getRandomLocation();
  room.targetLocation = target;

  // 2. 生成近邻混淆候选池（16~18个）
  const candidates = generateCandidateLocations(target.id);
  room.candidateLocations = candidates;

  // 3. 随机抽取一名玩家作为间谍
  const playerIds = Array.from(room.players.keys());
  const spyIndex = Math.floor(Math.random() * playerIds.length);
  const spyId = playerIds[spyIndex];
  room.spyId = spyId;

  // 4. 分配平民身份
  const rolesPool = [...(target.roles || [])];
  for (let i = rolesPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rolesPool[i], rolesPool[j]] = [rolesPool[j], rolesPool[i]];
  }

  const civilians = playerIds.filter(id => id !== spyId);
  civilians.forEach((id, idx) => {
    const p = room.players.get(id);
    let assignedRole;
    if (idx < rolesPool.length) {
      assignedRole = rolesPool[idx];
    } else {
      const uIndex = (idx - rolesPool.length) % UNIVERSAL_ROLES.length;
      assignedRole = UNIVERSAL_ROLES[uIndex] || target.fallbackRole || '普通群众';
    }
    p.isSpy = false;
    p.role = assignedRole;
    p.hasAccused = false;
  });

  const spyPlayer = room.players.get(spyId);
  spyPlayer.isSpy = true;
  spyPlayer.role = '间谍 (Spy)';
  spyPlayer.hasAccused = false;

  // 5. 随机首位发问人
  const firstQuestionerIndex = Math.floor(Math.random() * playerIds.length);
  room.firstQuestionerId = playerIds[firstQuestionerIndex];

  // 6. 绝对时钟初始化
  const durationMs = durationMinutes * 60 * 1000;
  const now = Date.now();

  if (room.gameEndTimer) {
    clearTimeout(room.gameEndTimer);
    room.gameEndTimer = null;
  }

  room.gameState = {
    phase: PHASES.PLAYING,
    durationMinutes,
    startTime: now,
    expiresAt: now + durationMs,
    remainingMs: durationMs,
    isPaused: false,
    winner: null,
    winReason: null,
    firstQuestionerId: room.firstQuestionerId
  };

  room.currentAccuse = null;
  room.settlement = null;

  if (room._io) {
    room.gameEndTimer = setTimeout(() => {
      onTimeExpired(room);
    }, durationMs);
  }

  return { success: true, room };
}

/**
 * 倒计时结束处理
 */
function onTimeExpired(room) {
  if (!room || room.gameState.phase !== PHASES.PLAYING) return;
  room.gameState.phase = PHASES.GAME_OVER;
  room.gameState.winner = 'SPY';
  room.gameState.winReason = '讨论时间归零，平民未找出间谍，间谍获胜！';
  room.gameState.isPaused = true;
  room.gameState.remainingMs = 0;

  if (room._io) {
    room._io.to(room.code).emit('game_over_reveal', getSafePlayerView(room, null).settlement);
    broadcastRoom(room._io, room);
  }
}

/**
 * 严格数据脱敏通信序列化
 * - 游戏进行中：间谍的真实地点为 null，所有其他玩家的 role 为 '???'，isSpy 为 undefined
 * - 候选地点剔除内部 roles 数组
 * - 仅在 GAME_OVER 时公开全员角色及间谍身份
 */
function getSafePlayerView(room, playerId) {
  if (!room) return null;
  ensureRoomHost(room);

  const isGameOver = room.gameState.phase === PHASES.GAME_OVER;
  const isPlayingOrPaused = room.gameState.phase === PHASES.PLAYING ||
    room.gameState.phase === PHASES.PAUSED_ACCUSE ||
    room.gameState.phase === PHASES.SPY_GUESSING;

  // 候选地点列表清洗：剔除 roles 数组
  const allLocations = (room.candidateLocations || []).map(loc => {
    const cluster = CLUSTERS.find(c => c.id === loc.clusterId);
    return {
      id: loc.id,
      name: loc.name,
      icon: loc.icon,
      clusterId: loc.clusterId,
      category: cluster ? cluster.name : (loc.clusterId || '')
    };
  });

  // 玩家自身专属视角
  const me = room.players.get(playerId);
  let selfData = null;
  if (me) {
    let selfIsSpy = false;
    let selfLocation = null;
    let selfLocationIcon = null;
    let selfRole = null;

    if (isGameOver) {
      selfIsSpy = (me.id === room.spyId);
      selfLocation = room.targetLocation ? room.targetLocation.name : null;
      selfLocationIcon = room.targetLocation ? room.targetLocation.icon : null;
      selfRole = selfIsSpy ? '间谍 (Spy)' : me.role;
    } else if (isPlayingOrPaused) {
      if (me.id === room.spyId) {
        selfIsSpy = true;
        selfLocation = null;
        selfLocationIcon = '❓';
        selfRole = '间谍 (Spy)';
      } else {
        selfIsSpy = false;
        selfLocation = room.targetLocation ? room.targetLocation.name : null;
        selfLocationIcon = room.targetLocation ? room.targetLocation.icon : null;
        selfRole = me.role;
      }
    }

    selfData = {
      id: me.id,
      name: me.name,
      avatar: me.avatar,
      isHost: me.id === room.hostId,
      isOnline: !!me.isOnline,
      hasAccused: !!me.hasAccused,
      isSpy: selfIsSpy,
      location: selfLocation,
      locationIcon: selfLocationIcon,
      role: selfRole
    };
  }

  // 场上全员视角（未结束时绝密脱敏：他人 role: '???', isSpy: undefined）
  const playersList = Array.from(room.players.values()).map(p => {
    if (isGameOver) {
      const isSpy = (p.id === room.spyId);
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHost: p.id === room.hostId,
        isOnline: !!p.isOnline,
        hasAccused: !!p.hasAccused,
        role: isSpy ? '间谍 (Spy)' : p.role,
        isSpy: isSpy
      };
    } else {
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHost: p.id === room.hostId,
        isOnline: !!p.isOnline,
        hasAccused: !!p.hasAccused,
        role: room.gameState.phase === PHASES.LOBBY ? null : '???',
        isSpy: undefined
      };
    }
  });

  // 胜负结算复盘数据
  let settlement = null;
  if (isGameOver) {
    settlement = {
      winner: room.gameState.winner,
      winReason: room.gameState.winReason,
      targetLocation: room.targetLocation ? {
        id: room.targetLocation.id,
        name: room.targetLocation.name,
        icon: room.targetLocation.icon,
        clusterId: room.targetLocation.clusterId
      } : null,
      spy: room.spyId ? {
        id: room.spyId,
        name: room.players.get(room.spyId)?.name,
        avatar: room.players.get(room.spyId)?.avatar
      } : null
    };
  }

  // 当前指控状态
  let currentAccuseData = null;
  if (room.currentAccuse) {
    const accuser = room.players.get(room.currentAccuse.accuserId);
    const suspect = room.players.get(room.currentAccuse.suspectId);
    currentAccuseData = {
      accuserId: room.currentAccuse.accuserId,
      accuserName: accuser ? accuser.name : '',
      suspectId: room.currentAccuse.suspectId,
      suspectName: suspect ? suspect.name : '',
      votes: Object.fromEntries(room.currentAccuse.votes || new Map()),
      totalEligibleVoters: room.currentAccuse.totalEligibleVoters
    };
  }

  return {
    roomCode: room.code,
    hostId: room.hostId,
    self: selfData,
    players: playersList,
    allLocations,
    gameState: {
      phase: room.gameState.phase,
      durationMinutes: room.gameState.durationMinutes,
      startTime: room.gameState.startTime,
      expiresAt: room.gameState.expiresAt,
      remainingMs: room.gameState.remainingMs,
      isPaused: room.gameState.isPaused,
      winner: room.gameState.winner,
      winReason: room.gameState.winReason,
      firstQuestionerId: room.gameState.firstQuestionerId
    },
    currentAccuse: currentAccuseData,
    settlement
  };
}

/**
 * 发起指控
 */
function handleAccuse(room, accuserId, suspectId) {
  if (!room || room.gameState.phase !== PHASES.PLAYING) {
    return { success: false, message: '当前阶段无法发起指控' };
  }
  if (!room.players.has(accuserId) || !room.players.has(suspectId)) {
    return { success: false, message: '玩家不存在' };
  }
  if (accuserId === suspectId) {
    return { success: false, message: '不能指控自己' };
  }

  const accuser = room.players.get(accuserId);
  if (accuser.hasAccused) {
    return { success: false, message: '每位玩家每局仅能发起一次指控' };
  }
  if (room.currentAccuse) {
    return { success: false, message: '已有指控正在进行中' };
  }

  accuser.hasAccused = true;

  // 冻结倒计时
  const now = Date.now();
  room.gameState.remainingMs = Math.max(0, (room.gameState.expiresAt || now) - now);
  room.gameState.isPaused = true;
  room.gameState.phase = PHASES.PAUSED_ACCUSE;

  if (room.gameEndTimer) {
    clearTimeout(room.gameEndTimer);
    room.gameEndTimer = null;
  }

  // 选票初始化，发起人默认赞成
  const votes = new Map();
  votes.set(accuserId, true);

  let eligibleVoters = Array.from(room.players.values())
    .filter(p => p.id !== suspectId && p.isOnline)
    .map(p => p.id);
  if (eligibleVoters.length === 0) {
    eligibleVoters = Array.from(room.players.values())
      .filter(p => p.id !== suspectId)
      .map(p => p.id);
  }

  room.currentAccuse = {
    accuserId,
    suspectId,
    votes,
    totalEligibleVoters: eligibleVoters.length
  };

  return { success: true, message: '发起指控成功，进入全员投票' };
}

/**
 * 投票表决指控
 */
function handleVoteAccuse(room, voterId, agree) {
  if (!room || room.gameState.phase !== PHASES.PAUSED_ACCUSE || !room.currentAccuse) {
    return { success: false, message: '当前没有正在进行的指控投票' };
  }
  if (voterId === room.currentAccuse.suspectId) {
    return { success: false, message: '被指控者不能参与投票' };
  }
  if (!room.players.has(voterId)) {
    return { success: false, message: '玩家不存在' };
  }

  room.currentAccuse.votes.set(voterId, !!agree);

  // 若有人投反对票 -> 无法达成全票赞成，指控失败，恢复游戏与倒计时
  if (!agree) {
    const now = Date.now();
    room.gameState.phase = PHASES.PLAYING;
    room.gameState.isPaused = false;
    room.gameState.expiresAt = now + room.gameState.remainingMs;

    if (room._io) {
      room.gameEndTimer = setTimeout(() => {
        onTimeExpired(room);
      }, room.gameState.remainingMs);
    }

    room.currentAccuse = null;
    return {
      success: true,
      voteFinished: true,
      consensus: false,
      message: '投票未全票通过，指控失败，继续游戏'
    };
  }

  // 检查是否所有合格表决者均已投票（动态排除离线玩家防死锁挂起）
  let eligibleVoters = Array.from(room.players.values())
    .filter(p => p.id !== room.currentAccuse.suspectId && p.isOnline)
    .map(p => p.id);
  if (eligibleVoters.length === 0) {
    eligibleVoters = Array.from(room.players.values())
      .filter(p => p.id !== room.currentAccuse.suspectId)
      .map(p => p.id);
  }
  room.currentAccuse.totalEligibleVoters = eligibleVoters.length;

  const allVoted = eligibleVoters.every(id => room.currentAccuse.votes.has(id));

  if (!allVoted) {
    const remainingCount = eligibleVoters.filter(id => !room.currentAccuse.votes.has(id)).length;
    return {
      success: true,
      voteFinished: false,
      remainingCount,
      message: `等待其余 ${remainingCount} 位玩家投票`
    };
  }

  // 全票赞成通过！
  const suspectId = room.currentAccuse.suspectId;
  const suspectIsSpy = (suspectId === room.spyId);
  room.currentAccuse = null;

  if (suspectIsSpy) {
    // 成功找出真正间谍 -> 转入 SPY_GUESSING 反击
    room.gameState.phase = PHASES.SPY_GUESSING;
    room.gameState.isPaused = true;
    return {
      success: true,
      voteFinished: true,
      consensus: true,
      suspectIsSpy: true,
      accusedIsSpy: true,
      nextPhase: PHASES.SPY_GUESSING,
      message: '全票通过！被指控者正是间谍，间谍进入最后猜地点反击！'
    };
  } else {
    // 误指控平民 -> 间谍获胜
    room.gameState.phase = PHASES.GAME_OVER;
    room.gameState.winner = 'SPY';
    room.gameState.winReason = '平民阵营全票误指控了无辜同伴，间谍获胜！';
    room.gameState.isPaused = true;
    return {
      success: true,
      voteFinished: true,
      consensus: true,
      suspectIsSpy: false,
      accusedIsSpy: false,
      nextPhase: PHASES.GAME_OVER,
      winner: 'SPY',
      message: '误指控平民出局，间谍获胜！'
    };
  }
}

/**
 * 间谍猜地点判定（主动自曝或反击猜地点）
 */
function handleSpyGuess(room, guessLocationId, playerId = null) {
  if (!room) return { success: false, message: '房间不存在' };
  const phase = room.gameState.phase;
  if (phase !== PHASES.PLAYING && phase !== PHASES.SPY_GUESSING) {
    return { success: false, message: '当前阶段不可猜地点' };
  }

  if (playerId && playerId !== room.spyId) {
    return { success: false, message: '只有间谍可以猜地点' };
  }

  if (room.gameEndTimer) {
    clearTimeout(room.gameEndTimer);
    room.gameEndTimer = null;
  }

  const isCorrect = (guessLocationId === (room.targetLocation && room.targetLocation.id));
  room.gameState.phase = PHASES.GAME_OVER;
  room.gameState.isPaused = true;

  if (isCorrect) {
    room.gameState.winner = 'SPY';
    room.gameState.winReason = '间谍准确识破真实地点，间谍获胜！';
  } else {
    room.gameState.winner = 'CIVILIAN';
    room.gameState.winReason = '间谍猜测地点错误，平民阵营获胜！';
  }

  return {
    success: true,
    isCorrect,
    winner: room.gameState.winner,
    winReason: room.gameState.winReason
  };
}

/**
 * 再来一局：重置房间与玩家状态，保留房间号与人员
 */
function resetRoomForNextGame(room) {
  if (!room) return null;
  if (room.gameEndTimer) {
    clearTimeout(room.gameEndTimer);
    room.gameEndTimer = null;
  }

  const parsedDuration = (room.settings && room.settings.durationMinutes) || 8;
  const durationMinutes = Math.min(20, Math.max(3, parsedDuration));
  room.gameState = {
    phase: PHASES.LOBBY,
    durationMinutes,
    startTime: null,
    expiresAt: null,
    remainingMs: durationMinutes * 60 * 1000,
    isPaused: false,
    winner: null,
    winReason: null,
    firstQuestionerId: null
  };

  room.spyId = null;
  room.targetLocation = null;
  room.candidateLocations = [];
  room.currentAccuse = null;
  room.settlement = null;

  room.players.forEach(p => {
    p.role = null;
    p.isSpy = false;
    p.hasAccused = false;
  });

  ensureRoomHost(room);
  return room;
}

/**
 * 广播房间状态给每个连接的玩家（各自执行严格数据脱敏）
 */
function broadcastRoom(spyIo, room) {
  if (!room || !spyIo) return;
  room.lastActiveTime = Date.now();
  ensureRoomHost(room);

  room.players.forEach(p => {
    if (p.socketId) {
      spyIo.to(p.socketId).emit('room_update', getSafePlayerView(room, p.id));
    }
  });
}

/**
 * 挂载 /spyfall 命名空间与 Socket.IO 事件路由
 */
function setupSpyfall(io, app) {
  const spyIo = io.of('/spyfall');

  spyIo.on('connection', (socket) => {
    let currentRoomCode = null;
    let currentPlayerId = null;

    // 创建房间
    socket.on('create_room', (data, callback) => {
      try {
        const pData = (data && data.player) ? data.player : (data || {});
        const sData = (data && data.settings) ? data.settings : {};
        const code = generateRoomCode();

        const player = {
          id: pData.id || `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          name: escapeHtml(pData.name ? String(pData.name).trim().substring(0, 12) : '房主'),
          avatar: pData.avatar || '🤠',
          socketId: socket.id,
          isHost: true,
          isOnline: true
        };

        const room = createGameRoom(code, player, sData);
        room._io = spyIo;
        currentRoomCode = code;
        currentPlayerId = player.id;
        socket.join(code);

        if (typeof callback === 'function') {
          callback({
            success: true,
            roomCode: code,
            playerId: player.id
          });
        }
        broadcastRoom(spyIo, room);
      } catch (err) {
        console.error('[Spyfall] create_room error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '创建房间失败' });
      }
    });

    // 加入房间
    socket.on('join_room', ({ roomCode, player }, callback) => {
      try {
        const code = String(roomCode || '').trim();
        const room = rooms.get(code);
        if (!room) {
          if (typeof callback === 'function') callback({ success: false, message: '房间号不存在，请检查后重试' });
          return;
        }

        const pid = player && player.id;
        if (!pid) {
          if (typeof callback === 'function') callback({ success: false, message: '玩家身份无效' });
          return;
        }

        // 支持重连或者新玩家加入
        if (room.players.has(pid)) {
          const existing = room.players.get(pid);
          existing.socketId = socket.id;
          existing.isOnline = true;
          if (player.name) existing.name = escapeHtml(String(player.name).trim().substring(0, 12));
          if (player.avatar) existing.avatar = player.avatar;
        } else {
          if (room.gameState.phase !== PHASES.LOBBY) {
            if (typeof callback === 'function') callback({ success: false, message: '游戏已在进行中，无法中途加入' });
            return;
          }
          const newPlayer = {
            id: pid,
            name: escapeHtml(player.name ? String(player.name).trim().substring(0, 12) : `特工${room.players.size + 1}`),
            avatar: player.avatar || '🕵️',
            socketId: socket.id,
            isHost: false,
            isOnline: true,
            hasAccused: false,
            role: null,
            isSpy: false
          };
          room.players.set(pid, newPlayer);
        }

        currentRoomCode = code;
        currentPlayerId = pid;
        socket.join(code);

        if (typeof callback === 'function') {
          callback({
            success: true,
            roomCode: code,
            playerId: pid
          });
        }
        broadcastRoom(spyIo, room);
      } catch (err) {
        console.error('[Spyfall] join_room error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '加入房间失败' });
      }
    });

    // 开始游戏
    socket.on('start_game', (data, callback) => {
      try {
        const code = (data && data.roomCode) || currentRoomCode;
        const room = rooms.get(code);
        if (!room) {
          if (typeof callback === 'function') callback({ success: false, message: '房间不存在' });
          return;
        }
        if (currentPlayerId !== room.hostId) {
          if (typeof callback === 'function') callback({ success: false, message: '只有房主可以开始游戏' });
          return;
        }

        room._io = room._io || spyIo;
        const res = startGameForRoom(room, data && data.settings);
        if (!res.success) {
          if (typeof callback === 'function') callback(res);
          return;
        }

        if (typeof callback === 'function') callback({ success: true });
        broadcastRoom(spyIo, room);
      } catch (err) {
        console.error('[Spyfall] start_game error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '开启游戏失败' });
      }
    });

    // 发起指控
    socket.on('initiate_accuse', ({ targetPlayerId }, callback) => {
      try {
        const room = rooms.get(currentRoomCode);
        if (!room) {
          if (typeof callback === 'function') callback({ success: false, message: '房间不存在' });
          return;
        }

        const res = handleAccuse(room, currentPlayerId, targetPlayerId);
        if (!res.success) {
          if (typeof callback === 'function') callback(res);
          return;
        }

        const accuser = room.players.get(currentPlayerId);
        const suspect = room.players.get(targetPlayerId);
        spyIo.to(room.code).emit('accuse_started', {
          accuser: { id: accuser.id, name: accuser.name },
          suspect: { id: suspect.id, name: suspect.name }
        });

        if (typeof callback === 'function') callback({ success: true });
        broadcastRoom(spyIo, room);
      } catch (err) {
        console.error('[Spyfall] initiate_accuse error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '发起指控失败' });
      }
    });

    // 指控投票
    socket.on('vote_accuse', ({ agree }, callback) => {
      try {
        const room = rooms.get(currentRoomCode);
        if (!room) {
          if (typeof callback === 'function') callback({ success: false, message: '房间不存在' });
          return;
        }

        const res = handleVoteAccuse(room, currentPlayerId, agree);
        if (!res.success) {
          if (typeof callback === 'function') callback(res);
          return;
        }

        if (res.voteFinished) {
          spyIo.to(room.code).emit('accuse_result', res);
          if (room.gameState.phase === PHASES.GAME_OVER) {
            spyIo.to(room.code).emit('game_over_reveal', getSafePlayerView(room, null).settlement);
          }
        }

        if (typeof callback === 'function') callback({ success: true, result: res });
        broadcastRoom(spyIo, room);
      } catch (err) {
        console.error('[Spyfall] vote_accuse error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '投票失败' });
      }
    });

    // 间谍猜地点
    socket.on('spy_guess_location', ({ locationId }, callback) => {
      try {
        const room = rooms.get(currentRoomCode);
        if (!room) {
          if (typeof callback === 'function') callback({ success: false, message: '房间不存在' });
          return;
        }

        const res = handleSpyGuess(room, locationId, currentPlayerId);
        if (!res.success) {
          if (typeof callback === 'function') callback(res);
          return;
        }

        if (room.gameState.phase === PHASES.GAME_OVER) {
          spyIo.to(room.code).emit('game_over_reveal', getSafePlayerView(room, null).settlement);
        }

        if (typeof callback === 'function') callback(res);
        broadcastRoom(spyIo, room);
      } catch (err) {
        console.error('[Spyfall] spy_guess_location error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '猜地点失败' });
      }
    });

    // 重新开局
    socket.on('restart_game', (data, callback) => {
      try {
        const room = rooms.get(currentRoomCode);
        if (!room) {
          if (typeof callback === 'function') callback({ success: false, message: '房间不存在' });
          return;
        }
        if (currentPlayerId !== room.hostId) {
          if (typeof callback === 'function') callback({ success: false, message: '只有房主可以重开游戏' });
          return;
        }

        resetRoomForNextGame(room);
        if (typeof callback === 'function') callback({ success: true });
        broadcastRoom(spyIo, room);
      } catch (err) {
        console.error('[Spyfall] restart_game error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '重置游戏失败' });
      }
    });

    // 离线断线
    socket.on('disconnect', () => {
      try {
        if (!currentRoomCode || !rooms.has(currentRoomCode)) return;
        const room = rooms.get(currentRoomCode);
        const player = room.players.get(currentPlayerId);
        if (player) {
          player.isOnline = false;
          player.lastOfflineTime = Date.now();
        }

        ensureRoomHost(room);

        // 如果全部玩家均离线，延迟清理房间
        const onlineCount = Array.from(room.players.values()).filter(p => p.isOnline).length;
        if (onlineCount === 0) {
          setTimeout(() => {
            const currentOnline = Array.from(room.players.values()).filter(p => p.isOnline).length;
            if (currentOnline === 0) {
              if (room.gameEndTimer) clearTimeout(room.gameEndTimer);
              rooms.delete(currentRoomCode);
            }
          }, 300 * 1000);
        }

        broadcastRoom(spyIo, room);
      } catch (err) {
        console.error('[Spyfall] disconnect error:', err);
      }
    });
  });
}

module.exports = {
  setupSpyfall,
  PHASES,
  getSafePlayerView,
  createGameRoom,
  startGameForRoom,
  handleAccuse,
  handleVoteAccuse,
  handleSpyGuess,
  resetRoomForNextGame,
  rooms
};
