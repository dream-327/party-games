// 狼人杀角色定义与配置 (支持一夜终极狼人杀 & 经典狼人杀)

const TEAMS = {
  VILLAGER: 'VILLAGER',   // 村民/好人阵营
  WEREWOLF: 'WEREWOLF',   // 狼人阵营
  TANNER: 'TANNER'        // 制皮匠独立阵营 (仅一夜模式)
};

const ROLES = {
  // 1. 基础与一夜专属角色
  WEREWOLF: {
    id: 'WEREWOLF',
    name: '狼人',
    team: TEAMS.WEREWOLF,
    icon: '🐺',
    color: '#ef4444',
    order: 1, // 夜晚行动顺序
    desc: '夜晚睁眼确认狼同伴。若为独狼，可查看一张桌中底牌。经典模式下夜晚共同商议刀人。'
  },
  MINION: {
    id: 'MINION',
    name: '爪牙',
    team: TEAMS.WEREWOLF,
    icon: '🦹',
    color: '#f97316',
    order: 2,
    desc: '效忠于狼人阵营。夜晚得知谁是狼人，但狼人不知道爪牙是谁。'
  },
  SEER: {
    id: 'SEER',
    name: '预言家',
    team: TEAMS.VILLAGER,
    icon: '🔮',
    color: '#a855f7',
    order: 3,
    desc: '一夜模式可查验一名玩家或查看两张底牌；经典模式每晚查验一名玩家好坏身份。'
  },
  ROBBER: {
    id: 'ROBBER',
    name: '强盗',
    team: TEAMS.VILLAGER,
    icon: '🥷',
    color: '#eab308',
    order: 4,
    desc: '可选择与另一位玩家对调身份牌，并悄悄查看自己换来的新身份牌！'
  },
  TROUBLEMAKER: {
    id: 'TROUBLEMAKER',
    name: '捣蛋鬼',
    team: TEAMS.VILLAGER,
    icon: '🃏',
    color: '#ec4899',
    order: 5,
    desc: '可以暗中将另外两名玩家的身份牌互相调换（自己不能看牌）。'
  },
  DRUNK: {
    id: 'DRUNK',
    name: '醉鬼',
    team: TEAMS.VILLAGER,
    icon: '🍸',
    color: '#06b6d4',
    order: 6,
    desc: '喝醉了酒，必须盲目将自己的身份牌与桌中任意一张底牌对调（不能看牌）。'
  },
  INSOMNIAC: {
    id: 'INSOMNIAC',
    name: '失眠者',
    team: TEAMS.VILLAGER,
    icon: '👀',
    color: '#3b82f6',
    order: 7,
    desc: '夜晚最后醒来，可以查看自己目前的身份牌（确认自己是否被强盗或捣蛋鬼动过）。'
  },
  HUNTER: {
    id: 'HUNTER',
    name: '猎人',
    team: TEAMS.VILLAGER,
    icon: '🏹',
    color: '#84cc16',
    order: 8,
    desc: '当被投票处决或出局时，其指向的目标一同出局（被女巫毒死除外）。'
  },
  TANNER: {
    id: 'TANNER',
    name: '制皮匠',
    team: TEAMS.TANNER,
    icon: '🧟',
    color: '#8b5cf6',
    order: 9,
    desc: '一心求死！若白天投票处决了制皮匠，制皮匠单独获胜！'
  },
  VILLAGER: {
    id: 'VILLAGER',
    name: '村民',
    team: TEAMS.VILLAGER,
    icon: '🧑',
    color: '#10b981',
    order: 99,
    desc: '平民无夜间能力，依靠敏锐的逻辑分析在白天发言和投票驱逐恶狼。'
  },

  // 2. 经典模式角色补充
  WITCH: {
    id: 'WITCH',
    name: '女巫',
    team: TEAMS.VILLAGER,
    icon: '🧙‍♀️',
    color: '#14b8a6',
    order: 2,
    desc: '拥有一瓶解药（救人）和一瓶毒药（杀人），经典模式每晚可使用其一。'
  },
  GUARD: {
    id: 'GUARD',
    name: '守卫',
    team: TEAMS.VILLAGER,
    icon: '🛡️',
    color: '#3b82f6',
    order: 1,
    desc: '经典模式每晚可以守护一名玩家免遭狼刀，不能连续两晚守护同一人。'
  },
  WHITE_WOLF: {
    id: 'WHITE_WOLF',
    name: '白狼王',
    team: TEAMS.WEREWOLF,
    icon: '🐺👑',
    color: '#dc2626',
    order: 1,
    canExplodeWithKill: true,
    desc: '狼人阵营。白天自由发言阶段可选择自爆并带走场上一名存活玩家，两人同时出局并直接强制入夜。'
  },
  WOLF_KING: {
    id: 'WOLF_KING',
    name: '狼王',
    team: TEAMS.WEREWOLF,
    icon: '🐺🔫',
    color: '#b91c1c',
    order: 1,
    canShootOnDeath: true,
    desc: '狼人阵营。出局时可发动技能开枪带走一名存活玩家；但若被女巫毒杀则被闷死不可开枪。自爆时不具备带人能力。'
  },
  IDIOT: {
    id: 'IDIOT',
    name: '白痴',
    team: TEAMS.VILLAGER,
    icon: '🤡',
    color: '#8b5cf6',
    order: 99,
    canImmuneExile: true,
    desc: '好人神职。白天被投票处决时翻牌免死，保留发言权但永久失去投票权。夜间吃刀正常死亡。'
  }
};

// 预设板子定义 (经典线下常用板子)
const BOARD_PRESETS = {
  '6_SIMPLE': ['WEREWOLF', 'WEREWOLF', 'SEER', 'WITCH', 'VILLAGER', 'VILLAGER'],
  '9_STANDARD': ['WEREWOLF', 'WEREWOLF', 'WEREWOLF', 'SEER', 'WITCH', 'HUNTER', 'VILLAGER', 'VILLAGER', 'VILLAGER'],
  '10_STANDARD': ['WEREWOLF', 'WEREWOLF', 'WEREWOLF', 'SEER', 'WITCH', 'HUNTER', 'GUARD', 'VILLAGER', 'VILLAGER', 'VILLAGER'],
  '12_STANDARD': ['WEREWOLF', 'WEREWOLF', 'WEREWOLF', 'WHITE_WOLF', 'SEER', 'WITCH', 'HUNTER', 'IDIOT', 'VILLAGER', 'VILLAGER', 'VILLAGER', 'VILLAGER'],
  '12_GUARD': ['WEREWOLF', 'WEREWOLF', 'WEREWOLF', 'WOLF_KING', 'SEER', 'WITCH', 'HUNTER', 'GUARD', 'VILLAGER', 'VILLAGER', 'VILLAGER', 'VILLAGER']
};

// 一夜终极狼人杀默认推荐卡牌配置 (根据人数计算: 人数 + 3张底牌)
function getOneNightPreset(playerCount) {
  // 基础必配: 2狼人, 1预言家, 1强盗, 1捣蛋鬼
  const base = ['WEREWOLF', 'WEREWOLF', 'SEER', 'ROBBER', 'TROUBLEMAKER'];
  const pool = ['DRUNK', 'INSOMNIAC', 'TANNER', 'HUNTER', 'MINION', 'VILLAGER', 'VILLAGER'];

  const totalCardsNeeded = playerCount + 3;
  const result = [...base];

  for (let i = 0; result.length < totalCardsNeeded && i < pool.length; i++) {
    result.push(pool[i]);
  }

  while (result.length < totalCardsNeeded) {
    result.push('VILLAGER');
  }

  return result;
}

// 经典狼人杀预设卡牌配置 (6-12人兼容)
function getClassicPreset(playerCount) {
  if (playerCount <= 6) {
    return [...BOARD_PRESETS['6_SIMPLE']];
  } else if (playerCount <= 9) {
    return [...BOARD_PRESETS['9_STANDARD']];
  } else if (playerCount <= 10) {
    return [...BOARD_PRESETS['10_STANDARD']];
  } else {
    return [...BOARD_PRESETS['12_STANDARD']];
  }
}

/**
 * 校验板子配置合法性（防呆校验）
 */
function validateBoardSettings(settings, playerCount) {
  if (!settings) {
    return { valid: false, error: '缺少房间设置' };
  }
  const mode = settings.mode || 'CLASSIC';

  if (mode === 'ONE_NIGHT') {
    const needed = playerCount + 3;
    return { valid: true, totalCards: needed, roleList: getOneNightPreset(playerCount) };
  }

  // 经典多夜模式 - 自定义角色配置
  if (settings.customRoles && typeof settings.customRoles === 'object' && Object.keys(settings.customRoles).length > 0) {
    let roleList = [];
    let wolvesCount = 0;
    let villagersCount = 0;
    let godsCount = 0;

    for (const [roleId, count] of Object.entries(settings.customRoles)) {
      const num = parseInt(count, 10) || 0;
      const roleDef = ROLES[roleId];
      if (!roleDef) continue;
      for (let i = 0; i < num; i++) {
        roleList.push(roleId);
        if (roleDef.team === TEAMS.WEREWOLF) {
          wolvesCount++;
        } else if (roleId === 'VILLAGER') {
          villagersCount++;
        } else if (roleDef.team === TEAMS.VILLAGER) {
          godsCount++;
        }
      }
    }

    if (roleList.length !== playerCount) {
      return {
        valid: false,
        error: `配置卡牌总数 (${roleList.length}张) 必须严格等于参战玩家人数 (${playerCount}人)！`,
        totalCards: roleList.length
      };
    }

    if (wolvesCount >= Math.ceil(playerCount / 2)) {
      return {
        valid: false,
        error: `狼人阵营总人数 (${wolvesCount}人) 必须小于总人数的一半！`,
        totalCards: roleList.length
      };
    }

    if (villagersCount < 1) {
      return {
        valid: false,
        error: '好人阵营必须至少包含 1 名普通村民！',
        totalCards: roleList.length
      };
    }

    if (godsCount < 1) {
      return {
        valid: false,
        error: '好人阵营必须至少包含 1 名神职角色！',
        totalCards: roleList.length
      };
    }

    return { valid: true, totalCards: roleList.length, roleList };
  }

  // 预设板子
  const presetKey = settings.boardPreset || (
    playerCount <= 6 ? '6_SIMPLE' :
    playerCount <= 9 ? '9_STANDARD' :
    playerCount <= 10 ? '10_STANDARD' : '12_STANDARD'
  );

  const presetList = BOARD_PRESETS[presetKey];
  if (!presetList) {
    return { valid: false, error: `未知的板子预设: ${presetKey}` };
  }

  if (presetList.length !== playerCount) {
    return {
      valid: false,
      error: `当前板子需要 ${presetList.length} 名玩家，当前房间有 ${playerCount} 名参战玩家！`,
      totalCards: presetList.length
    };
  }

  return { valid: true, totalCards: presetList.length, roleList: [...presetList] };
}

/**
 * 依据设置与人数获取安全卡牌池
 */
function getRolePoolFromSettings(settings, playerCount) {
  const check = validateBoardSettings(settings, playerCount);
  if (check.valid && check.roleList) {
    return [...check.roleList];
  }
  return getClassicPreset(playerCount);
}

module.exports = {
  TEAMS,
  ROLES,
  BOARD_PRESETS,
  getOneNightPreset,
  getClassicPreset,
  validateBoardSettings,
  getRolePoolFromSettings
};
