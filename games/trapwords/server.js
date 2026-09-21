// 害你在心口难开 - 服务端核心业务逻辑
const {
  categories,
  getWordListByType,
  getRandomWord,
  getRandomPunishment
} = require('./words');

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
  PLAYING: 'PLAYING'
};

const AI_NAMES = ['整蛊大王', '戏精本精', '套路大师', '八卦小分队', '喝水达人', '聊天终结者'];
const AI_AVATARS = ['🎭', '🤡', '🦊', '🦉', '🐱', '🤖'];

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

  const isHostMissingOrAi = !currentHost || currentHost.isAi;
  const now = Date.now();
  const isHostOfflineTimedOut = currentHost && !currentHost.isOnline && (
    (now - (currentHost.lastOfflineTime || now)) >= HOST_DISCONNECT_GRACE_PERIOD_MS
  );

  if (isHostMissingOrAi || isHostOfflineTimedOut) {
    const candidate = Array.from(room.players.values()).find(p => p.isOnline && !p.isAi)
      || Array.from(room.players.values()).find(p => p.isOnline)
      || Array.from(room.players.values()).find(p => !p.isAi)
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
 * 信息不对称安全脱敏处理：
 * 每个人看得到场上其他所有人的禁忌词，唯独对自己隐藏！
 * 当且仅当中招事件发生时，当事人可以看到自己刚才触发的禁忌词。
 */
function getSafeRoomData(room, targetPlayerId) {
  ensureRoomHost(room);
  const isPlaying = room.gameState.phase === PHASES.PLAYING;

  const playersList = Array.from(room.players.values()).map(p => {
    const isMe = (p.id === targetPlayerId);
    let safeWord = null;

    if (isPlaying && p.currentWord) {
      if (isMe) {
        // 对自己严格保密（防止开发者工具直接看包）
        safeWord = { masked: true };
      } else {
        // 对别人完全公开透明
        safeWord = {
          text: p.currentWord.text,
          type: p.currentWord.type
        };
      }
    }

    let safeAssigned = null;
    if (p.assignedWord) {
      if (isMe) {
        // 对当事人自己保密好友为其指定的词，防止提前偷看剧透
        safeAssigned = { masked: true, assignedByName: p.assignedByName };
      } else {
        // 对其他所有人公开展示内容和指定人
        safeAssigned = {
          text: p.assignedWord,
          assignedBy: p.assignedBy,
          assignedByName: p.assignedByName
        };
      }
    }

    // 正在输入指示（防重复抢坑）
    let activeTyper = null;
    if (room.typingUsers && room.typingUsers.has(p.id)) {
      const t = room.typingUsers.get(p.id);
      if (Date.now() - t.time < 8000) {
        activeTyper = (t.typerId === targetPlayerId) ? null : t.typerName;
      }
    }

    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.isHost,
      isOnline: p.isOnline,
      isAi: p.isAi,
      word: safeWord,
      assignedWord: safeAssigned,
      activeTyper,
      caughtCount: p.caughtCount || 0
    };
  });

  return {
    code: room.code,
    hostId: room.hostId,
    settings: {
      category: room.settings.category,
      customWords: room.settings.customWords
    },
    gameState: {
      phase: room.gameState.phase,
      round: room.gameState.round,
      caughtEvent: room.gameState.caughtEvent || null
    },
    players: playersList,
    categories
  };
}

function broadcastRoom(trapIo, room) {
  if (!room) return;
  room.lastActiveTime = Date.now();
  ensureRoomHost(room);

  room.players.forEach(p => {
    if (p.socketId) {
      trapIo.to(p.socketId).emit('room_update', getSafeRoomData(room, p.id));
    }
  });
}

function setupTrapwords(io, app) {
  const trapIo = io.of('/trapwords');

  trapIo.on('connection', (socket) => {
    let currentRoomCode = null;
    let currentPlayerId = null;

    // 创建房间
    socket.on('create_room', (data, callback) => {
      try {
        if (currentRoomCode && rooms.has(currentRoomCode)) {
          const oldRoom = rooms.get(currentRoomCode);
          if (oldRoom && currentPlayerId) {
            oldRoom.players.delete(currentPlayerId);
            socket.leave(currentRoomCode);
            ensureRoomHost(oldRoom);
            if (Array.from(oldRoom.players.values()).filter(p => !p.isAi && p.isOnline).length === 0) {
              rooms.delete(currentRoomCode);
            } else {
              broadcastRoom(trapIo, oldRoom);
            }
          }
        }

        const pData = (data && data.player) ? data.player : (data || {});
        const sData = (data && data.settings) ? data.settings : {};
        const code = generateRoomCode();
        const randomSuffix = Math.floor(100 + Math.random() * 900);
        const rawName = (pData && pData.name ? String(pData.name) : '').trim();
        const safeName = escapeHtml(rawName ? rawName.substring(0, 10) : `玩家${randomSuffix}`);

        const player = {
          id: pData.id || `p_${Date.now()}`,
          socketId: socket.id,
          name: safeName,
          avatar: escapeHtml(String(pData.avatar || '🤠').trim().substring(0, 4)),
          isHost: true,
          isOnline: true,
          isAi: false,
          assignedWord: null,
          assignedBy: null,
          assignedByName: null,
          currentWord: null,
          caughtCount: 0
        };

        const room = {
          code,
          hostId: player.id,
          createdAt: Date.now(),
          lastActiveTime: Date.now(),
          usedTexts: new Set(),
          typingUsers: new Map(),
          settings: {
            category: sData.category || 'all',
            customWords: Array.isArray(sData.customWords) ? sData.customWords.slice(0, 50) : []
          },
          players: new Map([[player.id, player]]),
          gameState: {
            phase: PHASES.LOBBY,
            round: 1,
            caughtEvent: null
          }
        };

        rooms.set(code, room);
        currentRoomCode = code;
        currentPlayerId = player.id;
        socket.join(code);

        if (typeof callback === 'function') {
          callback({
            success: true,
            roomCode: code,
            roomData: getSafeRoomData(room, player.id)
          });
        }
        broadcastRoom(trapIo, room);
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

        if (currentRoomCode && currentRoomCode !== roomCode && rooms.has(currentRoomCode)) {
          const oldRoom = rooms.get(currentRoomCode);
          if (oldRoom && currentPlayerId) {
            oldRoom.players.delete(currentPlayerId);
            socket.leave(currentRoomCode);
            ensureRoomHost(oldRoom);
            if (Array.from(oldRoom.players.values()).filter(p => !p.isAi && p.isOnline).length === 0) {
              rooms.delete(currentRoomCode);
            } else {
              broadcastRoom(trapIo, oldRoom);
            }
          }
        }

        currentRoomCode = roomCode;
        currentPlayerId = pid;
        socket.join(roomCode);

        if (room.players.has(pid)) {
          const existing = room.players.get(pid);
          existing.socketId = socket.id;
          existing.isOnline = true;
          existing.lastOfflineTime = null;
          if (player.name) existing.name = escapeHtml(String(player.name).trim().substring(0, 10)) || existing.name;
          if (player.avatar) existing.avatar = escapeHtml(String(player.avatar).trim().substring(0, 4)) || existing.avatar;
        } else {
          if (room.players.size >= 16) {
            if (typeof callback === 'function') callback({ success: false, message: '房间人数已满（最多16人）' });
            return;
          }

          const randomSuffix = Math.floor(100 + Math.random() * 900);
          const rawJoinName = (player && player.name ? String(player.name) : '').trim();
          const safeJoinName = escapeHtml(rawJoinName ? rawJoinName.substring(0, 10) : `玩家${randomSuffix}`);

          let initialWord = null;
          // 如果游戏正在进行中，中途加入的玩家自动随机分配一张禁忌词
          if (room.gameState.phase === PHASES.PLAYING) {
            initialWord = getRandomWord(room.settings.category, room.settings.customWords, room.usedTexts);
            room.usedTexts.add(initialWord.text);
          }

          room.players.set(pid, {
            id: pid,
            socketId: socket.id,
            name: safeJoinName,
            avatar: escapeHtml(String(player.avatar || '😎').trim().substring(0, 4)),
            isHost: false,
            isOnline: true,
            isAi: false,
            assignedWord: null,
            assignedBy: null,
            assignedByName: null,
            currentWord: initialWord,
            caughtCount: 0
          });
        }

        ensureRoomHost(room);
        if (typeof callback === 'function') {
          callback({
            success: true,
            roomCode,
            roomData: getSafeRoomData(room, pid)
          });
        }
        broadcastRoom(trapIo, room);
      } catch (err) {
        console.error('join_room error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '加入房间失败' });
      }
    });

    // 添加电脑测试玩家 (电脑端测试核心利器)
    socket.on('add_ai', (data, callback) => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;
        if (room.players.size >= 16) {
          if (typeof callback === 'function') callback({ success: false, message: '房间人数已达上限' });
          return;
        }

        const aiCount = Array.from(room.players.values()).filter(p => p.isAi).length;
        const nameIdx = aiCount % AI_NAMES.length;
        const aiId = `ai_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        let aiWord = null;
        if (room.gameState.phase === PHASES.PLAYING) {
          aiWord = getRandomWord(room.settings.category, room.settings.customWords, room.usedTexts);
          room.usedTexts.add(aiWord.text);
        }

        room.players.set(aiId, {
          id: aiId,
          socketId: null,
          name: AI_NAMES[nameIdx] || `电脑${aiCount + 1}`,
          avatar: AI_AVATARS[nameIdx] || '🤖',
          isHost: false,
          isOnline: true,
          isAi: true,
          assignedWord: null,
          assignedBy: null,
          assignedByName: null,
          currentWord: aiWord,
          caughtCount: 0
        });

        broadcastRoom(trapIo, room);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('add_ai error:', err);
      }
    });

    // 移除电脑测试玩家
    socket.on('remove_ai', (data, callback) => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;

        const aiPlayers = Array.from(room.players.values()).filter(p => p.isAi);
        if (aiPlayers.length > 0) {
          const lastAi = aiPlayers[aiPlayers.length - 1];
          room.players.delete(lastAi.id);
          broadcastRoom(trapIo, room);
          if (typeof callback === 'function') callback({ success: true });
        }
      } catch (err) {
        console.error('remove_ai error:', err);
      }
    });

    // 修改设置
    socket.on('update_settings', (newSettings, callback) => {
      try {
        if (!currentRoomCode || !newSettings) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.hostId !== currentPlayerId) return;

        if (newSettings.category && categories[newSettings.category]) {
          room.settings.category = newSettings.category;
        }
        if (Array.isArray(newSettings.customWords)) {
          room.settings.customWords = newSettings.customWords
            .map(w => escapeHtml(String(w || '').trim().substring(0, 30)))
            .filter(Boolean)
            .slice(0, 100);
        }

        broadcastRoom(trapIo, room);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('update_settings error:', err);
      }
    });

    // 添加自定义词 (支持单词或逗号/换行分隔的多词批量输入)
    socket.on('add_custom_word', ({ word }, callback) => {
      try {
        if (!currentRoomCode || !word) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;

        if (!room.settings.customWords) room.settings.customWords = [];

        // 支持逗号、分号、顿号、换行分隔的多词批量添加
        const rawItems = String(word).split(/[,，;；、\n\r]+/);
        let addedCount = 0;

        for (const item of rawItems) {
          const trimmed = item.trim();
          if (!trimmed) continue;
          const safe = escapeHtml(trimmed.substring(0, 30));
          if (!room.settings.customWords.includes(safe) && room.settings.customWords.length < 100) {
            room.settings.customWords.push(safe);
            addedCount++;
          }
        }

        broadcastRoom(trapIo, room);
        if (typeof callback === 'function') callback({ success: true, addedCount, customWords: room.settings.customWords });
      } catch (err) {
        console.error('add_custom_word error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '添加自定义词失败' });
      }
    });

    // 移除单个自定义词
    socket.on('remove_custom_word', ({ word, index }, callback) => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || !room.settings.customWords) return;

        if (typeof index === 'number' && index >= 0 && index < room.settings.customWords.length) {
          room.settings.customWords.splice(index, 1);
        } else if (word) {
          const idx = room.settings.customWords.indexOf(word);
          if (idx !== -1) {
            room.settings.customWords.splice(idx, 1);
          }
        }

        broadcastRoom(trapIo, room);
        if (typeof callback === 'function') callback({ success: true, customWords: room.settings.customWords });
      } catch (err) {
        console.error('remove_custom_word error:', err);
      }
    });

    // 清空自定义词
    socket.on('clear_custom_words', (data, callback) => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;

        room.settings.customWords = [];
        broadcastRoom(trapIo, room);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('clear_custom_words error:', err);
      }
    });

    // 为特定某位玩家指定专属禁忌词 (方案一：先到先得锁定抢坑制)
    socket.on('assign_player_word', ({ targetId, word }, callback) => {
      try {
        if (!currentRoomCode || !targetId) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;

        // 不允许给自己指定词（防剧透、作弊）
        if (targetId === currentPlayerId) {
          if (typeof callback === 'function') callback({ success: false, message: '不能给自己指定词哦，让朋友为你密谋吧！' });
          return;
        }

        const targetPlayer = room.players.get(targetId);
        if (!targetPlayer) {
          if (typeof callback === 'function') callback({ success: false, message: '目标玩家不存在' });
          return;
        }

        const caller = room.players.get(currentPlayerId);
        const isHost = (room.hostId === currentPlayerId);

        // 防重复指定：如果已被其他朋友抢先指定，非作者且非房主不可修改
        if (targetPlayer.assignedBy && targetPlayer.assignedBy !== currentPlayerId && !isHost) {
          if (typeof callback === 'function') {
            callback({
              success: false,
              message: `该玩家已被【${targetPlayer.assignedByName || '其他朋友'}】抢先指定啦，快去整蛊其他人吧！`
            });
          }
          return;
        }

        const trimmed = word ? String(word).trim().substring(0, 30) : '';

        // 如果传入空字符，表示清空/释放该玩家名额
        if (!trimmed) {
          targetPlayer.assignedWord = null;
          targetPlayer.assignedBy = null;
          targetPlayer.assignedByName = null;
        } else {
          // 字数防呆保护（至少2个字）
          if (trimmed.length < 2) {
            if (typeof callback === 'function') callback({ success: false, message: '专属禁忌词至少需要 2 个字哦！' });
            return;
          }
          targetPlayer.assignedWord = escapeHtml(trimmed);
          targetPlayer.assignedBy = currentPlayerId;
          targetPlayer.assignedByName = caller ? caller.name : '神秘损友';
        }

        // 清理 typingUsers 状态
        if (!room.typingUsers) room.typingUsers = new Map();
        room.typingUsers.delete(targetId);

        broadcastRoom(trapIo, room);
        if (typeof callback === 'function') callback({
          success: true,
          assignedWord: targetPlayer.assignedWord,
          assignedByName: targetPlayer.assignedByName
        });
      } catch (err) {
        console.error('assign_player_word error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '指定词失败' });
      }
    });

    // 正在输入指示广播 (协同输入防撞车)
    socket.on('typing_assign', ({ targetId, isTyping }) => {
      try {
        if (!currentRoomCode || !targetId) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;
        if (!room.typingUsers) room.typingUsers = new Map();

        if (isTyping) {
          const caller = room.players.get(currentPlayerId);
          if (caller) {
            room.typingUsers.set(targetId, {
              typerId: currentPlayerId,
              typerName: caller.name,
              time: Date.now()
            });
          }
        } else {
          const cur = room.typingUsers.get(targetId);
          if (cur && cur.typerId === currentPlayerId) {
            room.typingUsers.delete(targetId);
          }
        }
        broadcastRoom(trapIo, room);
      } catch (err) {
        console.error('typing_assign error:', err);
      }
    });

    // 开始游戏
    socket.on('start_game', (data, callback) => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.hostId !== currentPlayerId) return;

        const activePlayers = Array.from(room.players.values()).filter(p => p.isOnline);
        if (activePlayers.length < 2) {
          if (typeof callback === 'function') {
            callback({
              success: false,
              message: '至少需要 2 名玩家才能开始游戏（电脑端测试可点击右上角“添加电脑”进行双人测试）！'
            });
          }
          return;
        }

        // 纯自定义模式校验：未指定专属词的玩家需要从自定义池抽词，校验总词量
        if (room.settings.category === 'custom') {
          const unassignedCount = activePlayers.filter(p => !p.assignedWord).length;
          const customPoolCount = (room.settings.customWords || []).length;
          if (customPoolCount < unassignedCount) {
            if (typeof callback === 'function') {
              callback({
                success: false,
                message: `纯自定义模式下词汇不足！尚有 ${unassignedCount} 名玩家未指定专属词，但自定义公共池仅有 ${customPoolCount} 个词，请继续添加！`
              });
            }
            return;
          }
        }

        // 清空此前已抽取的词池，重新发牌
        room.usedTexts.clear();
        room.players.forEach(p => {
          let word = null;
          // 核心机制：只要该玩家被指定了专属词，100% 优先下发指定词！
          if (p.assignedWord) {
            word = { text: p.assignedWord, type: '好友指定' };
          } else {
            word = getRandomWord(room.settings.category, room.settings.customWords, room.usedTexts);
          }
          room.usedTexts.add(word.text);
          p.currentWord = word;
          p.caughtCount = 0;
        });

        room.gameState.phase = PHASES.PLAYING;
        room.gameState.round = 1;
        room.gameState.caughtEvent = null;

        broadcastRoom(trapIo, room);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('start_game error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '开始游戏失败' });
      }
    });

    // 触发抓包中招 (任何人皆可点击某人中招)
    socket.on('trigger_caught', ({ targetId }, callback) => {
      try {
        if (!currentRoomCode || !targetId) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.gameState.phase !== PHASES.PLAYING) return;

        const targetPlayer = room.players.get(targetId);
        if (!targetPlayer || !targetPlayer.currentWord) {
          if (typeof callback === 'function') callback({ success: false, message: '目标玩家不存在或无有效词卡' });
          return;
        }

        const caller = room.players.get(currentPlayerId) || { name: '某位热心朋友' };
        targetPlayer.caughtCount = (targetPlayer.caughtCount || 0) + 1;

        const punishment = getRandomPunishment();

        // 记录中招事件（全场广播揭晓，包含当事人自己可见其刚才的禁忌词）
        room.gameState.caughtEvent = {
          targetId: targetPlayer.id,
          targetName: targetPlayer.name,
          targetAvatar: targetPlayer.avatar,
          word: { ...targetPlayer.currentWord },
          punishment,
          caughtBy: currentPlayerId,
          caughtByName: caller.name,
          timestamp: Date.now()
        };

        // 全场广播高能中招事件与音效通知
        trapIo.to(room.code).emit('public_notice', {
          type: 'caught',
          targetName: targetPlayer.name,
          message: `🚨【${targetPlayer.name}】被【${caller.name}】抓包中招啦！`
        });

        broadcastRoom(trapIo, room);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('trigger_caught error:', err);
        if (typeof callback === 'function') callback({ success: false, message: '操作失败' });
      }
    });

    // 换个惩罚 (重新摇号整蛊)
    socket.on('reroll_punishment', (data, callback) => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || !room.gameState.caughtEvent) return;

        const oldPunishment = room.gameState.caughtEvent.punishment;
        const newPunishment = getRandomPunishment(oldPunishment);
        room.gameState.caughtEvent.punishment = newPunishment;

        trapIo.to(room.code).emit('punishment_rerolled', {
          targetName: room.gameState.caughtEvent.targetName,
          punishment: newPunishment
        });

        broadcastRoom(trapIo, room);
        if (typeof callback === 'function') callback({ success: true, punishment: newPunishment });
      } catch (err) {
        console.error('reroll_punishment error:', err);
      }
    });

    // 换新词，继续游戏 (该玩家重新抽词，关闭中招弹窗)
    socket.on('deal_new_word', (data, callback) => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;

        const targetId = (data && data.targetId) || (room.gameState.caughtEvent && room.gameState.caughtEvent.targetId);
        if (targetId && room.players.has(targetId)) {
          const targetPlayer = room.players.get(targetId);
          const newWord = getRandomWord(room.settings.category, room.settings.customWords, room.usedTexts);
          room.usedTexts.add(newWord.text);
          targetPlayer.currentWord = newWord;
        }

        // 清除中招弹窗，恢复全场自由监控看板
        room.gameState.caughtEvent = null;

        broadcastRoom(trapIo, room);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('deal_new_word error:', err);
      }
    });

    // 返回大厅重置
    socket.on('back_to_lobby', (data, callback) => {
      try {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.hostId !== currentPlayerId) return;

        room.gameState.phase = PHASES.LOBBY;
        room.gameState.caughtEvent = null;
        room.players.forEach(p => {
          p.currentWord = null;
          p.assignedWord = null;
          p.assignedBy = null;
          p.assignedByName = null;
          p.caughtCount = 0;
        });
        if (room.typingUsers) room.typingUsers.clear();

        broadcastRoom(trapIo, room);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('back_to_lobby error:', err);
      }
    });

    // 离开房间
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
              rooms.delete(currentRoomCode);
            } else {
              broadcastRoom(trapIo, room);
            }
          }
        }
        currentRoomCode = null;
        currentPlayerId = null;
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        console.error('leave_room error:', err);
      }
    });

    // 断开连接
    socket.on('disconnect', () => {
      try {
        if (currentRoomCode && currentPlayerId) {
          const room = rooms.get(currentRoomCode);
          if (room) {
            const p = room.players.get(currentPlayerId);
            if (p) {
              p.isOnline = false;
              p.lastOfflineTime = Date.now();

              // 房主断线移交保护
              if (room.hostId === p.id) {
                if (room.hostMigrateTimer) clearTimeout(room.hostMigrateTimer);
                room.hostMigrateTimer = setTimeout(() => {
                  if (room.players.has(p.id) && !p.isOnline && room.hostId === p.id) {
                    ensureRoomHost(room);
                    broadcastRoom(trapIo, room);
                  }
                }, HOST_DISCONNECT_GRACE_PERIOD_MS);
              }
            }
            ensureRoomHost(room);
            broadcastRoom(trapIo, room);
          }
        }
      } catch (err) {
        console.error('disconnect error:', err);
      }
    });
  });

  // 定时清理过期无活动房间（超过2小时）
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      if (now - (room.lastActiveTime || room.createdAt) > 2 * 60 * 60 * 1000) {
        rooms.delete(code);
      }
    }
  }, 15 * 60 * 1000).unref();
}

module.exports = {
  setupTrapwords,
  PHASES
};
