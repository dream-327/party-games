// Dou Dizhu Game Server (欢乐斗地主服务端逻辑)

const { createDeck, sortCards, parseHand, canBeat, findBeatingHands, CARD_TYPES } = require('./rules');
const { decideBid, decidePlay } = require('./ai');

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

const AI_NAMES = ['阿尔法狗', '深蓝高手', '棋圣喵', '扑克机皇', '旺财大师'];
const AI_AVATARS = ['🤖', '🦾', '👾', '🐱', '🐶'];

function createRoom(hostPlayer) {
  const code = generateRoomCode();
  const room = {
    code,
    hostId: hostPlayer.id,
    createdAt: Date.now(),
    lastActiveTime: Date.now(),
    seats: [
      {
        id: hostPlayer.id,
        socketId: hostPlayer.socketId,
        name: escapeHtml(hostPlayer.name || '玩家1'),
        avatar: escapeHtml(hostPlayer.avatar || '😎'),
        isHost: true,
        isOnline: true,
        isAi: false,
        isReady: false,
        isAuto: false // 托管状态
      },
      null,
      null
    ],
    spectators: new Map(), // 观战者
    gameState: {
      phase: 'LOBBY', // LOBBY, DEALING, BIDDING, PLAYING, GAME_OVER
      hands: { 0: [], 1: [], 2: [] },
      bottomCards: [],
      landlordSeat: null,
      currentTurnSeat: null,
      turnTimeLimit: 25,
      turnDeadline: null,
      multiplier: 1,
      bidHistory: [],
      bidState: {
        firstBidder: 0,
        currentBidder: 0,
        calledSeat: null,
        robbers: [],
        lastRobSeat: null,
        reRobEligible: false
      },
      lastValidPlay: null, // { seat, cards, parsed }
      passCount: 0,
      landlordPlayCount: 0,
      farmerPlayCount: 0,
      winnerSeat: null,
      winnerRole: null,
      spring: false,
      scores: {}
    },
    timer: null
  };
  rooms.set(code, room);
  return room;
}

// 过滤敏感手牌（只向自己透传自己的手牌，向对手只透传剩余张数）
function getClientRoomData(room, targetPlayerId) {
  const mySeatIndex = room.seats.findIndex(s => s && s.id === targetPlayerId);

  const safeSeats = room.seats.map((s, idx) => {
    if (!s) return null;
    const hand = room.gameState.hands[idx] || [];
    const isMe = idx === mySeatIndex;
    const isGameOver = room.gameState.phase === 'GAME_OVER';

    return {
      id: s.id,
      name: s.name,
      avatar: s.avatar,
      isHost: s.isHost,
      isOnline: s.isOnline,
      isAi: s.isAi,
      isReady: s.isReady,
      isAuto: s.isAuto,
      seatIndex: idx,
      cardCount: hand.length,
      // 只有自己或游戏结束复盘时可见具体手牌
      handCards: (isMe || isGameOver) ? hand : []
    };
  });

  return {
    code: room.code,
    hostId: room.hostId,
    mySeatIndex,
    seats: safeSeats,
    spectatorCount: room.spectators.size,
    gameState: {
      phase: room.gameState.phase,
      // 底牌在进入出牌期或游戏结束时展示真实牌面，否则展示背面占位
      bottomCards: (['PLAYING', 'GAME_OVER'].includes(room.gameState.phase)) 
        ? room.gameState.bottomCards 
        : (room.gameState.bottomCards.length > 0 ? [{ id: 'back1' }, { id: 'back2' }, { id: 'back3' }] : []),
      landlordSeat: room.gameState.landlordSeat,
      currentTurnSeat: room.gameState.currentTurnSeat,
      turnTimeLimit: room.gameState.turnTimeLimit,
      turnDeadline: room.gameState.turnDeadline,
      multiplier: room.gameState.multiplier,
      bidHistory: room.gameState.bidHistory,
      bidState: room.gameState.bidState,
      lastValidPlay: room.gameState.lastValidPlay,
      passCount: room.gameState.passCount,
      winnerSeat: room.gameState.winnerSeat,
      winnerRole: room.gameState.winnerRole,
      spring: room.gameState.spring,
      scores: room.gameState.scores
    }
  };
}

function broadcastRoom(doudizhuIo, room) {
  if (!room) return;
  room.lastActiveTime = Date.now();

  // 分别向每个座位发送个性化手牌数据
  room.seats.forEach(s => {
    if (s && s.socketId && s.isOnline && !s.isAi) {
      doudizhuIo.to(s.socketId).emit('room_update', getClientRoomData(room, s.id));
    }
  });

  // 向观战者发送全局视角数据
  for (const spec of room.spectators.values()) {
    if (spec.socketId) {
      doudizhuIo.to(spec.socketId).emit('room_update', getClientRoomData(room, spec.id));
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
 * 启动出牌阶段当前玩家的倒计时与 AI 托管托管触发
 */
function scheduleTurnAction(doudizhuIo, room) {
  clearRoomTimer(room);

  const seatIndex = room.gameState.currentTurnSeat;
  if (seatIndex === null || seatIndex < 0) return;

  const currentSeat = room.seats[seatIndex];
  if (!currentSeat) return;

  const isAi = currentSeat.isAi;
  const isAuto = currentSeat.isAuto || !currentSeat.isOnline;

  room.gameState.turnDeadline = Date.now() + room.gameState.turnTimeLimit * 1000;

  // 若为 AI 或已托管，拟人化延时出牌（800ms - 1500ms）
  if (isAi || isAuto) {
    const delay = 800 + Math.floor(Math.random() * 800);
    room.timer = setTimeout(() => {
      handleAiPlayTurn(doudizhuIo, room, seatIndex);
    }, delay);
  } else {
    // 真实玩家倒计时超时自动处理
    room.timer = setTimeout(() => {
      // 超时自动开启托管并代打
      currentSeat.isAuto = true;
      handleAiPlayTurn(doudizhuIo, room, seatIndex);
    }, room.gameState.turnTimeLimit * 1000 + 500);
  }
}

/**
 * AI / 超时代打出牌
 */
function handleAiPlayTurn(doudizhuIo, room, seatIndex) {
  if (room.gameState.phase !== 'PLAYING') return;
  if (room.gameState.currentTurnSeat !== seatIndex) return;

  const hand = room.gameState.hands[seatIndex] || [];
  const isLandlord = (seatIndex === room.gameState.landlordSeat);
  const myRole = isLandlord ? 'LANDLORD' : 'FARMER';

  let tableHand = null;
  let tableRole = null;

  if (room.gameState.lastValidPlay && room.gameState.passCount < 2) {
    tableHand = room.gameState.lastValidPlay.parsed;
    tableRole = (room.gameState.lastValidPlay.seat === room.gameState.landlordSeat) ? 'LANDLORD' : 'FARMER';
  }

  const landlordRemaining = (room.gameState.hands[room.gameState.landlordSeat] || []).length;
  let teammateRemaining = 17;
  if (!isLandlord) {
    const otherFarmerSeat = [0, 1, 2].find(s => s !== room.gameState.landlordSeat && s !== seatIndex);
    if (otherFarmerSeat !== undefined) {
      teammateRemaining = (room.gameState.hands[otherFarmerSeat] || []).length;
    }
  }
  const playCards = decidePlay(hand, tableHand, myRole, tableRole, landlordRemaining, teammateRemaining);

  if (!playCards || playCards.length === 0) {
    // 过牌
    executePass(doudizhuIo, room, seatIndex);
  } else {
    // 出牌
    const cardIds = playCards.map(c => c.id);
    executePlay(doudizhuIo, room, seatIndex, cardIds);
  }
}

/**
 * 执行出牌
 */
function executePlay(doudizhuIo, room, seatIndex, cardIds) {
  if (room.gameState.phase !== 'PLAYING' || room.gameState.currentTurnSeat !== seatIndex) return false;

  const hand = room.gameState.hands[seatIndex] || [];
  const selectedCards = hand.filter(c => cardIds.includes(c.id));

  if (selectedCards.length !== cardIds.length) return false;

  const parsed = parseHand(selectedCards);
  if (parsed.type === CARD_TYPES.INVALID) return false;

  const hasTable = room.gameState.lastValidPlay && room.gameState.passCount < 2;
  const tableHand = hasTable ? room.gameState.lastValidPlay.parsed : null;

  if (!canBeat(parsed, tableHand)) return false;

  // 成功压制或首发出牌
  clearRoomTimer(room);

  // 从手牌中扣减
  room.gameState.hands[seatIndex] = hand.filter(c => !cardIds.includes(c.id));

  // 炸弹与王炸倍数翻倍并触发全屏特效
  let isBombOrRocket = false;
  if (parsed.type === CARD_TYPES.BOMB || parsed.type === CARD_TYPES.ROCKET) {
    room.gameState.multiplier *= 2;
    isBombOrRocket = true;
  }

  // 统计出牌次数
  if (seatIndex === room.gameState.landlordSeat) {
    room.gameState.landlordPlayCount += 1;
  } else {
    room.gameState.farmerPlayCount += 1;
  }

  room.gameState.lastValidPlay = {
    seat: seatIndex,
    cards: selectedCards,
    parsed: {
      type: parsed.type,
      value: parsed.value,
      length: parsed.length
    }
  };
  room.gameState.passCount = 0;

  // 广播出牌音效与特效事件
  doudizhuIo.to(room.code).emit('action_played', {
    seatIndex,
    cards: selectedCards,
    cardType: parsed.type,
    isBomb: parsed.type === CARD_TYPES.BOMB,
    isRocket: parsed.type === CARD_TYPES.ROCKET,
    remainingCount: room.gameState.hands[seatIndex].length
  });

  // 检查胜利
  if (room.gameState.hands[seatIndex].length === 0) {
    handleGameOver(doudizhuIo, room, seatIndex);
    return true;
  }

  // 轮转到下一位
  room.gameState.currentTurnSeat = (seatIndex + 1) % 3;
  broadcastRoom(doudizhuIo, room);
  scheduleTurnAction(doudizhuIo, room);
  return true;
}

/**
 * 执行不出 (Pass)
 */
function executePass(doudizhuIo, room, seatIndex) {
  if (room.gameState.phase !== 'PLAYING' || room.gameState.currentTurnSeat !== seatIndex) return false;

  // 若桌面没有上家牌，不能跳过（必须主动出牌）
  if (!room.gameState.lastValidPlay || room.gameState.passCount >= 2) {
    return false;
  }

  clearRoomTimer(room);
  room.gameState.passCount += 1;

  doudizhuIo.to(room.code).emit('action_passed', { seatIndex });

  // 若连续两人过牌，清空桌面
  if (room.gameState.passCount >= 2) {
    room.gameState.lastValidPlay = null;
    room.gameState.passCount = 0;
  }

  room.gameState.currentTurnSeat = (seatIndex + 1) % 3;
  broadcastRoom(doudizhuIo, room);
  scheduleTurnAction(doudizhuIo, room);
  return true;
}

/**
 * 处理游戏胜利与结算
 */
function handleGameOver(doudizhuIo, room, winnerSeat) {
  clearRoomTimer(room);
  room.gameState.phase = 'GAME_OVER';
  room.gameState.winnerSeat = winnerSeat;

  const isLandlordWinner = (winnerSeat === room.gameState.landlordSeat);
  room.gameState.winnerRole = isLandlordWinner ? 'LANDLORD' : 'FARMER';

  // 判定春天与反春
  let spring = false;
  let springType = '';

  if (isLandlordWinner && room.gameState.farmerPlayCount === 0) {
    spring = true;
    springType = '春天！(农民未出一张牌)';
    room.gameState.multiplier *= 2;
  } else if (!isLandlordWinner && room.gameState.landlordPlayCount <= 1) {
    spring = true;
    springType = '反春！(地主仅出一手牌)';
    room.gameState.multiplier *= 2;
  }
  room.gameState.spring = spring;

  // 结算积分 (底分 10 分)
  const baseScore = 10;
  const totalMult = Math.min(room.gameState.multiplier, 64); // 上限 64 倍
  const roundScore = baseScore * totalMult;

  const scores = {};
  room.seats.forEach((s, idx) => {
    if (!s) return;
    if (isLandlordWinner) {
      scores[idx] = (idx === room.gameState.landlordSeat) ? roundScore * 2 : -roundScore;
    } else {
      scores[idx] = (idx === room.gameState.landlordSeat) ? -roundScore * 2 : roundScore;
    }
  });
  room.gameState.scores = scores;

  // 全局重置准备状态
  room.seats.forEach(s => {
    if (s) {
      s.isReady = s.isAi ? true : false;
      s.isAuto = false;
    }
  });

  // 打包全员手牌复盘数据，彻底避免客户端时序不一致问题
  const revealedSeats = room.seats.map((s, idx) => ({
    seatIndex: idx,
    name: s ? s.name : '',
    avatar: s ? s.avatar : '',
    isAi: s ? s.isAi : false,
    isLandlord: idx === room.gameState.landlordSeat,
    score: scores[idx] || 0,
    handCards: room.gameState.hands[idx] || []
  }));

  broadcastRoom(doudizhuIo, room);

  doudizhuIo.to(room.code).emit('game_over_announced', {
    winnerSeat,
    winnerRole: room.gameState.winnerRole,
    spring,
    springType,
    multiplier: totalMult,
    scores,
    revealedSeats
  });
}

/**
 * 叫地主 / 抢地主流程调度
 */
function scheduleBiddingTurn(doudizhuIo, room) {
  clearRoomTimer(room);

  const seatIndex = room.gameState.bidState.currentBidder;
  const currentSeat = room.seats[seatIndex];
  if (!currentSeat) return;

  const isAi = currentSeat.isAi;
  const isAuto = currentSeat.isAuto || !currentSeat.isOnline;
  const phase = room.gameState.bidState.calledSeat === null ? 'BID' : 'ROB';

  room.gameState.turnDeadline = Date.now() + 15 * 1000;

  if (isAi || isAuto) {
    const delay = 700 + Math.floor(Math.random() * 600);
    room.timer = setTimeout(() => {
      const hand = room.gameState.hands[seatIndex] || [];
      const willBid = decideBid(hand, phase);
      handleBidAction(doudizhuIo, room, seatIndex, willBid);
    }, delay);
  } else {
    room.timer = setTimeout(() => {
      // 超时默认不叫/不抢
      handleBidAction(doudizhuIo, room, seatIndex, false);
    }, 15000);
  }
}

/**
 * 执行叫/抢操作
 */
function handleBidAction(doudizhuIo, room, seatIndex, wantBid) {
  if (room.gameState.phase !== 'BIDDING') return;
  if (room.gameState.bidState.currentBidder !== seatIndex) return;

  clearRoomTimer(room);
  const state = room.gameState.bidState;
  const isCalling = (state.calledSeat === null);

  let actionText = '';
  if (isCalling) {
    actionText = wantBid ? '叫地主' : '不叫';
    state.bids = state.bids || {};
    state.bids[seatIndex] = wantBid ? 'CALL' : 'PASS';
    if (wantBid) {
      state.calledSeat = seatIndex;
      state.lastRobSeat = seatIndex;
    }
  } else {
    actionText = wantBid ? '抢地主' : '不抢';
    if (wantBid) {
      room.gameState.multiplier *= 2;
      state.robbers.push(seatIndex);
      state.lastRobSeat = seatIndex;
    }
  }

  room.gameState.bidHistory.push({
    seat: seatIndex,
    action: actionText,
    wantBid
  });

  doudizhuIo.to(room.code).emit('bid_action_broadcast', {
    seatIndex,
    actionText,
    wantBid,
    multiplier: room.gameState.multiplier
  });

  // 判断叫牌阶段是否结束
  // 1. 如果还在叫地主阶段（首轮无人叫）
  if (isCalling && !wantBid) {
    const nextBidder = (seatIndex + 1) % 3;
    if (nextBidder === state.firstBidder) {
      // 全员不叫 -> 重新发牌流局
      doudizhuIo.to(room.code).emit('bid_redeal', { message: '全员不叫地主，重新洗牌发牌！' });
      setTimeout(() => {
        startNewGame(doudizhuIo, room);
      }, 1500);
      return;
    }
    state.currentBidder = nextBidder;
    broadcastRoom(doudizhuIo, room);
    scheduleBiddingTurn(doudizhuIo, room);
    return;
  }

  // 2. 如果有人叫了地主，或者处于抢地主阶段
  // 计算下一位有资格参与抢地主的玩家
  const callSeat = state.calledSeat;
  let nextBidder = (seatIndex + 1) % 3;

  // 检查是否已经轮完一圈回到叫地主者（或叫地主者做出最终决定）
  const totalDecisions = room.gameState.bidHistory.length;

  if (totalDecisions >= 3) {
    // 若后续无人抢，叫地主者直接当地主
    if (state.robbers.length === 0) {
      assignLandlord(doudizhuIo, room, state.calledSeat);
      return;
    }
    // 若有人抢过地主，且叫地主者还没参与最后抢地主反决
    if (!state.reRobDone && seatIndex !== state.calledSeat && state.bids[state.calledSeat] === 'CALL') {
      state.reRobDone = true;
      state.currentBidder = state.calledSeat;
      broadcastRoom(doudizhuIo, room);
      scheduleBiddingTurn(doudizhuIo, room);
      return;
    }
    // 叫牌完毕，最后抢地主的人为地主
    assignLandlord(doudizhuIo, room, state.lastRobSeat);
    return;
  }

  state.currentBidder = nextBidder;
  broadcastRoom(doudizhuIo, room);
  scheduleBiddingTurn(doudizhuIo, room);
}

/**
 * 确定地主并进入出牌阶段
 */
function assignLandlord(doudizhuIo, room, landlordSeat) {
  room.gameState.phase = 'PLAYING';
  room.gameState.landlordSeat = landlordSeat;
  room.gameState.currentTurnSeat = landlordSeat;

  // 地主收取 3 张底牌并重新理牌
  const bottom = room.gameState.bottomCards;
  room.gameState.hands[landlordSeat] = sortCards([
    ...room.gameState.hands[landlordSeat],
    ...bottom
  ]);

  doudizhuIo.to(room.code).emit('landlord_decided', {
    landlordSeat,
    bottomCards: bottom,
    multiplier: room.gameState.multiplier
  });

  broadcastRoom(doudizhuIo, room);
  scheduleTurnAction(doudizhuIo, room);
}

/**
 * 开始全新一局游戏（发牌）
 */
function startNewGame(doudizhuIo, room) {
  clearRoomTimer(room);

  const deck = createDeck();
  const hands = {
    0: sortCards(deck.slice(0, 17)),
    1: sortCards(deck.slice(17, 34)),
    2: sortCards(deck.slice(34, 51))
  };
  const bottomCards = deck.slice(51, 54);

  const firstBidder = Math.floor(Math.random() * 3);

  room.gameState = {
    phase: 'BIDDING',
    hands,
    bottomCards,
    landlordSeat: null,
    currentTurnSeat: null,
    turnTimeLimit: 25,
    turnDeadline: null,
    multiplier: 1,
    bidHistory: [],
    bidState: {
      firstBidder,
      currentBidder: firstBidder,
      calledSeat: null,
      robbers: [],
      lastRobSeat: null,
      reRobDone: false
    },
    lastValidPlay: null,
    passCount: 0,
    landlordPlayCount: 0,
    farmerPlayCount: 0,
    winnerSeat: null,
    winnerRole: null,
    spring: false,
    scores: {}
  };

  broadcastRoom(doudizhuIo, room);
  doudizhuIo.to(room.code).emit('cards_dealt');

  setTimeout(() => {
    scheduleBiddingTurn(doudizhuIo, room);
  }, 1000);
}

// 自动清理闲置房间
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const realPlayers = room.seats.filter(s => s && !s.isAi && s.isOnline);
    const lastActive = room.lastActiveTime || now;
    if (realPlayers.length === 0 && (now - lastActive > 20 * 60 * 1000)) {
      clearRoomTimer(room);
      rooms.delete(code);
      console.log(`[斗地主] 闲置房间 ${code} 已自动清理`);
    }
  }
}, 10 * 60 * 1000).unref();

/**
 * 导出斗地主 Socket.io 服务安装函数
 */
function setupDoudizhu(io, app) {
  const doudizhuIo = io.of('/doudizhu');

  doudizhuIo.on('connection', (socket) => {
    let currentRoomCode = null;
    let currentPlayerId = null;

    // 创建房间
    socket.on('create_room', (playerData, callback) => {
      try {
        const player = {
          id: playerData.id || `p_${Date.now()}`,
          socketId: socket.id,
          name: playerData.name || '玩家',
          avatar: playerData.avatar || '😎'
        };
        const room = createRoom(player);
        currentRoomCode = room.code;
        currentPlayerId = player.id;
        socket.join(room.code);

        if (typeof callback === 'function') {
          callback({ success: true, roomCode: room.code });
        }
        broadcastRoom(doudizhuIo, room);
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
          if (typeof callback === 'function') callback({ success: false, message: '房间不存在' });
          return;
        }

        const pid = player.id;
        currentRoomCode = roomCode;
        currentPlayerId = pid;
        socket.join(roomCode);

        // 检查是否已经在座位上（断线重连）
        let existingSeatIndex = room.seats.findIndex(s => s && s.id === pid);
        if (existingSeatIndex !== -1) {
          const seat = room.seats[existingSeatIndex];
          seat.socketId = socket.id;
          seat.isOnline = true;
          seat.name = escapeHtml(player.name || seat.name);
          seat.avatar = escapeHtml(player.avatar || seat.avatar);
          if (typeof callback === 'function') callback({ success: true, seatIndex: existingSeatIndex });
          broadcastRoom(doudizhuIo, room);
          return;
        }

        // 寻找空座位
        let emptySeatIndex = room.seats.findIndex(s => s === null);
        if (emptySeatIndex !== -1 && room.gameState.phase === 'LOBBY') {
          room.seats[emptySeatIndex] = {
            id: pid,
            socketId: socket.id,
            name: escapeHtml(player.name || `玩家${emptySeatIndex + 1}`),
            avatar: escapeHtml(player.avatar || '🤠'),
            isHost: false,
            isOnline: true,
            isAi: false,
            isReady: false,
            isAuto: false
          };
          if (typeof callback === 'function') callback({ success: true, seatIndex: emptySeatIndex });
        } else {
          // 作为观战者加入
          room.spectators.set(pid, {
            id: pid,
            socketId: socket.id,
            name: escapeHtml(player.name || '观战者'),
            avatar: escapeHtml(player.avatar || '👀')
          });
          if (typeof callback === 'function') callback({ success: true, isSpectator: true });
        }

        broadcastRoom(doudizhuIo, room);
      } catch (err) {
        console.error('join_room error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '加入房间失败' });
      }
    });

    // 房主添加电脑 AI 补位
    socket.on('add_ai', (callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;
      if (room.gameState.phase !== 'LOBBY') return;

      const emptyIndex = room.seats.findIndex(s => s === null);
      if (emptyIndex === -1) {
        if (typeof callback === 'function') callback({ success: false, message: '座位已满' });
        return;
      }

      const randomName = AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)] + (emptyIndex + 1);
      const randomAvatar = AI_AVATARS[Math.floor(Math.random() * AI_AVATARS.length)];

      room.seats[emptyIndex] = {
        id: `ai_${Date.now()}_${emptyIndex}`,
        socketId: null,
        name: randomName,
        avatar: randomAvatar,
        isHost: false,
        isOnline: true,
        isAi: true,
        isReady: true,
        isAuto: true
      };

      if (typeof callback === 'function') callback({ success: true });
      broadcastRoom(doudizhuIo, room);
    });

    // 房主踢出座位上的玩家或电脑
    socket.on('kick_seat', (seatIndex) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;
      if (room.gameState.phase !== 'LOBBY') return;
      if (seatIndex <= 0 || seatIndex >= 3) return; // 不能踢房主自己

      const target = room.seats[seatIndex];
      if (target) {
        if (target.socketId) {
          doudizhuIo.to(target.socketId).emit('kicked_from_room');
        }
        room.seats[seatIndex] = null;
        broadcastRoom(doudizhuIo, room);
      }
    });

    // 玩家准备 / 取消准备
    socket.on('toggle_ready', () => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.gameState.phase !== 'LOBBY') return;

      const seatIndex = room.seats.findIndex(s => s && s.id === currentPlayerId);
      if (seatIndex !== -1) {
        const seat = room.seats[seatIndex];
        seat.isReady = !seat.isReady;
        broadcastRoom(doudizhuIo, room);

        // 如果3个座位都满了且全员就绪，房主可开局或自动开局
        const allSeated = room.seats.every(s => s !== null);
        const allReady = room.seats.every(s => s && s.isReady);
        if (allSeated && allReady) {
          setTimeout(() => {
            if (room.gameState.phase === 'LOBBY' && room.seats.every(s => s && s.isReady)) {
              startNewGame(doudizhuIo, room);
            }
          }, 800);
        }
      }
    });

    // 房主强制开始游戏（只要 3 人满位即可）
    socket.on('host_start_game', () => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId) return;
      if (room.gameState.phase !== 'LOBBY') return;

      const allSeated = room.seats.every(s => s !== null);
      if (allSeated) {
        startNewGame(doudizhuIo, room);
      }
    });

    // 叫地主 / 抢地主
    socket.on('bid', (wantBid) => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const seatIndex = room.seats.findIndex(s => s && s.id === currentPlayerId);
      if (seatIndex !== -1) {
        handleBidAction(doudizhuIo, room, seatIndex, !!wantBid);
      }
    });

    // 出牌
    socket.on('play_cards', (cardIds, callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const seatIndex = room.seats.findIndex(s => s && s.id === currentPlayerId);
      if (seatIndex !== -1) {
        const ok = executePlay(doudizhuIo, room, seatIndex, cardIds || []);
        if (typeof callback === 'function') callback({ success: ok });
      }
    });

    // 不出 (Pass)
    socket.on('pass_turn', (callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const seatIndex = room.seats.findIndex(s => s && s.id === currentPlayerId);
      if (seatIndex !== -1) {
        const ok = executePass(doudizhuIo, room, seatIndex);
        if (typeof callback === 'function') callback({ success: ok });
      }
    });

    // 托管切换
    socket.on('toggle_auto', () => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const seatIndex = room.seats.findIndex(s => s && s.id === currentPlayerId);
      if (seatIndex !== -1) {
        const seat = room.seats[seatIndex];
        seat.isAuto = !seat.isAuto;
        broadcastRoom(doudizhuIo, room);
        // 若当前正是该玩家回合且切换为托管，立即触发代打
        if (seat.isAuto && room.gameState.phase === 'PLAYING' && room.gameState.currentTurnSeat === seatIndex) {
          scheduleTurnAction(doudizhuIo, room);
        }
      }
    });

    // 再来一局 (智能自动准备与秒开对局)
    socket.on('play_again', () => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.gameState.phase !== 'GAME_OVER') return;

      const mySeat = room.seats.find(s => s && s.id === currentPlayerId);
      if (mySeat) {
        mySeat.isReady = true;
      }
      // AI 电脑全部自动标记已就绪
      room.seats.forEach(s => {
        if (s && s.isAi) {
          s.isReady = true;
        }
      });

      const allSeated = room.seats.every(s => s !== null);
      const allReady = room.seats.every(s => s && s.isReady);

      if (allSeated && allReady) {
        startNewGame(doudizhuIo, room);
      } else {
        room.gameState.phase = 'LOBBY';
        broadcastRoom(doudizhuIo, room);
      }
    });

    // 发送互动表情 / 快捷短语
    socket.on('send_reaction', (content) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const sender = room.seats.find(s => s && s.id === currentPlayerId);
      if (sender) {
        doudizhuIo.to(room.code).emit('reaction_received', {
          senderId: sender.id,
          name: sender.name,
          avatar: sender.avatar,
          content: escapeHtml(String(content).substring(0, 50))
        });
      }
    });

    // 玩家退出房间
    socket.on('leave_room', (callback) => {
      try {
        if (currentRoomCode && currentPlayerId) {
          const room = rooms.get(currentRoomCode);
          if (room) {
            const seatIndex = room.seats.findIndex(s => s && s.id === currentPlayerId);
            if (seatIndex !== -1) {
              if (room.gameState.phase === 'LOBBY' || room.gameState.phase === 'GAME_OVER') {
                // 大厅或结算阶段直接清空座位
                room.seats[seatIndex] = null;
              } else {
                // 对局进行中，座位转为AI托管代打
                const s = room.seats[seatIndex];
                s.isOnline = false;
                s.isAuto = true;
                s.socketId = null;
                if (room.gameState.currentTurnSeat === seatIndex) {
                  scheduleTurnAction(doudizhuIo, room);
                }
              }

              // 房主顺位继承
              if (room.hostId === currentPlayerId) {
                const nextHost = room.seats.find(s => s && s.isOnline && !s.isAi);
                if (nextHost) {
                  room.hostId = nextHost.id;
                  room.seats.forEach(s => { if (s) s.isHost = (s.id === nextHost.id); });
                }
              }
            }
            room.spectators.delete(currentPlayerId);
            socket.leave(currentRoomCode);

            const activeHumans = room.seats.filter(s => s && s.isOnline && !s.isAi);
            if (activeHumans.length === 0 && room.spectators.size === 0) {
              clearRoomTimer(room);
              rooms.delete(currentRoomCode);
            } else {
              broadcastRoom(doudizhuIo, room);
            }
          }
        }
        currentRoomCode = null;
        currentPlayerId = null;
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('doudizhu leave_room error:', err);
        if (typeof callback === 'function') callback({ success: false });
      }
    });

    // 断开连接
    socket.on('disconnect', () => {
      if (!currentRoomCode || !currentPlayerId) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const seatIndex = room.seats.findIndex(s => s && s.id === currentPlayerId);
      if (seatIndex !== -1) {
        const seat = room.seats[seatIndex];
        seat.isOnline = false;
        seat.isAuto = true; // 掉线自动开启 AI 托管代打

        // 若当前正是该离线玩家回合，自动替其代打
        if (room.gameState.phase === 'PLAYING' && room.gameState.currentTurnSeat === seatIndex) {
          scheduleTurnAction(doudizhuIo, room);
        }
        broadcastRoom(doudizhuIo, room);
      }
      room.spectators.delete(currentPlayerId);
    });
  });
}

module.exports = { setupDoudizhu };
