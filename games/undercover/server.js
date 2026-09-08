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

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getSafeRoomData(room, targetPlayerId) {
  const playersList = Array.from(room.players.values()).map(p => {
    const isMe = p.id === targetPlayerId;
    const isGameOver = room.gameState.phase === PHASES.GAME_OVER;
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.isHost,
      isOnline: p.isOnline,
      isAlive: p.isAlive,
      hasVoted: p.hasVoted,
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
      isHost: myPlayer.isHost,
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
      lastEliminated: room.gameState.lastEliminated,
      winner: room.gameState.winner,
      winningWord: room.gameState.winningWord,
      punishment: room.gameState.punishment,
      voteTally: (room.gameState.phase === PHASES.ELIMINATION || room.gameState.phase === PHASES.GAME_OVER) ? room.gameState.votes : {}
    }
  };
}

function broadcastRoom(undercoverIo, room) {
  if (!room) return;
  room.lastActiveTime = Date.now();
  room.players.forEach(player => {
    if (player.socketId && player.isOnline) {
      undercoverIo.to(player.socketId).emit('room_update', getSafeRoomData(room, player.id));
    }
  });
}

function clearRoomTimers(room) {
  if (room.gameState.speechTimer) {
    clearTimeout(room.gameState.speechTimer);
    room.gameState.speechTimer = null;
  }
  if (room.gameState.voteResolvingTimer) {
    clearTimeout(room.gameState.voteResolvingTimer);
    room.gameState.voteResolvingTimer = null;
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

function startVotingPhase(undercoverIo, room) {
  clearRoomTimers(room);
  room.gameState.phase = PHASES.VOTING;
  room.gameState.votes = {};
  room.players.forEach(p => { p.hasVoted = false; });
  broadcastRoom(undercoverIo, room);
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
  room.players.forEach(p => { p.hasVoted = false; });
  broadcastRoom(undercoverIo, room);
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
    eliminatePlayer(undercoverIo, room, topCandidates[0]);
  } else {
    if (room.gameState.phase === PHASES.PK_VOTING) {
      eliminatePlayer(undercoverIo, room, null, '平票且PK重投仍未决出，本轮无人出局！');
    } else {
      startPkSpeakingPhase(undercoverIo, room, topCandidates);
    }
  }
}

function eliminatePlayer(undercoverIo, room, playerId, tieMessage = null) {
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
        word: p.word
      };
    }
  } else {
    room.gameState.lastEliminated = {
      isTie: true,
      message: tieMessage || '平票，本轮无人出局！'
    };
  }

  const checkResult = checkGameStatus(room);
  if (checkResult.isOver) {
    setTimeout(() => {
      room.gameState.phase = PHASES.GAME_OVER;
      room.gameState.winner = checkResult.winner;
      room.gameState.punishment = getRandomPunishment();
      broadcastRoom(undercoverIo, room);
    }, 2500);
  }

  broadcastRoom(undercoverIo, room);
}

function checkGameStatus(room) {
  const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive && !p.isSpectator);
  const aliveUndercovers = alivePlayers.filter(p => p.role === ROLES.UNDERCOVER);
  const aliveCivilians = alivePlayers.filter(p => p.role === ROLES.CIVILIAN);

  if (aliveUndercovers.length === 0) {
    return { isOver: true, winner: 'CIVILIAN' };
  }

  if (aliveUndercovers.length >= aliveCivilians.length) {
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

  room.players.forEach(p => {
    p.isAlive = true;
    p.hasVoted = false;
    p.isSpectator = false;
    p.role = null;
    p.word = null;
  });

  broadcastRoom(undercoverIo, room);
}

function setupUndercover(io, app) {
  const undercoverIo = io.of('/undercover');

  undercoverIo.on('connection', (socket) => {
    let currentRoomCode = null;
    let currentPlayerId = null;

    // 创建房间
    socket.on('create_room', (playerData, callback) => {
      try {
        const code = generateRoomCode();
        const player = {
          id: playerData.id || `p_${Date.now()}`,
          socketId: socket.id,
          name: escapeHtml(playerData.name || '玩家1'),
          avatar: escapeHtml(playerData.avatar || '😎'),
          isHost: true,
          isOnline: true,
          isAlive: true,
          hasVoted: false,
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
            undercoverCount: 1,
            whiteboardCount: 0,
            speechTimeLimit: 45,
            category: 'all',
            customWords: []
          },
          players: new Map([[player.id, player]]),
          gameState: {
            phase: PHASES.LOBBY,
            round: 1,
            speakingOrder: [],
            currentSpeakerIndex: 0,
            speechStartTime: null,
            speechTimer: null,
            pkCandidates: [],
            pkSpeakingOrder: [],
            currentPkSpeakerIndex: 0,
            votes: {},
            voteResolvingTimer: null,
            lastEliminated: null,
            winner: null,
            winningWord: null,
            punishment: null
          }
        };

        rooms.set(code, room);
        currentRoomCode = code;
        currentPlayerId = player.id;
        socket.join(code);

        if (typeof callback === 'function') callback({ success: true, roomCode: code });
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

        const pid = player.id;
        currentRoomCode = roomCode;
        currentPlayerId = pid;
        socket.join(roomCode);

        if (room.players.has(pid)) {
          const existing = room.players.get(pid);
          existing.socketId = socket.id;
          existing.isOnline = true;
          if (player.name) existing.name = escapeHtml(String(player.name).trim().substring(0, 10)) || existing.name;
          if (player.avatar) existing.avatar = escapeHtml(String(player.avatar).trim().substring(0, 4)) || existing.avatar;
        } else {
          const isSpectator = room.gameState.phase !== PHASES.LOBBY;
          room.players.set(pid, {
            id: pid,
            socketId: socket.id,
            name: escapeHtml(String(player.name || `玩家${room.players.size + 1}`).trim().substring(0, 10)),
            avatar: escapeHtml(String(player.avatar || '🤠').trim().substring(0, 4)),
            isHost: false,
            isOnline: true,
            isAlive: !isSpectator,
            hasVoted: false,
            isSpectator,
            role: null,
            word: null
          });
        }

        if (typeof callback === 'function') callback({ success: true, roomCode });
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
            p.socketId = socket.id;
            p.isOnline = true;
            currentRoomCode = code;
            currentPlayerId = pid;
            socket.join(code);
            socket.emit('room_update', getSafeRoomData(room, pid));
          }
        }
      } catch (err) {
        console.error('sync_room error:', err);
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

    // 开始游戏 (房主)
    socket.on('start_game', (callback) => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.hostId !== currentPlayerId) return;

        const playersList = Array.from(room.players.values()).filter(p => p.isOnline);
        if (playersList.length < 3) {
          if (typeof callback === 'function') callback({ success: false, message: '至少需要 3 名玩家在线才能开始游戏！' });
          return;
        }

        const totalPlayers = playersList.length;
        let ucCount = room.settings.undercoverCount;
        let wbCount = room.settings.whiteboardCount;

        if (ucCount + wbCount >= totalPlayers) {
          ucCount = 1;
          wbCount = 0;
          room.settings.undercoverCount = 1;
          room.settings.whiteboardCount = 0;
        }

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

        if (typeof callback === 'function') callback({ success: true });
        broadcastRoom(undercoverIo, room);
      } catch (err) {
        console.error('start_game error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '游戏启动异常' });
      }
    });

    // 结束看牌，进入发言阶段
    socket.on('finish_card_view', () => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.hostId !== currentPlayerId) return;
        if (room.gameState.phase !== PHASES.CARD_VIEW) return;
        startSpeakingPhase(undercoverIo, room);
      } catch (err) {
        console.error('finish_card_view error:', err);
      }
    });

    // 结束当前玩家发言
    socket.on('speaker_done', () => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;

        const isCurrentSpeaker = (room.gameState.phase === PHASES.SPEAKING &&
          room.gameState.speakingOrder[room.gameState.currentSpeakerIndex] === currentPlayerId);
        const isCurrentPkSpeaker = (room.gameState.phase === PHASES.PK_SPEAKING &&
          room.gameState.pkSpeakingOrder[room.gameState.currentPkSpeakerIndex] === currentPlayerId);
        const isHost = (room.hostId === currentPlayerId);

        if (isCurrentSpeaker || isCurrentPkSpeaker || isHost) {
          handleSpeakerDone(undercoverIo, room);
        }
      } catch (err) {
        console.error('speaker_done error:', err);
      }
    });

    // 投票
    socket.on('cast_vote', (targetId) => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;
        processVote(undercoverIo, room, currentPlayerId, targetId);
      } catch (err) {
        console.error('cast_vote error:', err);
      }
    });

    // 房主强制提前结算投票
    socket.on('force_resolve_votes', () => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.hostId !== currentPlayerId) return;
        forceResolveVotes(undercoverIo, room);
      } catch (err) {
        console.error('force_resolve_votes error:', err);
      }
    });

    // 继续下一轮 (房主)
    socket.on('next_round', () => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.hostId !== currentPlayerId) return;
        proceedToNextRound(undercoverIo, room);
      } catch (err) {
        console.error('next_round error:', err);
      }
    });

    // 房主重置房间
    socket.on('reset_room_to_lobby', () => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.hostId !== currentPlayerId) return;
        resetGameToLobby(undercoverIo, room);
      } catch (err) {
        console.error('reset_room_to_lobby error:', err);
      }
    });

    // 再来一局 (回到大厅)
    socket.on('play_again', () => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.hostId !== currentPlayerId) return;
        resetGameToLobby(undercoverIo, room);
      } catch (err) {
        console.error('play_again error:', err);
      }
    });

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

    // 踢出玩家 (房主)
    socket.on('kick_player', (targetPlayerId) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;
      if (targetPlayerId === room.hostId) return;

      const target = room.players.get(targetPlayerId);
      if (target) {
        if (target.socketId) {
          undercoverIo.to(target.socketId).emit('kicked_from_room');
        }
        room.players.delete(targetPlayerId);
        broadcastRoom(undercoverIo, room);
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
            }

            // 房主离线继承
            if (room.hostId === currentPlayerId) {
              setTimeout(() => {
                const currentRoomObj = rooms.get(currentRoomCode);
                if (currentRoomObj && currentRoomObj.hostId === currentPlayerId) {
                  const nextHost = Array.from(currentRoomObj.players.values()).find(pl => pl.isOnline);
                  if (nextHost) {
                    currentRoomObj.hostId = nextHost.id;
                    currentRoomObj.players.forEach(pl => { pl.isHost = (pl.id === nextHost.id); });
                    broadcastRoom(undercoverIo, currentRoomObj);
                  }
                }
              }, 15000);
            }

            broadcastRoom(undercoverIo, room);
          }
        }
      } catch (err) {
        console.error('disconnect error:', err);
      }
    });
  });
}

module.exports = { setupUndercover, wordCategories };
