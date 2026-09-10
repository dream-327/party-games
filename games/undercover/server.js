// Undercover Game Server (谁是卧底服务端逻辑模块)

const path = require('path');
const { wordCategories, punishments, getRandomWordPair, getRandomPunishment } = require('./words');

const rooms = new Map();

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(code));
  return code;
}

const ROLES = {
  CIVILIAN: 'CIVILIAN',
  UNDERCOVER: 'UNDERCOVER',
  WHITEBOARD: 'WHITEBOARD'
};

const PHASES = {
  LOBBY: 'LOBBY',
  CARD_VIEW: 'CARD_VIEW',
  SPEAKING: 'SPEAKING',
  VOTING: 'VOTING',
  PK_SPEAKING: 'PK_SPEAKING',
  PK_VOTING: 'PK_VOTING',
  ELIMINATION: 'ELIMINATION',
  GAME_OVER: 'GAME_OVER'
};

const AI_NAMES = ['机智阿福', '福尔摩斯', '侦探柯南', '名捕小包', '逻辑大师', '潜伏高手'];
const AI_AVATARS = ['🕵️', '🧙‍♂️', '🧔', '🦊', '🦉', '🧝'];
const AI_CLUES = [
  '这个东西在日常生活中很常见。',
  '很多人几乎每天都会接触或用到它。',
  '我觉得这个词大家都非常熟悉。',
  '它的实用性很强，功能比较明确。',
  '这个通常在特定场合或者时间会用到。',
  '我的这个词大众认知度很高。',
  '可以说老少皆知，很有代表性。'
];

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ensureRoomHost(room) {
  if (!room) return;
  const isLobby = !room.gameState || room.gameState.phase === PHASES.LOBBY;
  const currentHost = room.players.get(room.hostId);

  // 在大厅阶段，房主必须是一个在线的真人玩家！
  // 若当前房主不存在、当前房主已离线、或当前房主为AI电脑：
  // 立即自动顺位移交给房间内第一个在线的真人玩家
  const needsReassign = !currentHost 
    || currentHost.isAi 
    || (isLobby && !currentHost.isOnline);

  if (needsReassign) {
    const candidate = Array.from(room.players.values()).find(p => p.isOnline && !p.isAi)
      || Array.from(room.players.values()).find(p => p.isOnline)
      || Array.from(room.players.values()).find(p => !p.isAi)
      || Array.from(room.players.values())[0];
    if (candidate) {
      room.hostId = candidate.id;
    }
  }

  // 严格同步所有玩家的 isHost 属性与 room.hostId 对齐
  room.players.forEach(p => {
    p.isHost = (p.id === room.hostId);
  });
}

function getSafeRoomData(room, targetPlayerId) {
  ensureRoomHost(room);

  const playersList = Array.from(room.players.values()).map(p => {
    const isMe = p.id === targetPlayerId;
    const isGameOver = room.gameState.phase === PHASES.GAME_OVER;
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: (p.id === room.hostId),
      isOnline: p.isOnline,
      isAi: p.isAi || false,
      isAlive: p.isAlive,
      hasVoted: p.hasVoted,
      hasViewedCard: p.hasViewedCard || false,
      isSpectator: p.isSpectator || false,
      role: (isMe || isGameOver) ? p.role : null,
      word: (isMe || isGameOver) ? p.word : null
    };
  });

  const myPlayer = room.players.get(targetPlayerId);

  return {
    code: room.code,
    hostId: room.hostId,
    settings: room.settings,
    players: playersList,
    myPlayer: myPlayer ? {
      id: myPlayer.id,
      name: myPlayer.name,
      avatar: myPlayer.avatar,
      isHost: (myPlayer.id === room.hostId),
      isAlive: myPlayer.isAlive,
      hasVoted: myPlayer.hasVoted,
      isSpectator: myPlayer.isSpectator || false,
      role: myPlayer.role,
      word: myPlayer.word
    } : null,
    gameState: {
      phase: room.gameState.phase,
      round: room.gameState.round,
      speakingOrder: room.gameState.speakingOrder,
      currentSpeakerIndex: room.gameState.currentSpeakerIndex,
      currentSpeakerId: room.gameState.speakingOrder[room.gameState.currentSpeakerIndex] || null,
      speechStartTime: room.gameState.speechStartTime,
      speechTimeLimit: room.settings.speechTimeLimit,
      pkCandidates: room.gameState.pkCandidates,
      pkSpeakingOrder: room.gameState.pkSpeakingOrder,
      currentPkSpeakerIndex: room.gameState.currentPkSpeakerIndex,
      currentPkSpeakerId: room.gameState.pkSpeakingOrder[room.gameState.currentPkSpeakerIndex] || null,
      pkSpeakerId: room.gameState.pkSpeakingOrder[room.gameState.currentPkSpeakerIndex] || null,
      lastEliminated: room.gameState.lastEliminated,
      eliminatedPlayer: room.gameState.lastEliminated,
      winner: room.gameState.winner,
      winningWord: room.gameState.winningWord,
      punishment: room.gameState.punishment,
      voteStartTime: room.gameState.voteStartTime,
      voteTimeLimit: room.gameState.voteTimeLimit || 60,
      voteTally: (room.gameState.phase === PHASES.ELIMINATION || room.gameState.phase === PHASES.GAME_OVER) ? room.gameState.votes : {},
      clueLogs: room.gameState.clueLogs || []
    }
  };
}

function broadcastRoom(undercoverIo, room) {
  if (!room) return;
  ensureRoomHost(room);
  room.lastActiveTime = Date.now();
  room.players.forEach(player => {
    if (player.socketId && player.isOnline) {
      undercoverIo.to(player.socketId).emit('room_update', getSafeRoomData(room, player.id));
    }
  });
}

function clearRoomTimers(room) {
  if (room.gameState.cardViewSafetyTimer) {
    clearTimeout(room.gameState.cardViewSafetyTimer);
    room.gameState.cardViewSafetyTimer = null;
  }
  if (room.gameState.speechTimer) {
    clearTimeout(room.gameState.speechTimer);
    room.gameState.speechTimer = null;
  }
  if (room.gameState.voteResolvingTimer) {
    clearTimeout(room.gameState.voteResolvingTimer);
    room.gameState.voteResolvingTimer = null;
  }
  if (room.gameState.voteSafetyTimer) {
    clearTimeout(room.gameState.voteSafetyTimer);
    room.gameState.voteSafetyTimer = null;
  }
  if (room.gameState.gameOverTimer) {
    clearTimeout(room.gameState.gameOverTimer);
    room.gameState.gameOverTimer = null;
  }
}

function startSpeakingPhase(undercoverIo, room) {
  clearRoomTimers(room);
  room.gameState.phase = PHASES.SPEAKING;

  const alivePlayers = Array.from(room.players.values())
    .filter(p => p.isAlive && !p.isSpectator)
    .map(p => p.id);

  // 洗牌发言顺序
  for (let i = alivePlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [alivePlayers[i], alivePlayers[j]] = [alivePlayers[j], alivePlayers[i]];
  }

  room.gameState.speakingOrder = alivePlayers;
  room.gameState.currentSpeakerIndex = 0;
  scheduleNextSpeaker(undercoverIo, room);
}

function scheduleNextSpeaker(undercoverIo, room) {
  clearRoomTimers(room);
  room.gameState.speechStartTime = Date.now();
  broadcastRoom(undercoverIo, room);

  const speakerId = room.gameState.speakingOrder[room.gameState.currentSpeakerIndex];
  const speaker = room.players.get(speakerId);
  if (speaker && speaker.isAi) {
    const aiDelay = 2200 + Math.floor(Math.random() * 800);
    room.gameState.speechTimer = setTimeout(() => {
      const clue = AI_CLUES[Math.floor(Math.random() * AI_CLUES.length)];
      undercoverIo.to(room.code).emit('speaker_clue', {
        playerId: speaker.id,
        playerName: speaker.name,
        avatar: speaker.avatar,
        clue: clue
      });
      if (!room.gameState.clueLogs) room.gameState.clueLogs = [];
      room.gameState.clueLogs.push({ round: room.gameState.round, isPk: false, playerName: speaker.name, clue: clue, time: Date.now() });
      undercoverIo.to(room.code).emit('reaction_received', {
        playerId: speaker.id,
        playerName: speaker.name,
        avatar: speaker.avatar,
        emoji: clue
      });
      setTimeout(() => {
        handleSpeakerDone(undercoverIo, room);
      }, 1000);
    }, aiDelay);
    return;
  }

  if (room.settings.speechTimeLimit > 0) {
    room.gameState.speechTimer = setTimeout(() => {
      handleSpeakerDone(undercoverIo, room);
    }, (room.settings.speechTimeLimit + 1) * 1000);
  }
}

function handleSpeakerDone(undercoverIo, room) {
  clearRoomTimers(room);
  if (room.gameState.phase === PHASES.SPEAKING) {
    if (room.gameState.currentSpeakerIndex < room.gameState.speakingOrder.length - 1) {
      room.gameState.currentSpeakerIndex++;
      scheduleNextSpeaker(undercoverIo, room);
    } else {
      startVotingPhase(undercoverIo, room);
    }
  } else if (room.gameState.phase === PHASES.PK_SPEAKING) {
    if (room.gameState.currentPkSpeakerIndex < room.gameState.pkSpeakingOrder.length - 1) {
      room.gameState.currentPkSpeakerIndex++;
      scheduleNextPkSpeaker(undercoverIo, room);
    } else {
      startPkVotingPhase(undercoverIo, room);
    }
  }
}

function scheduleAiVotes(undercoverIo, room, isPk) {
  const aiVoters = Array.from(room.players.values()).filter(p => p.isAlive && !p.isSpectator && p.isAi && !p.hasVoted);
  if (aiVoters.length === 0) return;

  setTimeout(() => {
    if (!room || (room.gameState.phase !== PHASES.VOTING && room.gameState.phase !== PHASES.PK_VOTING)) return;
    const aliveTargets = Array.from(room.players.values()).filter(p => p.isAlive && !p.isSpectator);
    const pkTargets = room.gameState.pkCandidates || [];

    aiVoters.forEach(ai => {
      if (ai.hasVoted) return;
      let targetId = null;
      if (isPk) {
        const validCandidates = pkTargets.filter(id => id !== ai.id);
        const pool = validCandidates.length > 0 ? validCandidates : pkTargets;
        if (pool.length > 0) {
          targetId = pool[Math.floor(Math.random() * pool.length)];
        }
      } else {
        const validCandidates = aliveTargets.filter(p => p.id !== ai.id);
        const pool = validCandidates.length > 0 ? validCandidates : aliveTargets;
        if (pool.length > 0) {
          targetId = pool[Math.floor(Math.random() * pool.length)].id;
        }
      }
      if (targetId) {
        processVote(undercoverIo, room, ai.id, targetId);
      }
    });
  }, 1800 + Math.floor(Math.random() * 800));
}

function startVotingPhase(undercoverIo, room) {
  clearRoomTimers(room);
  room.gameState.phase = PHASES.VOTING;
  room.gameState.votes = {};
  room.gameState.voteStartTime = Date.now();
  room.gameState.voteTimeLimit = 60;
  room.players.forEach(p => { p.hasVoted = false; });
  broadcastRoom(undercoverIo, room);
  scheduleAiVotes(undercoverIo, room, false);

  room.gameState.voteSafetyTimer = setTimeout(() => {
    if (room.gameState.phase === PHASES.VOTING) {
      forceResolveVotes(undercoverIo, room);
    }
  }, 62000);
}

function startPkSpeakingPhase(undercoverIo, room, candidateIds) {
  clearRoomTimers(room);
  room.gameState.phase = PHASES.PK_SPEAKING;
  room.gameState.pkCandidates = candidateIds;
  room.gameState.pkSpeakingOrder = [...candidateIds];
  room.gameState.currentPkSpeakerIndex = 0;
  scheduleNextPkSpeaker(undercoverIo, room);
}

function scheduleNextPkSpeaker(undercoverIo, room) {
  clearRoomTimers(room);
  room.gameState.speechStartTime = Date.now();
  broadcastRoom(undercoverIo, room);

  const pkSpeakerId = room.gameState.pkSpeakingOrder[room.gameState.currentPkSpeakerIndex];
  const pkSpeaker = room.players.get(pkSpeakerId);
  if (pkSpeaker && pkSpeaker.isAi) {
    const aiDelay = 2000 + Math.floor(Math.random() * 800);
    room.gameState.speechTimer = setTimeout(() => {
      const pkClue = '我是真平民，大家千万别被带节奏，请相信我！';
      undercoverIo.to(room.code).emit('speaker_clue', {
        playerId: pkSpeaker.id,
        playerName: pkSpeaker.name,
        avatar: pkSpeaker.avatar,
        clue: pkClue
      });
      if (!room.gameState.clueLogs) room.gameState.clueLogs = [];
      room.gameState.clueLogs.push({ round: room.gameState.round, isPk: true, playerName: pkSpeaker.name, clue: pkClue, time: Date.now() });
      undercoverIo.to(room.code).emit('reaction_received', {
        playerId: pkSpeaker.id,
        playerName: pkSpeaker.name,
        avatar: pkSpeaker.avatar,
        emoji: pkClue
      });
      setTimeout(() => {
        handleSpeakerDone(undercoverIo, room);
      }, 1000);
    }, aiDelay);
    return;
  }

  const pkTimeLimit = Math.min(room.settings.speechTimeLimit || 30, 30);
  if (pkTimeLimit > 0) {
    room.gameState.speechTimer = setTimeout(() => {
      handleSpeakerDone(undercoverIo, room);
    }, (pkTimeLimit + 1) * 1000);
  }
}

function startPkVotingPhase(undercoverIo, room) {
  clearRoomTimers(room);
  room.gameState.phase = PHASES.PK_VOTING;
  room.gameState.votes = {};
  room.gameState.voteStartTime = Date.now();
  room.gameState.voteTimeLimit = 45;
  room.players.forEach(p => { p.hasVoted = false; });
  broadcastRoom(undercoverIo, room);
  scheduleAiVotes(undercoverIo, room, true);

  room.gameState.voteSafetyTimer = setTimeout(() => {
    if (room.gameState.phase === PHASES.PK_VOTING) {
      forceResolveVotes(undercoverIo, room);
    }
  }, 47000);
}

function processVote(undercoverIo, room, voterId, targetId) {
  if (room.gameState.phase !== PHASES.VOTING && room.gameState.phase !== PHASES.PK_VOTING) return;

  const voter = room.players.get(voterId);
  if (!voter || !voter.isAlive || voter.isSpectator || voter.hasVoted) return;

  if (room.gameState.phase === PHASES.PK_VOTING) {
    if (!room.gameState.pkCandidates.includes(targetId)) return;
  } else {
    const target = room.players.get(targetId);
    if (!target || !target.isAlive || target.isSpectator) return;
  }

  voter.hasVoted = true;
  room.gameState.votes[voterId] = targetId;
  broadcastRoom(undercoverIo, room);

  const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive && !p.isSpectator);
  const onlineAlivePlayers = alivePlayers.filter(p => p.isOnline);

  const allVoted = alivePlayers.every(p => p.hasVoted);
  const onlineAllVoted = onlineAlivePlayers.length > 0 && onlineAlivePlayers.every(p => p.hasVoted);

  if (allVoted || onlineAllVoted) {
    if (!room.gameState.voteResolvingTimer) {
      room.gameState.voteResolvingTimer = setTimeout(() => {
        room.gameState.voteResolvingTimer = null;
        resolveVotes(undercoverIo, room);
      }, 1000);
    }
  }
}

function forceResolveVotes(undercoverIo, room) {
  if (room.gameState.phase !== PHASES.VOTING && room.gameState.phase !== PHASES.PK_VOTING) return;
  clearRoomTimers(room);
  resolveVotes(undercoverIo, room);
}

function resolveVotes(undercoverIo, room) {
  clearRoomTimers(room);
  const tally = {};
  Object.values(room.gameState.votes).forEach(targetId => {
    tally[targetId] = (tally[targetId] || 0) + 1;
  });

  let maxVotes = 0;
  Object.values(tally).forEach(count => {
    if (count > maxVotes) maxVotes = count;
  });

  if (maxVotes === 0) {
    proceedToNextRound(undercoverIo, room);
    return;
  }

  const topCandidates = Object.keys(tally).filter(id => tally[id] === maxVotes);

  if (topCandidates.length === 1) {
    eliminatePlayer(undercoverIo, room, topCandidates[0], null, maxVotes);
  } else {
    if (room.gameState.phase === PHASES.PK_VOTING) {
      eliminatePlayer(undercoverIo, room, null, '平票且PK重投仍未决出，本轮无人出局！', maxVotes);
    } else {
      startPkSpeakingPhase(undercoverIo, room, topCandidates);
    }
  }
}

function eliminatePlayer(undercoverIo, room, playerId, tieMessage = null, votes = 0) {
  clearRoomTimers(room);
  room.gameState.phase = PHASES.ELIMINATION;

  if (playerId) {
    const p = room.players.get(playerId);
    if (p) {
      p.isAlive = false;
      room.gameState.lastEliminated = {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        role: p.role,
        word: p.word,
        votes: votes,
        isTieNoElimination: false
      };
    }
  } else {
    room.gameState.lastEliminated = {
      isTie: true,
      isTieNoElimination: true,
      message: tieMessage || '平票，本轮无人出局！',
      votes: votes
    };
  }

  const checkResult = checkGameStatus(room);
  if (checkResult.isOver) {
    // 游戏结束：2.5秒后进入结算
    if (room.gameState.gameOverTimer) clearTimeout(room.gameState.gameOverTimer);
    room.gameState.gameOverTimer = setTimeout(() => {
      room.gameState.phase = PHASES.GAME_OVER;
      room.gameState.winner = checkResult.winner;
      room.gameState.punishment = getRandomPunishment();
      broadcastRoom(undercoverIo, room);
    }, 2500);
  } else if (!playerId) {
    // 平局无人出局：3秒后自动进入下一轮
    if (room.gameState.gameOverTimer) clearTimeout(room.gameState.gameOverTimer);
    room.gameState.gameOverTimer = setTimeout(() => {
      if (room.gameState.phase === PHASES.ELIMINATION) {
        proceedToNextRound(undercoverIo, room);
      }
    }, 3000);
  } else {
    // 正常淘汰且游戏未结束：4秒后自动进入下一轮，无需房主点击
    if (room.gameState.gameOverTimer) clearTimeout(room.gameState.gameOverTimer);
    room.gameState.gameOverTimer = setTimeout(() => {
      if (room.gameState.phase === PHASES.ELIMINATION) {
        proceedToNextRound(undercoverIo, room);
      }
    }, 4000);
  }

  broadcastRoom(undercoverIo, room);
}

function checkGameStatus(room) {
  const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive && !p.isSpectator);
  const aliveUndercovers = alivePlayers.filter(p => p.role === ROLES.UNDERCOVER);
  const nonUndercovers = alivePlayers.filter(p => p.role !== ROLES.UNDERCOVER);

  if (aliveUndercovers.length === 0) {
    return { isOver: true, winner: 'CIVILIAN' };
  }

  if (aliveUndercovers.length >= nonUndercovers.length) {
    return { isOver: true, winner: 'UNDERCOVER' };
  }

  return { isOver: false, winner: null };
}

function proceedToNextRound(undercoverIo, room) {
  clearRoomTimers(room);
  const status = checkGameStatus(room);
  if (status.isOver) {
    room.gameState.phase = PHASES.GAME_OVER;
    room.gameState.winner = status.winner;
    room.gameState.punishment = getRandomPunishment();
    broadcastRoom(undercoverIo, room);
  } else {
    room.gameState.round++;
    startSpeakingPhase(undercoverIo, room);
  }
}

function resetGameToLobby(undercoverIo, room) {
  clearRoomTimers(room);
  room.gameState.phase = PHASES.LOBBY;
  room.gameState.round = 1;
  room.gameState.speakingOrder = [];
  room.gameState.currentSpeakerIndex = 0;
  room.gameState.speechStartTime = null;
  room.gameState.pkCandidates = [];
  room.gameState.pkSpeakingOrder = [];
  room.gameState.currentPkSpeakerIndex = 0;
  room.gameState.votes = {};
  room.gameState.lastEliminated = null;
  room.gameState.winner = null;
  room.gameState.punishment = null;
  room.gameState.clueLogs = [];

  room.players.forEach(p => {
    p.isAlive = true;
    p.hasVoted = false;
    p.hasViewedCard = p.isAi || false;
    p.isSpectator = false;
    p.role = null;
    p.word = null;
  });

  broadcastRoom(undercoverIo, room);
}

function handlePlayerViewCard(undercoverIo, roomCode, playerId) {
  if (!roomCode) return;
  const room = rooms.get(roomCode);
  if (!room || room.gameState.phase !== PHASES.CARD_VIEW) return;

  const player = room.players.get(playerId);
  if (player) {
    player.hasViewedCard = true;
  }

  const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive && !p.isSpectator);
  const onlineAlivePlayers = alivePlayers.filter(p => p.isOnline);

  const allViewed = alivePlayers.length > 0 && alivePlayers.every(p => p.hasViewedCard);
  const onlineAllViewed = onlineAlivePlayers.length > 0 && onlineAlivePlayers.every(p => p.hasViewedCard);

  if (allViewed || onlineAllViewed) {
    if (room.gameState.cardViewSafetyTimer) {
      clearTimeout(room.gameState.cardViewSafetyTimer);
      room.gameState.cardViewSafetyTimer = null;
    }
    startSpeakingPhase(undercoverIo, room);
  } else {
    broadcastRoom(undercoverIo, room);
  }
}

function setupUndercover(io, app) {
  const undercoverIo = io.of('/undercover');

  undercoverIo.on('connection', (socket) => {
    let currentRoomCode = null;
    let currentPlayerId = null;

    // 创建房间
    socket.on('create_room', (data, callback) => {
      try {
        // 如果当前 socket 之前已在某个房间，先安全退出旧房间
        if (currentRoomCode && rooms.has(currentRoomCode)) {
          const oldRoom = rooms.get(currentRoomCode);
          if (oldRoom && currentPlayerId) {
            oldRoom.players.delete(currentPlayerId);
            socket.leave(currentRoomCode);
            ensureRoomHost(oldRoom);
            if (Array.from(oldRoom.players.values()).filter(p => !p.isAi && p.isOnline).length === 0) {
              clearRoomTimers(oldRoom);
              rooms.delete(currentRoomCode);
            } else {
              broadcastRoom(undercoverIo, oldRoom);
            }
          }
        }

        const pData = (data && data.player) ? data.player : (data || {});
        const sData = (data && data.settings) ? data.settings : {};
        const code = generateRoomCode();
        const randomSuffix = Math.floor(100 + Math.random() * 900);
        const rawName = (pData && pData.name ? String(pData.name) : '').trim();
        let safeName = escapeHtml(rawName ? rawName.substring(0, 10) : `玩家${randomSuffix}`);
        if (safeName === '玩家1' || safeName === '所谓的玩家1') safeName = `玩家${randomSuffix}`;
        const player = {
          id: pData.id || `p_${Date.now()}`,
          socketId: socket.id,
          name: safeName,
          avatar: escapeHtml(String(pData.avatar || '😎').trim().substring(0, 4)),
          isHost: true,
          isOnline: true,
          isAi: false,
          isAlive: true,
          hasVoted: false,
          hasViewedCard: false,
          isSpectator: false,
          role: null,
          word: null
        };

        const room = {
          code,
          hostId: player.id,
          createdAt: Date.now(),
          lastActiveTime: Date.now(),
          settings: {
            undercoverCount: Math.max(1, Math.min(4, sData.undercoverCount || 1)),
            whiteboardCount: Math.max(0, Math.min(2, sData.whiteboardCount || 0)),
            speechTimeLimit: typeof sData.speechTimeLimit === 'number' ? sData.speechTimeLimit : 45,
            revealRoleOnEliminate: sData.revealRoleOnEliminate !== false,
            category: sData.category || 'all',
            customWords: Array.isArray(sData.customWords) ? sData.customWords : []
          },
          players: new Map([[player.id, player]]),
          gameState: {
            phase: PHASES.LOBBY,
            round: 1,
            speakingOrder: [],
            currentSpeakerIndex: 0,
            speechStartTime: null,
            speechTimer: null,
            cardViewSafetyTimer: null,
            pkCandidates: [],
            pkSpeakingOrder: [],
            currentPkSpeakerIndex: 0,
            votes: {},
            voteResolvingTimer: null,
            lastEliminated: null,
            winner: null,
            winningWord: null,
            punishment: null,
            clueLogs: []
          }
        };

        rooms.set(code, room);
        currentRoomCode = code;
        currentPlayerId = player.id;
        socket.join(code);

        if (typeof callback === 'function') callback({
          success: true,
          roomCode: code,
          roomData: getSafeRoomData(room, player.id)
        });
        broadcastRoom(undercoverIo, room);
      } catch (err) {
        console.error('create_room error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '创建房间失败' });
      }
    });

    // 加入房间
    socket.on('join_room', ({ roomCode, player }, callback) => {
      try {
        const room = rooms.get(roomCode);
        if (!room) {
          if (typeof callback === 'function') callback({ success: false, message: '房间号不存在，请检查后重试' });
          return;
        }

        const pid = player && player.id;
        if (!pid) {
          if (typeof callback === 'function') callback({ success: false, message: '玩家身份无效' });
          return;
        }

        // 如果之前在其他房间，安全离开
        if (currentRoomCode && currentRoomCode !== roomCode && rooms.has(currentRoomCode)) {
          const oldRoom = rooms.get(currentRoomCode);
          if (oldRoom && currentPlayerId) {
            oldRoom.players.delete(currentPlayerId);
            socket.leave(currentRoomCode);
            ensureRoomHost(oldRoom);
            if (Array.from(oldRoom.players.values()).filter(p => !p.isAi && p.isOnline).length === 0) {
              clearRoomTimers(oldRoom);
              rooms.delete(currentRoomCode);
            } else {
              broadcastRoom(undercoverIo, oldRoom);
            }
          }
        }

        currentRoomCode = roomCode;
        currentPlayerId = pid;
        socket.join(roomCode);

        if (room.players.has(pid)) {
          // 重连：清除离线清理定时器，更新 socketId 和在线状态，同步最新名字/头像
          const existing = room.players.get(pid);
          if (existing.offlineCleanupTimer) {
            clearTimeout(existing.offlineCleanupTimer);
            existing.offlineCleanupTimer = null;
          }
          existing.socketId = socket.id;
          existing.isOnline = true;
          if (player.name) existing.name = escapeHtml(String(player.name).trim().substring(0, 10)) || existing.name;
          if (player.avatar) existing.avatar = escapeHtml(String(player.avatar).trim().substring(0, 4)) || existing.avatar;
        } else {
          // 在大厅阶段，加入新玩家前先清理已离线的幽灵玩家
          if (room.gameState.phase === PHASES.LOBBY) {
            const now = Date.now();
            for (const [id, pl] of room.players.entries()) {
              if (!pl.isAi && !pl.isOnline && pl.lastOfflineTime && (now - pl.lastOfflineTime > 3000)) {
                room.players.delete(id);
              }
            }
          }

          // 新加入：检查是否已达最大人数（10人）
          if (room.players.size >= 10) {
            if (typeof callback === 'function') callback({ success: false, message: '房间已满（最多10人）' });
            return;
          }
          const isSpectator = room.gameState.phase !== PHASES.LOBBY;
          const randomSuffix = Math.floor(100 + Math.random() * 900);
          const rawJoinName = (player && player.name ? String(player.name) : '').trim();
          let safeJoinName = escapeHtml(rawJoinName ? rawJoinName.substring(0, 10) : `玩家${randomSuffix}`);
          if (safeJoinName === '玩家1' || safeJoinName === '所谓的玩家1') safeJoinName = `玩家${randomSuffix}`;
          room.players.set(pid, {
            id: pid,
            socketId: socket.id,
            name: safeJoinName,
            avatar: escapeHtml(String(player.avatar || '🤠').trim().substring(0, 4)),
            isHost: false,
            isOnline: true,
            isAi: false,
            isAlive: !isSpectator,
            hasVoted: false,
            hasViewedCard: false,
            isSpectator,
            role: null,
            word: null
          });
        }

        ensureRoomHost(room);

        if (typeof callback === 'function') callback({
          success: true,
          roomCode,
          roomData: getSafeRoomData(room, pid)
        });
        broadcastRoom(undercoverIo, room);
      } catch (err) {
        console.error('join_room error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '加入房间失败' });
      }
    });

    // 主动同步房间状态
    socket.on('sync_room', (data) => {
      try {
        const code = (data && data.roomCode) || currentRoomCode;
        const pid = (data && data.playerId) || currentPlayerId;
        if (code && rooms.has(code)) {
          const room = rooms.get(code);
          if (pid && room.players.has(pid)) {
            const p = room.players.get(pid);
            if (p.offlineCleanupTimer) {
              clearTimeout(p.offlineCleanupTimer);
              p.offlineCleanupTimer = null;
            }
            p.socketId = socket.id;
            p.isOnline = true;
            currentRoomCode = code;
            currentPlayerId = pid;
            socket.join(code);
            ensureRoomHost(room);
            broadcastRoom(undercoverIo, room);
          }
        }
      } catch (err) {
        console.error('sync_room error:', err);
      }
    });

    // 添加电脑
    socket.on('add_ai', () => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.hostId !== currentPlayerId) return;
        if (room.gameState.phase !== PHASES.LOBBY) return;
        if (room.players.size >= 10) return;

        const aiCount = Array.from(room.players.values()).filter(p => p.isAi).length;
        const nameIdx = aiCount % AI_NAMES.length;
        const aiId = `ai_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        const aiPlayer = {
          id: aiId,
          socketId: null,
          name: AI_NAMES[nameIdx] || `电脑${aiCount + 1}`,
          avatar: AI_AVATARS[nameIdx] || '🤖',
          isHost: false,
          isOnline: true,
          isAi: true,
          isAlive: true,
          hasVoted: false,
          hasViewedCard: true,
          isSpectator: false,
          role: null,
          word: null
        };

        room.players.set(aiId, aiPlayer);
        broadcastRoom(undercoverIo, room);
      } catch (err) {
        console.error('add_ai error:', err);
      }
    });

    // 移除电脑
    socket.on('remove_ai', () => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.hostId !== currentPlayerId) return;
        if (room.gameState.phase !== PHASES.LOBBY) return;

        const aiPlayers = Array.from(room.players.values()).filter(p => p.isAi);
        if (aiPlayers.length > 0) {
          const lastAi = aiPlayers[aiPlayers.length - 1];
          room.players.delete(lastAi.id);
          broadcastRoom(undercoverIo, room);
        }
      } catch (err) {
        console.error('remove_ai error:', err);
      }
    });

    // 更新设置 (房主)
    socket.on('update_settings', (newSettings) => {
      try {
        if (!currentRoomCode || !newSettings) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.hostId !== currentPlayerId) return;

        const sanitized = {};
        if (typeof newSettings.undercoverCount === 'number') {
          sanitized.undercoverCount = Math.max(1, Math.min(4, Math.floor(newSettings.undercoverCount)));
        }
        if (typeof newSettings.whiteboardCount === 'number') {
          sanitized.whiteboardCount = Math.max(0, Math.min(2, Math.floor(newSettings.whiteboardCount)));
        }
        if (typeof newSettings.speechTimeLimit === 'number') {
          sanitized.speechTimeLimit = Math.max(0, Math.min(180, Math.floor(newSettings.speechTimeLimit)));
        }
        if (typeof newSettings.revealRoleOnEliminate === 'boolean') {
          sanitized.revealRoleOnEliminate = newSettings.revealRoleOnEliminate;
        }
        if (typeof newSettings.category === 'string') {
          sanitized.category = newSettings.category.substring(0, 20);
        }
        if (Array.isArray(newSettings.customWords)) {
          sanitized.customWords = newSettings.customWords.slice(0, 50).map(w => ({
            civilian: escapeHtml(String(w.civilian || '').trim().substring(0, 20)),
            undercover: escapeHtml(String(w.undercover || '').trim().substring(0, 20))
          })).filter(w => w.civilian && w.undercover);
        }

        room.settings = { ...room.settings, ...sanitized };
        broadcastRoom(undercoverIo, room);
      } catch (err) {
        console.error('update_settings error:', err);
      }
    });

    // 开始游戏 (房主或房间内在线玩家均可直接启动)
    socket.on('start_game', (options, callback) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;

        ensureRoomHost(room);
        const caller = room.players.get(currentPlayerId);
        if (!caller) {
          if (typeof callback === 'function') callback({ success: false, message: '玩家未在房间中' });
          return;
        }

        // 无论是房主还是房间内任意在线玩家，点击开始游戏均可开局
        // 若发起开局的玩家不是房主，自动顺位提升为主持房主，彻底规避权限阻断
        if (room.hostId !== currentPlayerId) {
          room.hostId = currentPlayerId;
          ensureRoomHost(room);
        }

        // 开局前彻底清理大厅内已离线的幽灵玩家，防止名额与阵营计算错误
        for (const [id, pl] of room.players.entries()) {
          if (!pl.isAi && !pl.isOnline) {
            room.players.delete(id);
          }
        }

        let playersList = Array.from(room.players.values()).filter(p => p.isOnline);

        // 如果请求自动补齐且少于3人，自动添加电脑玩家至满3人
        if (playersList.length < 3 && options && options.autoFill) {
          while (playersList.length < 3 && room.players.size < 10) {
            const aiCount = Array.from(room.players.values()).filter(p => p.isAi).length;
            const nameIdx = aiCount % AI_NAMES.length;
            const aiId = `ai_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const aiPlayer = {
              id: aiId,
              socketId: null,
              name: AI_NAMES[nameIdx] || `电脑${aiCount + 1}`,
              avatar: AI_AVATARS[nameIdx] || '🤖',
              isHost: false,
              isOnline: true,
              isAi: true,
              isAlive: true,
              hasVoted: false,
              hasViewedCard: true,
              isSpectator: false,
              role: null,
              word: null
            };
            room.players.set(aiId, aiPlayer);
            playersList = Array.from(room.players.values()).filter(p => p.isOnline);
          }
        }

        if (playersList.length < 3) {
          if (typeof callback === 'function') callback({
            success: false,
            canAutoFill: true,
            currentCount: playersList.length,
            message: `至少需要 3 名玩家在线（可添加电脑）才能开始游戏！`
          });
          return;
        }

        const totalPlayers = playersList.length;
        const maxUndercover = Math.max(1, Math.floor((totalPlayers - 1) / 2));
        let ucCount = Math.min(room.settings.undercoverCount || 1, maxUndercover);
        const maxWhiteboard = Math.max(0, Math.floor((totalPlayers - ucCount - 1) / 2));
        let wbCount = Math.min(room.settings.whiteboardCount || 0, maxWhiteboard);

        room.settings.undercoverCount = ucCount;
        room.settings.whiteboardCount = wbCount;

        const wordPair = getRandomWordPair(room.settings.category, room.settings.customWords);
        room.gameState.winningWord = wordPair.civilian;

        const rolesArray = [];
        for (let i = 0; i < ucCount; i++) rolesArray.push(ROLES.UNDERCOVER);
        for (let i = 0; i < wbCount; i++) rolesArray.push(ROLES.WHITEBOARD);
        while (rolesArray.length < totalPlayers) {
          rolesArray.push(ROLES.CIVILIAN);
        }

        for (let i = rolesArray.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rolesArray[i], rolesArray[j]] = [rolesArray[j], rolesArray[i]];
        }

        playersList.forEach((player, idx) => {
          player.isAlive = true;
          player.hasVoted = false;
          player.isSpectator = false;
          player.hasViewedCard = player.isAi || false;
          player.role = rolesArray[idx];

          if (player.role === ROLES.CIVILIAN) {
            player.word = wordPair.civilian;
          } else if (player.role === ROLES.UNDERCOVER) {
            player.word = wordPair.undercover;
          } else if (player.role === ROLES.WHITEBOARD) {
            player.word = '❓ 白板（无词）';
          }
        });

        room.players.forEach(p => {
          if (!p.isOnline) p.isSpectator = true;
        });

        room.gameState.phase = PHASES.CARD_VIEW;
        room.gameState.round = 1;
        room.gameState.lastEliminated = null;
        room.gameState.winner = null;
        room.gameState.punishment = null;
  room.gameState.clueLogs = [];

        // 25秒看牌安全兜底定时器：超时全员自动准备完毕并切入发言阶段
        if (room.gameState.cardViewSafetyTimer) clearTimeout(room.gameState.cardViewSafetyTimer);
        room.gameState.cardViewSafetyTimer = setTimeout(() => {
          if (room.gameState.phase === PHASES.CARD_VIEW) {
            room.players.forEach(p => { p.hasViewedCard = true; });
            startSpeakingPhase(undercoverIo, room);
          }
        }, 25000);

        if (typeof callback === 'function') callback({ success: true });
        broadcastRoom(undercoverIo, room);
      } catch (err) {
        console.error('start_game error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '游戏启动异常' });
      }
    });

    // 确认已看牌 (玩家)
    const handleCardViewConfirm = (data) => {
      try {
        const code = (data && data.roomCode) || currentRoomCode;
        const pid = (data && data.playerId) || currentPlayerId;
        if (code) currentRoomCode = code;
        if (pid) currentPlayerId = pid;
        handlePlayerViewCard(undercoverIo, code, pid);
      } catch (err) {
        console.error('view_card_confirm error:', err);
      }
    };
    socket.on('view_card_confirm', handleCardViewConfirm);
    socket.on('confirm_card_view', handleCardViewConfirm);

    // 房主强制开始发言 / 结束看牌
    const handleForceStartSpeaking = (data) => {
      try {
        const code = (data && data.roomCode) || currentRoomCode;
        const pid = (data && data.playerId) || currentPlayerId;
        if (!code) return;
        const room = rooms.get(code);
        if (!room) return;
        ensureRoomHost(room);
        if (room.hostId !== pid) return;
        if (room.gameState.phase !== PHASES.CARD_VIEW) return;
        if (room.gameState.cardViewSafetyTimer) {
          clearTimeout(room.gameState.cardViewSafetyTimer);
          room.gameState.cardViewSafetyTimer = null;
        }
        startSpeakingPhase(undercoverIo, room);
      } catch (err) {
        console.error('force_start_speaking error:', err);
      }
    };
    socket.on('force_start_speaking', handleForceStartSpeaking);
    socket.on('finish_card_view', handleForceStartSpeaking);

    // 结束当前玩家发言 (发言者本人或房主均可点击)
    const handleFinishSpeakingEvent = (data) => {
      try {
        const code = (data && data.roomCode) || currentRoomCode;
        const pid = (data && data.playerId) || currentPlayerId;
        if (!code) return;
        const room = rooms.get(code);
        if (!room) return;

        const isCurrentSpeaker = (room.gameState.phase === PHASES.SPEAKING &&
          room.gameState.speakingOrder[room.gameState.currentSpeakerIndex] === pid);
        const isCurrentPkSpeaker = (room.gameState.phase === PHASES.PK_SPEAKING &&
          room.gameState.pkSpeakingOrder[room.gameState.currentPkSpeakerIndex] === pid);
        const isHost = (room.hostId === pid);

        if (isCurrentSpeaker || isCurrentPkSpeaker || isHost) {
          handleSpeakerDone(undercoverIo, room);
        }
      } catch (err) {
        console.error('finish_speaking error:', err);
      }
    };
    socket.on('finish_speaking', handleFinishSpeakingEvent);
    socket.on('speaker_done', handleFinishSpeakingEvent);

    // 发言文字线索发送 (支持文字描述与TTS播报)
    socket.on('send_clue', (clueText) => {
      try {
        if (!currentRoomCode || !clueText) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;
        const sender = room.players.get(currentPlayerId);
        if (!sender) return;

        const text = escapeHtml(String(clueText).trim().substring(0, 50));
        if (!text) return;

        undercoverIo.to(room.code).emit('speaker_clue', {
          playerId: sender.id,
          playerName: sender.name,
          avatar: sender.avatar,
          clue: text
        });
        if (!room.gameState.clueLogs) room.gameState.clueLogs = [];
        room.gameState.clueLogs.push({ round: room.gameState.round, isPk: room.gameState.phase.startsWith('PK'), playerName: sender.name, clue: text, time: Date.now() });
      } catch (err) {
        console.error('send_clue error:', err);
      }
    });

    // 投票
    socket.on('cast_vote', (data) => {
      try {
        const targetId = (typeof data === 'object') ? data.targetId : data;
        const code = (typeof data === 'object' && data.roomCode) ? data.roomCode : currentRoomCode;
        const pid = (typeof data === 'object' && data.playerId) ? data.playerId : currentPlayerId;
        if (!code) return;
        const room = rooms.get(code);
        if (!room) return;
        processVote(undercoverIo, room, pid, targetId);
      } catch (err) {
        console.error('cast_vote error:', err);
      }
    });

    // 房主强制提前结算投票
    socket.on('force_resolve_votes', (data) => {
      try {
        const code = (data && data.roomCode) || currentRoomCode;
        const pid = (data && data.playerId) || currentPlayerId;
        if (!code) return;
        const room = rooms.get(code);
        if (!room || room.hostId !== pid) return;
        forceResolveVotes(undercoverIo, room);
      } catch (err) {
        console.error('force_resolve_votes error:', err);
      }
    });

    // 继续下一轮 (房主)
    socket.on('next_round', (data) => {
      try {
        const code = (data && data.roomCode) || currentRoomCode;
        const pid = (data && data.playerId) || currentPlayerId;
        if (!code) return;
        const room = rooms.get(code);
        if (!room || room.hostId !== pid) return;
        proceedToNextRound(undercoverIo, room);
      } catch (err) {
        console.error('next_round error:', err);
      }
    });

    // 房主重置房间回到大厅
    const handleResetToLobby = (data) => {
      try {
        const code = (data && data.roomCode) || currentRoomCode;
        const pid = (data && data.playerId) || currentPlayerId;
        if (!code) return;
        const room = rooms.get(code);
        if (!room || room.hostId !== pid) return;
        resetGameToLobby(undercoverIo, room);
      } catch (err) {
        console.error('reset_to_lobby error:', err);
      }
    };
    socket.on('reset_to_lobby', handleResetToLobby);
    socket.on('reset_room_to_lobby', handleResetToLobby);

    // 再来一局 (结算界面)
    const handleRestartGame = (data) => {
      try {
        const code = (data && data.roomCode) || currentRoomCode;
        const pid = (data && data.playerId) || currentPlayerId;
        if (!code) return;
        const room = rooms.get(code);
        if (!room || room.hostId !== pid) return;
        resetGameToLobby(undercoverIo, room);
      } catch (err) {
        console.error('restart_game error:', err);
      }
    };
    socket.on('restart_game', handleRestartGame);
    socket.on('play_again', handleRestartGame);

    // 发送互动表情气泡
    socket.on('send_reaction', (emoji) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const sender = room.players.get(currentPlayerId);
      if (sender) {
        undercoverIo.to(room.code).emit('reaction_received', {
          playerId: currentPlayerId,
          playerName: sender.name,
          avatar: sender.avatar,
          emoji: escapeHtml(String(emoji).substring(0, 50))
        });
      }
    });

    // 踢出玩家 (房主可踢任意非房主，任何玩家均可清除大厅离线幽灵)
    socket.on('kick_player', (targetPlayerId) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const target = room.players.get(targetPlayerId);
      if (!target) return;

      const isLobby = room.gameState.phase === PHASES.LOBBY;
      const canKick = (room.hostId === currentPlayerId) || (isLobby && !target.isOnline);
      if (!canKick) return;
      if (targetPlayerId === room.hostId && target.isOnline) return;

      if (target.socketId) {
        undercoverIo.to(target.socketId).emit('kicked_from_room');
      }
      room.players.delete(targetPlayerId);
      ensureRoomHost(room);
      broadcastRoom(undercoverIo, room);
    });

    // 一键清理大厅所有离线玩家
    socket.on('clean_offline_players', () => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.gameState.phase !== PHASES.LOBBY) return;
        for (const [id, p] of room.players.entries()) {
          if (!p.isAi && !p.isOnline) {
            room.players.delete(id);
          }
        }
        ensureRoomHost(room);
        broadcastRoom(undercoverIo, room);
      } catch (e) {
        console.error('clean_offline_players error:', e);
      }
    });

    // 换一个惩罚
    socket.on('reroll_punishment', () => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;
      room.gameState.punishment = getRandomPunishment();
      broadcastRoom(undercoverIo, room);
    });

    // 玩家申请成为房主
    socket.on('claim_host', (callback) => {
      try {
        if (!currentRoomCode || !currentPlayerId) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;
        const p = room.players.get(currentPlayerId);
        if (!p || p.isAi) return;

        // 允许玩家随时接管或申请房主（便于主持与配置）
        room.hostId = currentPlayerId;
        ensureRoomHost(room);
        broadcastRoom(undercoverIo, room);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('claim_host error:', err);
      }
    });

    // 主动离开房间
    socket.on('leave_room', (callback) => {
      try {
        if (currentRoomCode && currentPlayerId) {
          const room = rooms.get(currentRoomCode);
          if (room) {
            room.players.delete(currentPlayerId);
            socket.leave(currentRoomCode);
            ensureRoomHost(room);
            const remainingHumans = Array.from(room.players.values()).filter(p => !p.isAi && p.isOnline);
            if (remainingHumans.length === 0) {
              clearRoomTimers(room);
              rooms.delete(currentRoomCode);
            } else {
              broadcastRoom(undercoverIo, room);
            }
          }
        }
        currentRoomCode = null;
        currentPlayerId = null;
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('leave_room error:', err);
        if (typeof callback === 'function') callback({ success: false });
      }
    });

    // 断开连接处理
    socket.on('disconnect', () => {
      try {
        if (currentRoomCode && currentPlayerId) {
          const room = rooms.get(currentRoomCode);
          if (room) {
            const p = room.players.get(currentPlayerId);
            if (p) {
              p.isOnline = false;
              p.lastOfflineTime = Date.now();

              // 大厅阶段如果玩家离线超过 4 秒（排除瞬时刷新卡顿），自动移出房间，防止幽灵离线玩家占用名额
              if (room.gameState.phase === PHASES.LOBBY) {
                if (p.offlineCleanupTimer) clearTimeout(p.offlineCleanupTimer);
                p.offlineCleanupTimer = setTimeout(() => {
                  if (room.gameState.phase === PHASES.LOBBY && !p.isOnline) {
                    room.players.delete(p.id);
                    ensureRoomHost(room);
                    const remainingHumans = Array.from(room.players.values()).filter(x => !x.isAi && x.isOnline);
                    if (remainingHumans.length === 0) {
                      clearRoomTimers(room);
                      rooms.delete(room.code);
                    } else {
                      broadcastRoom(undercoverIo, room);
                    }
                  }
                }, 4000);
              }
            }

            ensureRoomHost(room);
            broadcastRoom(undercoverIo, room);
          }
        }
      } catch (err) {
        console.error('disconnect error:', err);
      }
    });
  });

  // 定时清理超过 1 小时无活动的房间
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      if (now - (room.lastActiveTime || room.createdAt) > 60 * 60 * 1000) {
        clearRoomTimers(room);
        rooms.delete(code);
      }
    }
  }, 10 * 60 * 1000).unref();
}

module.exports = { setupUndercover, wordCategories };
