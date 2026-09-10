// 四川麻将（血战到底 / 血流成河）独立服务端引擎
const rules = require('./rules');
const MahjongAI = require('./ai');

function setupMahjong(io, app) {
  const mahjongIo = io.of('/mahjong');
  const rooms = new Map();

  function generateRoomCode() {
    let code;
    do {
      code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(code));
    return code;
  }

  function getClientRoomData(room, requestingPlayerId) {
    let mySeatIndex = -1;
    if (requestingPlayerId) {
      mySeatIndex = room.seats.findIndex(s => s && s.id === requestingPlayerId);
    }

    return {
      code: room.code,
      hostId: room.hostId,
      mySeatIndex,
      settings: room.settings,
      seats: room.seats.map((s, idx) => {
        if (!s) return null;
        const isMe = (idx === mySeatIndex);
        return {
          seatIndex: idx,
          id: s.id,
          name: s.name,
          avatar: s.avatar,
          isHost: s.id === room.hostId,
          isOnline: s.isOnline,
          isAi: s.isAi,
          isReady: s.isReady,
          handCount: s.handCards ? s.handCards.length : 0,
          // 自己的手牌全部明牌，已经胡牌的玩家明牌，其余玩家隐藏
          handCards: (isMe || (s.hasHu && room.settings.mode === 'xuezhan') || room.gameState.phase === 'GAME_OVER')
            ? s.handCards
            : [],
          melds: s.melds || [],
          discards: s.discards || [],
          queSuit: s.queSuit,
          hasHu: s.hasHu,
          huInfo: s.huInfo,
          totalScore: s.totalScore || 0,
          chips: s.chips || 1000,
          currentStreak: s.currentStreak || 0,
          maxStreak: s.maxStreak || 0,
          winCount: s.winCount || 0,
          totalRounds: s.totalRounds || 0
        };
      }),
      gameState: {
        phase: room.gameState.phase,
        dealerSeat: room.gameState.dealerSeat,
        currentTurnSeat: room.gameState.currentTurnSeat,
        turnDeadline: room.gameState.turnDeadline,
        remainingTileCount: room.gameState.wall ? room.gameState.wall.length : 0,
        lastDiscard: room.gameState.lastDiscard,
        swapDirection: room.gameState.swapDirection,
        swapSelections: room.gameState.swapSelections ? Object.fromEntries(
          Object.entries(room.gameState.swapSelections).map(([k, v]) => [k, true])
        ) : {},
        huCount: room.gameState.huCount,
        scores: room.gameState.scores
      }
    };
  }

  function broadcastRoom(room) {
    if (!room) return;
    room.lastActiveTime = Date.now();

    // 1. 精准给每一位在座玩家的 Socket 下发个性化手牌数据 (保证手牌 100% 准确下发)
    room.seats.forEach(s => {
      if (s && s.socketId && s.isOnline && !s.isAi) {
        mahjongIo.to(s.socketId).emit('room_update', getClientRoomData(room, s.id));
      }
    });

    // 2. 兜底向房间 room.code 广播全局视角数据 (用于重连/临时连接或旁观者)
    const clients = mahjongIo.adapter.rooms.get(room.code);
    if (clients) {
      for (const clientId of clients) {
        const isSeatSocket = room.seats.some(s => s && s.socketId === clientId);
        if (!isSeatSocket) {
          const socket = mahjongIo.sockets.get(clientId);
          if (socket) {
            const pid = socket.data && socket.data.playerId;
            socket.emit('room_update', getClientRoomData(room, pid || null));
          }
        }
      }
    }
  }

  function createRoom(hostPlayer) {
    const code = generateRoomCode();
    const room = {
      code,
      hostId: hostPlayer.id,
      settings: {
        baseScore: 1,
        mode: 'xuezhan', // 'xuezhan' (血战到底) 或 'xueliu' (血流成河)
        maxFan: 4,       // 4番封顶 (16倍)
        enableSwapThree: true, // 换三张
        startingScore: 1000
      },
      seats: [
        {
          id: hostPlayer.id,
          socketId: hostPlayer.socketId || null,
          name: hostPlayer.name || '房主',
          avatar: hostPlayer.avatar || '👑',
          isOnline: true,
          isAi: false,
          isReady: false,
          handCards: [],
          melds: [],
          discards: [],
          queSuit: null,
          hasHu: false,
          huInfo: null,
          totalScore: 0,
          chips: 1000,
          currentStreak: 0,
          maxStreak: 0,
          winCount: 0,
          totalRounds: 0
        },
        null, null, null
      ],
      gameState: {
        phase: 'LOBBY',
        dealerSeat: 0,
        currentTurnSeat: null,
        turnDeadline: null,
        wall: [],
        lastDiscard: null,
        swapDirection: 'clockwise',
        swapSelections: {},
        pendingPrompts: null, // { seatIndex: actions }
        huCount: 0,
        scores: {}
      },
      timers: {}
    };

    rooms.set(code, room);
    return room;
  }

  // 开始新对局
  function startNewGame(room) {
    // 清除定时器
    clearAllRoomTimers(room);

    const deck = rules.shuffle(rules.createDeck());
    const hands = [[], [], [], []];

    // 发牌：庄家 14 张，闲家 13 张
    for (let i = 0; i < 13; i++) {
      for (let s = 0; s < 4; s++) {
        if (deck.length > 0) hands[s].push(deck.pop());
      }
    }
    // 庄家多摸一张
    if (deck.length > 0) hands[room.gameState.dealerSeat].push(deck.pop());

    room.seats.forEach((seat, idx) => {
      if (seat) {
        seat.handCards = rules.sortTiles(hands[idx]);
        seat.melds = [];
        seat.discards = [];
        seat.queSuit = null;
        seat.hasHu = false;
        seat.huInfo = null;
      }
    });

    room.gameState.wall = deck;
    room.gameState.lastDiscard = null;
    room.gameState.huCount = 0;
    room.gameState.scores = {};
    room.gameState.pendingPrompts = null;

    if (room.settings.enableSwapThree) {
      // 进入换三张阶段
      room.gameState.phase = 'SWAP_THREE';
      room.gameState.swapSelections = {};
      const directions = ['clockwise', 'counter_clockwise', 'opposite'];
      room.gameState.swapDirection = directions[Math.floor(Math.random() * directions.length)];
      room.gameState.turnDeadline = Date.now() + 15000;

      // AI 自动完成换三张选择
      setTimeout(() => {
        handleAiSwapThree(room);
      }, 800);

      // 换三张 15 秒超时保底
      room.timers.swapThree = setTimeout(() => {
        autoCompleteSwapThree(room);
      }, 15000);
    } else {
      // 直接进入定缺阶段
      enterDingQuePhase(room);
    }

    broadcastRoom(room);
  }

  function handleAiSwapThree(room) {
    if (room.gameState.phase !== 'SWAP_THREE') return;
    room.seats.forEach((s, idx) => {
      if (s && s.isAi && !room.gameState.swapSelections[idx]) {
        const aiChoices = MahjongAI.decideSwapThree(s.handCards);
        room.gameState.swapSelections[idx] = aiChoices.map(t => t.id);
      }
    });

    checkSwapThreeCompletion(room);
  }

  function autoCompleteSwapThree(room) {
    if (room.gameState.phase !== 'SWAP_THREE') return;
    room.seats.forEach((s, idx) => {
      if (s && !room.gameState.swapSelections[idx]) {
        const choices = MahjongAI.decideSwapThree(s.handCards);
        room.gameState.swapSelections[idx] = choices.map(t => t.id);
      }
    });
    checkSwapThreeCompletion(room);
  }

  function checkSwapThreeCompletion(room) {
    if (room.gameState.phase !== 'SWAP_THREE') return;
    const allSelected = room.seats.every((s, idx) => !s || room.gameState.swapSelections[idx]);
    if (!allSelected) {
      broadcastRoom(room);
      return;
    }

    if (room.timers.swapThree) clearTimeout(room.timers.swapThree);

    // 执行换牌
    executeSwapThree(room);
  }

  function executeSwapThree(room) {
    const dir = room.gameState.swapDirection;
    // 换牌目标索引计算
    // 顺时针: 0 -> 1, 1 -> 2, 2 -> 3, 3 -> 0
    // 逆时针: 0 -> 3, 3 -> 2, 2 -> 1, 1 -> 0
    // 对家: 0 <-> 2, 1 <-> 3
    const targetMap = {};
    for (let i = 0; i < 4; i++) {
      if (dir === 'clockwise') targetMap[i] = (i + 1) % 4;
      else if (dir === 'counter_clockwise') targetMap[i] = (i + 3) % 4;
      else targetMap[i] = (i + 2) % 4;
    }

    const outgoingTiles = {};
    room.seats.forEach((s, idx) => {
      if (!s) return;
      const ids = new Set(room.gameState.swapSelections[idx] || []);
      outgoingTiles[idx] = s.handCards.filter(t => ids.has(t.id));
      s.handCards = s.handCards.filter(t => !ids.has(t.id));
    });

    for (let fromIdx = 0; fromIdx < 4; fromIdx++) {
      const toIdx = targetMap[fromIdx];
      if (room.seats[toIdx] && outgoingTiles[fromIdx]) {
        room.seats[toIdx].handCards.push(...outgoingTiles[fromIdx]);
        room.seats[toIdx].handCards = rules.sortTiles(room.seats[toIdx].handCards);
      }
    }

    mahjongIo.to(room.code).emit('swap_three_finished', {
      direction: dir
    });

    // 立即向各玩家下发换牌后的新手牌
    broadcastRoom(room);

    setTimeout(() => {
      enterDingQuePhase(room);
    }, 1200);
  }

  function enterDingQuePhase(room) {
    room.gameState.phase = 'DING_QUE';
    room.gameState.turnDeadline = Date.now() + 10000;

    // AI 自动定缺
    setTimeout(() => {
      room.seats.forEach((s, idx) => {
        if (s && s.isAi && !s.queSuit) {
          s.queSuit = MahjongAI.decideQue(s.handCards);
        }
      });
      checkDingQueCompletion(room);
    }, 600);

    room.timers.dingQue = setTimeout(() => {
      autoCompleteDingQue(room);
    }, 10000);

    broadcastRoom(room);
  }

  function autoCompleteDingQue(room) {
    if (room.gameState.phase !== 'DING_QUE') return;
    room.seats.forEach((s, idx) => {
      if (s && !s.queSuit) {
        s.queSuit = MahjongAI.decideQue(s.handCards);
      }
    });
    checkDingQueCompletion(room);
  }

  function checkDingQueCompletion(room) {
    if (room.gameState.phase !== 'DING_QUE') return;
    const allDecided = room.seats.every(s => !s || s.queSuit !== null);
    if (!allDecided) {
      broadcastRoom(room);
      return;
    }

    if (room.timers.dingQue) clearTimeout(room.timers.dingQue);

    // 全部定缺完毕，进入行牌阶段
    room.gameState.phase = 'PLAYING';
    const dealer = room.gameState.dealerSeat;
    room.gameState.currentTurnSeat = dealer;
    room.gameState.turnDeadline = Date.now() + 15000;

    mahjongIo.to(room.code).emit('ding_que_finished');
    broadcastRoom(room);

    // 如果庄家是 AI，触发自动出牌
    checkAiTurn(room);
  }

  // 轮到玩家摸牌
  function drawNextTile(room, seatIndex) {
    if (room.gameState.wall.length === 0) {
      // 牌墙摸空，进入流局复盘结算 (查花猪、查大叫)
      handleWallExhausted(room);
      return;
    }

    const seat = room.seats[seatIndex];
    if (!seat) return;

    const drawnTile = room.gameState.wall.pop();
    seat.handCards.push(drawnTile);

    room.gameState.currentTurnSeat = seatIndex;
    room.gameState.turnDeadline = Date.now() + 15000;
    room.gameState.lastDiscard = null;

    // 检测摸牌玩家是否可以自摸胡牌或暗杠/弯杠
    const canZimo = rules.canHu(seat.handCards, seat.melds, seat.queSuit);
    const myGangs = rules.findMyGangs(seat.handCards, seat.melds, seat.queSuit);

    const clientSocket = getSocketByPlayerId(room, seat.id);
    if (clientSocket) {
      clientSocket.emit('tile_drawn', {
        tile: drawnTile,
        canZimo,
        gangOptions: myGangs
      });
    }

    broadcastRoom(room);

    // AI 决策
    if (seat.isAi) {
      setTimeout(() => {
        if (canZimo) {
          executeHu(room, seatIndex, null, true);
        } else if (myGangs.length > 0) {
          executeMyGang(room, seatIndex, myGangs[0]);
        } else {
          const discard = MahjongAI.decideDiscard(seat.handCards, seat.melds, seat.queSuit);
          executeDiscard(room, seatIndex, discard.id);
        }
      }, 1000);
    }
  }

  // 执行出牌
  function executeDiscard(room, seatIndex, tileId) {
    const seat = room.seats[seatIndex];
    if (!seat) return;

    const tileIdx = seat.handCards.findIndex(t => t.id === tileId);
    if (tileIdx === -1) return;

    const [discarded] = seat.handCards.splice(tileIdx, 1);
    seat.handCards = rules.sortTiles(seat.handCards);
    seat.discards.push(discarded);

    room.gameState.lastDiscard = {
      seatIndex,
      tile: discarded
    };

    mahjongIo.to(room.code).emit('tile_discarded', {
      seatIndex,
      tile: discarded
    });

    // 检查其他未胡牌的玩家是否有碰、杠、胡响应
    checkForPrompts(room, seatIndex, discarded);
  }

  // 检查其余 3 家的反应
  function checkForPrompts(room, discarderSeat, tile) {
    const prompts = {};
    let hasAnyPrompt = false;

    room.seats.forEach((s, idx) => {
      if (!s || idx === discarderSeat) return;
      if (room.settings.mode === 'xuezhan' && s.hasHu) return; // 血战到底已胡牌不参与碰杠胡

      const canHu = rules.canHu([...s.handCards, tile], s.melds, s.queSuit);
      const canGang = rules.canZhiGang(s.handCards, tile, s.queSuit);
      const canPeng = rules.canPeng(s.handCards, tile, s.queSuit);

      if (canHu || canGang || canPeng) {
        prompts[idx] = { canHu, canGang, canPeng, response: null };
        hasAnyPrompt = true;
      }
    });

    if (!hasAnyPrompt) {
      // 无人碰杠胡，轮到下一家摸牌
      advanceToNextTurn(room, discarderSeat);
      return;
    }

    room.gameState.pendingPrompts = prompts;
    room.gameState.turnDeadline = Date.now() + 10000;

    // 向有提示的客户端广播操作提示
    for (const seatIdxStr in prompts) {
      const seatIdx = Number(seatIdxStr);
      const s = room.seats[seatIdx];
      const sock = getSocketByPlayerId(room, s.id);
      if (sock) {
        sock.emit('action_prompt', {
          tile,
          actions: prompts[seatIdx]
        });
      }

      // 如果是 AI，触发 AI 决策
      if (s.isAi) {
        setTimeout(() => {
          const aiDecision = MahjongAI.decideResponse({
            handCards: s.handCards,
            melds: s.melds,
            queSuit: s.queSuit,
            discardTile: tile,
            canHu: prompts[seatIdx].canHu,
            canGang: prompts[seatIdx].canGang,
            canPeng: prompts[seatIdx].canPeng
          });
          handlePromptResponse(room, seatIdx, aiDecision.action);
        }, 800);
      }
    }

    broadcastRoom(room);

    // 超时自动过
    room.timers.prompt = setTimeout(() => {
      resolvePendingPrompts(room, true);
    }, 10000);
  }

  function handlePromptResponse(room, seatIndex, action) {
    if (!room.gameState.pendingPrompts || !room.gameState.pendingPrompts[seatIndex]) return;
    room.gameState.pendingPrompts[seatIndex].response = action; // 'hu', 'gang', 'peng', 'pass'

    // 检查是否所有提示都已回应
    const allAnswered = Object.values(room.gameState.pendingPrompts).every(p => p.response !== null);
    if (allAnswered) {
      if (room.timers.prompt) clearTimeout(room.timers.prompt);
      resolvePendingPrompts(room, false);
    }
  }

  // 仲裁响应优先级：胡 > 杠 > 碰 > 过
  function resolvePendingPrompts(room, isTimeout = false) {
    const prompts = room.gameState.pendingPrompts;
    if (!prompts) return;
    room.gameState.pendingPrompts = null;

    const discarderSeat = room.gameState.lastDiscard.seatIndex;
    const tile = room.gameState.lastDiscard.tile;

    // 1. 查找胡牌
    const huSeats = Object.keys(prompts)
      .map(Number)
      .filter(idx => prompts[idx].response === 'hu' || (isTimeout && prompts[idx].canHu));

    if (huSeats.length > 0) {
      // 触发一炮单响或一炮多响 (血战特色：可以多家同时胡同一张牌)
      huSeats.forEach(winnerSeat => {
        executeHu(room, winnerSeat, discarderSeat, false);
      });
      return;
    }

    // 2. 查找直杠 (刮风)
    const gangSeat = Object.keys(prompts)
      .map(Number)
      .find(idx => prompts[idx].response === 'gang');

    if (gangSeat !== undefined) {
      executeZhiGang(room, gangSeat, discarderSeat, tile);
      return;
    }

    // 3. 查找碰牌
    const pengSeat = Object.keys(prompts)
      .map(Number)
      .find(idx => prompts[idx].response === 'peng');

    if (pengSeat !== undefined) {
      executePeng(room, pengSeat, discarderSeat, tile);
      return;
    }

    // 4. 全员放弃 (过)，顺延到下一家
    advanceToNextTurn(room, discarderSeat);
  }

  // 执行碰牌
  function executePeng(room, seatIndex, discarderSeat, tile) {
    const seat = room.seats[seatIndex];
    if (!seat) return;

    // 从弃牌区移除该牌
    const discarder = room.seats[discarderSeat];
    if (discarder && discarder.discards.length > 0) {
      discarder.discards.pop();
    }

    // 从手牌移除 2 张同点数牌
    let removed = 0;
    seat.handCards = seat.handCards.filter(t => {
      if (removed < 2 && t.suit === tile.suit && t.rank === tile.rank) {
        removed++;
        return false;
      }
      return true;
    });

    const meldTiles = [
      tile,
      { id: tile.id + 1000, suit: tile.suit, rank: tile.rank },
      { id: tile.id + 2000, suit: tile.suit, rank: tile.rank }
    ];

    seat.melds.push({
      type: 'peng',
      suit: tile.suit,
      rank: tile.rank,
      fromSeat: discarderSeat,
      tiles: meldTiles
    });

    room.gameState.currentTurnSeat = seatIndex;
    room.gameState.turnDeadline = Date.now() + 15000;
    room.gameState.lastDiscard = null;

    mahjongIo.to(room.code).emit('action_peng_announced', {
      seatIndex,
      fromSeat: discarderSeat,
      tile
    });

    broadcastRoom(room);
    checkAiTurn(room);
  }

  // 执行直杠 (明杠 / 刮风)
  function executeZhiGang(room, seatIndex, discarderSeat, tile) {
    const seat = room.seats[seatIndex];
    const discarder = room.seats[discarderSeat];
    if (!seat || !discarder) return;

    if (discarder.discards.length > 0) discarder.discards.pop();

    // 手牌中移除 3 张
    let removed = 0;
    seat.handCards = seat.handCards.filter(t => {
      if (removed < 3 && t.suit === tile.suit && t.rank === tile.rank) {
        removed++;
        return false;
      }
      return true;
    });

    seat.melds.push({
      type: 'zhi_gang',
      suit: tile.suit,
      rank: tile.rank,
      fromSeat: discarderSeat,
      tiles: [
        tile,
        { id: tile.id + 1000, suit: tile.suit, rank: tile.rank },
        { id: tile.id + 2000, suit: tile.suit, rank: tile.rank },
        { id: tile.id + 3000, suit: tile.suit, rank: tile.rank }
      ]
    });

    // 刮风即时计分 (点杠者给杠牌者 2 倍底分)
    const gangFee = room.settings.baseScore * 2;
    discarder.chips = (discarder.chips || 1000) - gangFee;
    seat.chips = (seat.chips || 1000) + gangFee;

    mahjongIo.to(room.code).emit('gang_announced', {
      type: 'zhi_gang',
      seatIndex,
      fromSeat: discarderSeat,
      tile,
      fee: gangFee
    });

    // 杠后从牌墙尾部补牌 (杠上开花机会)
    drawNextTile(room, seatIndex);
  }

  // 执行自摸暗杠 / 弯杠 (下雨)
  function executeMyGang(room, seatIndex, gangOption) {
    const seat = room.seats[seatIndex];
    if (!seat) return;

    const base = room.settings.baseScore;

    if (gangOption.type === 'an_gang') {
      // 暗杠 (下雨)：其余未胡牌的玩家每家给 2 倍底分
      seat.handCards = seat.handCards.filter(t => !(t.suit === gangOption.suit && t.rank === gangOption.rank));
      seat.melds.push({
        type: 'an_gang',
        suit: gangOption.suit,
        rank: gangOption.rank,
        tiles: [
          { suit: gangOption.suit, rank: gangOption.rank },
          { suit: gangOption.suit, rank: gangOption.rank },
          { suit: gangOption.suit, rank: gangOption.rank },
          { suit: gangOption.suit, rank: gangOption.rank }
        ]
      });

      const fee = base * 2;
      room.seats.forEach((other, oIdx) => {
        if (other && oIdx !== seatIndex && (!other.hasHu || room.settings.mode === 'xueliu')) {
          other.chips = (other.chips || 1000) - fee;
          seat.chips = (seat.chips || 1000) + fee;
        }
      });

      mahjongIo.to(room.code).emit('gang_announced', {
        type: 'an_gang',
        seatIndex,
        tile: { suit: gangOption.suit, rank: gangOption.rank }
      });
    } else if (gangOption.type === 'wan_gang') {
      // 补杠 / 弯杠：手牌移除第 4 张，转为杠牌，其余每家出 1 倍底分
      const idx = seat.handCards.findIndex(t => t.suit === gangOption.suit && t.rank === gangOption.rank);
      if (idx !== -1) seat.handCards.splice(idx, 1);

      const m = seat.melds.find(x => x.type === 'peng' && x.suit === gangOption.suit && x.rank === gangOption.rank);
      if (m) {
        m.type = 'wan_gang';
        m.tiles.push({ suit: gangOption.suit, rank: gangOption.rank });
      }

      const fee = base * 1;
      room.seats.forEach((other, oIdx) => {
        if (other && oIdx !== seatIndex && (!other.hasHu || room.settings.mode === 'xueliu')) {
          other.chips = (other.chips || 1000) - fee;
          seat.chips = (seat.chips || 1000) + fee;
        }
      });

      mahjongIo.to(room.code).emit('gang_announced', {
        type: 'wan_gang',
        seatIndex,
        tile: { suit: gangOption.suit, rank: gangOption.rank }
      });
    }

    // 杠后摸牌
    drawNextTile(room, seatIndex);
  }

  // 执行胡牌 (点炮胡 或 自摸胡)
  function executeHu(room, winnerSeat, discarderSeat, isZimo) {
    const winner = room.seats[winnerSeat];
    if (!winner) return;

    const fanInfo = rules.calculateFan({
      handCards: winner.handCards,
      melds: winner.melds,
      queSuit: winner.queSuit,
      isZimo
    });

    // 封顶限制
    const maxFan = room.settings.maxFan || 4;
    const effectiveFan = (maxFan > 0 && fanInfo.totalFan > maxFan) ? maxFan : fanInfo.totalFan;
    const mult = Math.pow(2, effectiveFan);
    const scorePerPlayer = room.settings.baseScore * mult;

    let deltaTotal = 0;
    if (isZimo) {
      // 自摸：所有其他活跃玩家各付 scorePerPlayer
      room.seats.forEach((other, oIdx) => {
        if (other && oIdx !== winnerSeat && (!other.hasHu || room.settings.mode === 'xueliu')) {
          other.chips = (other.chips || 1000) - scorePerPlayer;
          other.totalScore = (other.totalScore || 0) - scorePerPlayer;
          deltaTotal += scorePerPlayer;
        }
      });
    } else {
      // 点炮：点炮者一家全包
      const discarder = room.seats[discarderSeat];
      if (discarder) {
        discarder.chips = (discarder.chips || 1000) - scorePerPlayer;
        discarder.totalScore = (discarder.totalScore || 0) - scorePerPlayer;
        deltaTotal += scorePerPlayer;
      }
    }

    winner.chips = (winner.chips || 1000) + deltaTotal;
    winner.totalScore = (winner.totalScore || 0) + deltaTotal;
    winner.winCount = (winner.winCount || 0) + 1;
    winner.currentStreak = (winner.currentStreak || 0) + 1;
    if (winner.currentStreak > (winner.maxStreak || 0)) winner.maxStreak = winner.currentStreak;

    winner.hasHu = true;
    winner.huInfo = {
      isZimo,
      fanInfo,
      mult,
      score: deltaTotal,
      fromSeat: isZimo ? null : discarderSeat
    };

    room.gameState.huCount = (room.gameState.huCount || 0) + 1;

    mahjongIo.to(room.code).emit('player_hu_announced', {
      winnerSeat,
      discarderSeat,
      isZimo,
      fanInfo,
      score: deltaTotal,
      huOrder: room.gameState.huCount
    });

    // 血战到底核心规则：3 家胡牌或者摸完牌对局才结束！
    const unHuPlayers = room.seats.filter(s => s && !s.hasHu);

    if (room.settings.mode === 'xuezhan') {
      if (unHuPlayers.length <= 1) {
        // 只剩 1 家未胡，对局直接结束！
        endGame(room, 'THREE_PLAYERS_HU');
        return;
      }
    }

    // 继续下一位活跃玩家行牌
    const nextSeat = isZimo ? winnerSeat : discarderSeat;
    advanceToNextTurn(room, nextSeat);
  }

  // 顺延到下一位活跃玩家
  function advanceToNextTurn(room, fromSeat) {
    let next = (fromSeat + 1) % 4;
    let loop = 0;
    while (loop < 4) {
      const s = room.seats[next];
      if (s) {
        if (room.settings.mode === 'xueliu' || !s.hasHu) {
          // 找到了下一位活跃玩家，发牌
          drawNextTile(room, next);
          return;
        }
      }
      next = (next + 1) % 4;
      loop++;
    }

    // 全员均胡牌
    endGame(room, 'ALL_PLAYERS_HU');
  }

  // 牌墙摸完流局：查花猪、查大叫、退税
  function handleWallExhausted(room) {
    const unHuPlayers = room.seats.map((s, idx) => ({ seat: s, idx })).filter(x => x.seat && !x.seat.hasHu);
    const maxPenalty = room.settings.baseScore * 16;

    // 1. 查花猪：手里还握着定缺牌的人
    const huaZhus = [];
    const nonHuaZhus = [];

    unHuPlayers.forEach(({ seat, idx }) => {
      if (rules.hasQueSuit(seat.handCards, seat.queSuit)) {
        huaZhus.push(idx);
      } else {
        nonHuaZhus.push(idx);
      }
    });

    // 2. 查叫：没听牌的人赔付给听牌的人
    const tingPlayers = [];
    const noTingPlayers = [];

    nonHuaZhus.forEach(idx => {
      const s = room.seats[idx];
      const ting = rules.getTingInfo(s.handCards, s.melds, s.queSuit);
      if (ting.isTing) {
        tingPlayers.push({ idx, ting });
      } else {
        noTingPlayers.push(idx);
      }
    });

    // 惩罚结算
    huaZhus.forEach(hzIdx => {
      tingPlayers.forEach(({ idx: tIdx }) => {
        room.seats[hzIdx].chips -= maxPenalty;
        room.seats[tIdx].chips += maxPenalty;
      });
    });

    noTingPlayers.forEach(ntIdx => {
      tingPlayers.forEach(({ idx: tIdx, ting }) => {
        const maxHuMult = Math.max(...ting.huTiles.map(h => h.multiplier || 2));
        const penalty = room.settings.baseScore * maxHuMult;
        room.seats[ntIdx].chips -= penalty;
        room.seats[tIdx].chips += penalty;
      });
    });

    endGame(room, 'WALL_EXHAUSTED');
  }

  function endGame(room, reason) {
    clearAllRoomTimers(room);
    room.gameState.phase = 'GAME_OVER';

    // 统计每局胜负
    room.seats.forEach(s => {
      if (s) s.totalRounds = (s.totalRounds || 0) + 1;
    });

    // 庄家轮换 (如果有赢家，首位胡牌者当庄；否则下家当庄)
    room.gameState.dealerSeat = (room.gameState.dealerSeat + 1) % 4;

    const revealedSeats = room.seats.map((s, idx) => {
      if (!s) return null;
      return {
        seatIndex: idx,
        name: s.name,
        avatar: s.avatar,
        handCards: s.handCards,
        melds: s.melds,
        discards: s.discards,
        hasHu: s.hasHu,
        huInfo: s.huInfo,
        chips: s.chips,
        totalScore: s.totalScore
      };
    });

    mahjongIo.to(room.code).emit('game_over_announced', {
      reason,
      revealedSeats
    });

    broadcastRoom(room);
  }

  function checkAiTurn(room) {
    if (room.gameState.phase !== 'PLAYING') return;
    const curSeat = room.gameState.currentTurnSeat;
    const s = room.seats[curSeat];
    if (s && s.isAi && (!s.hasHu || room.settings.mode === 'xueliu')) {
      setTimeout(() => {
        const discard = MahjongAI.decideDiscard(s.handCards, s.melds, s.queSuit);
        executeDiscard(room, curSeat, discard.id);
      }, 1000);
    }
  }

  function getSocketByPlayerId(room, playerId) {
    const clients = mahjongIo.adapter.rooms.get(room.code);
    if (!clients) return null;
    for (const clientId of clients) {
      const sock = mahjongIo.sockets.get(clientId);
      if (sock && sock.data && sock.data.playerId === playerId) {
        return sock;
      }
    }
    return null;
  }

  function clearAllRoomTimers(room) {
    for (const k in room.timers) {
      if (room.timers[k]) {
        clearTimeout(room.timers[k]);
        room.timers[k] = null;
      }
    }
  }

  // Socket 链接事件监听
  mahjongIo.on('connection', (socket) => {
    let currentRoomCode = null;
    let currentPlayerId = null;

    // 创建房间
    socket.on('create_room', (player, callback) => {
      try {
        player.socketId = socket.id;
        const room = createRoom(player);
        currentRoomCode = room.code;
        currentPlayerId = player.id;
        socket.data.playerId = player.id;
        room.seats[0].socketId = socket.id;
        socket.join(room.code);

        if (typeof callback === 'function') {
          callback({ success: true, roomCode: room.code });
        }
        broadcastRoom(room);
      } catch (err) {
        console.error('mahjong create_room error:', err);
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

        currentRoomCode = roomCode;
        currentPlayerId = player.id;
        socket.data.playerId = player.id;
        socket.join(roomCode);

        // 检查是否已经在房间里 (重连)
        const existingIdx = room.seats.findIndex(s => s && s.id === player.id);
        if (existingIdx !== -1) {
          room.seats[existingIdx].socketId = socket.id;
          room.seats[existingIdx].isOnline = true;
          room.seats[existingIdx].name = player.name || room.seats[existingIdx].name;
          room.seats[existingIdx].avatar = player.avatar || room.seats[existingIdx].avatar;
          if (typeof callback === 'function') callback({ success: true, seatIndex: existingIdx });
        } else {
          // 找空座
          const emptyIdx = room.seats.findIndex(s => s === null);
          if (emptyIdx === -1) {
            if (typeof callback === 'function') callback({ success: false, message: '房间已满员 (4人)' });
            return;
          }

          room.seats[emptyIdx] = {
            id: player.id,
            socketId: socket.id,
            name: player.name || `雀友${emptyIdx + 1}`,
            avatar: player.avatar || '👑',
            isOnline: true,
            isAi: false,
            isReady: false,
            handCards: [],
            melds: [],
            discards: [],
            queSuit: null,
            hasHu: false,
            huInfo: null,
            totalScore: 0,
            chips: 1000,
            currentStreak: 0,
            maxStreak: 0,
            winCount: 0,
            totalRounds: 0
          };
          if (typeof callback === 'function') callback({ success: true, seatIndex: emptyIdx });
        }

        broadcastRoom(room);
      } catch (err) {
        console.error('mahjong join_room error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '加入房间异常' });
      }
    });

    // 准备切换
    socket.on('toggle_ready', () => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.gameState.phase !== 'LOBBY') return;
      const seat = room.seats.find(s => s && s.id === currentPlayerId);
      if (seat) {
        seat.isReady = !seat.isReady;
        broadcastRoom(room);
      }
    });

    // 房主添加 AI 电脑陪练
    socket.on('add_ai', (callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId || room.gameState.phase !== 'LOBBY') {
        if (typeof callback === 'function') callback({ success: false, message: '无权操作' });
        return;
      }

      const emptyIdx = room.seats.findIndex(s => s === null);
      if (emptyIdx === -1) {
        if (typeof callback === 'function') callback({ success: false, message: '座位已满' });
        return;
      }

      const aiAvatars = ['🤖', '🦾', '🐱', '🐼', '🦊', '🦁'];
      const aiNames = ['智能阿尔法雀', '雀神九段', '川麻小王子', '摸牌圣手', '天胡小霸王'];
      room.seats[emptyIdx] = {
        id: `ai_${Math.random().toString(36).substring(2, 9)}`,
        name: aiNames[Math.floor(Math.random() * aiNames.length)],
        avatar: aiAvatars[Math.floor(Math.random() * aiAvatars.length)],
        isOnline: true,
        isAi: true,
        isReady: true,
        handCards: [],
        melds: [],
        discards: [],
        queSuit: null,
        hasHu: false,
        huInfo: null,
        totalScore: 0,
        chips: 1000,
        currentStreak: 0,
        maxStreak: 0,
        winCount: 0,
        totalRounds: 0
      };

      if (typeof callback === 'function') callback({ success: true });
      broadcastRoom(room);
    });

    // 房主更新设置
    socket.on('update_room_settings', (newSettings, callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId || room.gameState.phase !== 'LOBBY') {
        if (typeof callback === 'function') callback({ success: false, message: '无法修改设置' });
        return;
      }

      room.settings = {
        baseScore: Number(newSettings.baseScore) || 1,
        mode: ['xuezhan', 'xueliu'].includes(newSettings.mode) ? newSettings.mode : 'xuezhan',
        maxFan: [0, 3, 4, 5].includes(Number(newSettings.maxFan)) ? Number(newSettings.maxFan) : 4,
        enableSwapThree: newSettings.enableSwapThree !== false,
        startingScore: 1000
      };

      if (typeof callback === 'function') callback({ success: true, settings: room.settings });
      mahjongIo.to(room.code).emit('room_settings_updated', room.settings);
      broadcastRoom(room);
    });

    // 房主开局发牌
    socket.on('host_start_game', () => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentPlayerId || room.gameState.phase !== 'LOBBY') return;
      const allSeated = room.seats.every(s => s !== null);
      if (!allSeated) return;

      startNewGame(room);
    });

    // 提交换三张
    socket.on('submit_swap_three', (tileIds, callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.gameState.phase !== 'SWAP_THREE') return;
      const seatIdx = room.seats.findIndex(s => s && s.id === currentPlayerId);
      if (seatIdx === -1 || !Array.isArray(tileIds) || tileIds.length !== 3) return;

      room.gameState.swapSelections[seatIdx] = tileIds;
      if (typeof callback === 'function') callback({ success: true });
      checkSwapThreeCompletion(room);
    });

    // 提交定缺
    socket.on('submit_ding_que', (queSuit, callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.gameState.phase !== 'DING_QUE') return;
      const seat = room.seats.find(s => s && s.id === currentPlayerId);
      if (!seat) return;

      if ([rules.SUITS.WAN, rules.SUITS.TONG, rules.SUITS.TIAO].includes(queSuit)) {
        seat.queSuit = queSuit;
        if (typeof callback === 'function') callback({ success: true });
        checkDingQueCompletion(room);
      }
    });

    // 玩家出牌
    socket.on('discard_tile', (tileId, callback) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.gameState.phase !== 'PLAYING') return;
      const seatIdx = room.seats.findIndex(s => s && s.id === currentPlayerId);
      if (seatIdx === -1 || room.gameState.currentTurnSeat !== seatIdx) return;

      const seat = room.seats[seatIdx];
      // 必须先打定缺牌检测
      if (rules.hasQueSuit(seat.handCards, seat.queSuit)) {
        const tile = seat.handCards.find(t => t.id === tileId);
        if (tile && tile.suit !== seat.queSuit) {
          if (typeof callback === 'function') callback({ success: false, message: '定缺牌未打完，必须先出定缺牌！' });
          return;
        }
      }

      if (typeof callback === 'function') callback({ success: true });
      executeDiscard(room, seatIdx, tileId);
    });

    // 玩家对提示回应 (碰、杠、胡、过)
    socket.on('respond_prompt', (action) => {
      const room = rooms.get(currentRoomCode);
      if (!room || !room.gameState.pendingPrompts) return;
      const seatIdx = room.seats.findIndex(s => s && s.id === currentPlayerId);
      if (seatIdx === -1) return;

      handlePromptResponse(room, seatIdx, action);
    });

    // 自摸胡牌
    socket.on('action_zimo', () => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.gameState.phase !== 'PLAYING') return;
      const seatIdx = room.seats.findIndex(s => s && s.id === currentPlayerId);
      if (seatIdx === -1 || room.gameState.currentTurnSeat !== seatIdx) return;

      const seat = room.seats[seatIdx];
      if (rules.canHu(seat.handCards, seat.melds, seat.queSuit)) {
        executeHu(room, seatIdx, null, true);
      }
    });

    // 自摸暗杠或弯杠
    socket.on('action_my_gang', (gangOption) => {
      const room = rooms.get(currentRoomCode);
      if (!room || room.gameState.phase !== 'PLAYING') return;
      const seatIdx = room.seats.findIndex(s => s && s.id === currentPlayerId);
      if (seatIdx === -1 || room.gameState.currentTurnSeat !== seatIdx) return;

      executeMyGang(room, seatIdx, gangOption);
    });

    // 再来一局
    socket.on('play_again', () => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      room.gameState.phase = 'LOBBY';
      room.seats.forEach(s => {
        if (s) s.isReady = s.isAi ? true : false;
      });
      broadcastRoom(room);
    });

    // 退出房间
    socket.on('leave_room', () => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const seatIdx = room.seats.findIndex(s => s && s.id === currentPlayerId);
      if (seatIdx !== -1) {
        room.seats[seatIdx] = null;
        if (room.hostId === currentPlayerId) {
          const nextHost = room.seats.find(s => s && !s.isAi);
          if (nextHost) room.hostId = nextHost.id;
        }
      }

      const activeHumans = room.seats.filter(s => s && !s.isAi);
      if (activeHumans.length === 0) {
        clearAllRoomTimers(room);
        rooms.delete(room.code);
      } else {
        broadcastRoom(room);
      }
    });

    socket.on('disconnect', () => {
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const seat = room.seats.find(s => s && s.id === currentPlayerId);
      if (seat) {
        seat.isOnline = false;
        broadcastRoom(room);
      }
    });
  });
}

module.exports = { setupMahjong };
