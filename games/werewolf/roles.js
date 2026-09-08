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
  }
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

// 经典狼人杀预设卡牌配置 (6-12人)
function getClassicPreset(playerCount) {
  if (playerCount <= 6) {
    return ['WEREWOLF', 'WEREWOLF', 'SEER', 'WITCH', 'VILLAGER', 'VILLAGER'];
  } else if (playerCount <= 8) {
    return ['WEREWOLF', 'WEREWOLF', 'SEER', 'WITCH', 'HUNTER', 'VILLAGER', 'VILLAGER', 'VILLAGER'];
  } else if (playerCount <= 10) {
    return ['WEREWOLF', 'WEREWOLF', 'WEREWOLF', 'SEER', 'WITCH', 'HUNTER', 'GUARD', 'VILLAGER', 'VILLAGER', 'VILLAGER'];
  } else {
    return ['WEREWOLF', 'WEREWOLF', 'WEREWOLF', 'WEREWOLF', 'SEER', 'WITCH', 'HUNTER', 'GUARD', 'VILLAGER', 'VILLAGER', 'VILLAGER', 'VILLAGER'];
  }
}

module.exports = {
  TEAMS,
  ROLES,
  getOneNightPreset,
  getClassicPreset
};
