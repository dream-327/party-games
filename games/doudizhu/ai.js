// Dou Dizhu Smart AI (欢乐斗地主 高智商 AI 决策大脑)

const { CARD_TYPES, sortCards, getRankCounts, findBeatingHands } = require('./rules');

/**
 * 评估手牌强度分数
 */
function evaluateHandScore(cards) {
  if (!cards || cards.length === 0) return 0;
  let score = 0;

  const counts = new Map();
  for (const c of cards) {
    counts.set(c.value, (counts.get(c.value) || 0) + 1);
  }

  // 王炸
  if (counts.has(16) && counts.has(17)) {
    score += 8;
  } else {
    if (counts.has(17)) score += 4; // 大王
    if (counts.has(16)) score += 3; // 小王
  }

  // 2 的数量 (每个2值 3分)
  const twos = counts.get(15) || 0;
  score += twos * 3;

  // 炸弹 (每个炸弹 5.5分)
  for (const [val, count] of counts.entries()) {
    if (count === 4) score += 5.5;
    else if (count === 3 && val >= 11) score += 2;   // J/Q/K/A 三张
    else if (count === 2 && val >= 13) score += 1.2; // K/A 对子
  }

  return score;
}

/**
 * AI 叫牌 / 抢地主决策
 * @param {Array} cards AI当前手牌 (17张)
 * @param {string} currentPhase 'BID' 叫地主阶段 或 'ROB' 抢地主阶段
 * @returns {boolean} true: 叫/抢, false: 不叫/不抢
 */
function decideBid(cards, currentPhase = 'BID') {
  const score = evaluateHandScore(cards);
  if (currentPhase === 'BID') {
    return score >= 6.5;
  } else {
    return score >= 8.5;
  }
}

/**
 * AI 出牌决策
 * @param {Array} myHand AI当前手牌
 * @param {Object|null} tableHand 桌面当前要压的牌型对象（若无人出牌则为 null）
 * @param {string} myRole 'LANDLORD' 或者是 'FARMER'
 * @param {string|null} tableRole 桌面上牌是谁出的 ('LANDLORD' 或者是 'FARMER')
 * @param {number} landlordRemainingCards 地主剩余手牌数
 * @param {number} teammateRemainingCards 盟友剩余手牌数
 * @returns {Array|null} 返回出的卡牌数组，若不出/过牌则返回 null
 */
function decidePlay(myHand, tableHand, myRole, tableRole, landlordRemainingCards = 17, teammateRemainingCards = 17) {
  const candidates = findBeatingHands(myHand, tableHand);
  if (!candidates || candidates.length === 0) {
    return null; // 无牌可压，必须不出
  }

  const isFarmer = (myRole === 'FARMER');
  const isTeammate = (isFarmer && tableRole === 'FARMER');

  // 1. 主动出牌轮 (桌面无牌)
  if (!tableHand || tableHand.type === CARD_TYPES.INVALID) {
    // 过滤出非炸弹手牌
    const nonBombs = candidates.filter(c => {
      const isBomb = c.length === 4 && c.every(x => x.value === c[0].value);
      const isRocket = c.length === 2 && c.some(x => x.value === 16) && c.some(x => x.value === 17);
      return !isBomb && !isRocket;
    });

    // 特殊战术 1: 农民队友只剩 1 张牌 -> 积极喂单张（出最小单张）
    if (isFarmer && teammateRemainingCards === 1) {
      const singleCandidates = (nonBombs.length > 0 ? nonBombs : candidates).filter(c => c.length === 1);
      if (singleCandidates.length > 0) {
        return singleCandidates[0]; // 最小单牌送队友走
      }
    }

    // 特殊战术 2: 农民队友只剩 2 张牌 -> 积极喂对子（出最小对子）
    if (isFarmer && teammateRemainingCards === 2) {
      const pairCandidates = (nonBombs.length > 0 ? nonBombs : candidates).filter(c => c.length === 2 && c[0].value === c[1].value);
      if (pairCandidates.length > 0) {
        return pairCandidates[0]; // 最小对子送队友走
      }
    }

    // 特殊战术 3: 地主只剩 1 张牌 -> 农民严禁出小单张！优先出顺子、连对、对子，实在只有单张则出最大单张封顶！
    if (isFarmer && landlordRemainingCards === 1) {
      const multiCards = (nonBombs.length > 0 ? nonBombs : candidates).filter(c => c.length > 1);
      if (multiCards.length > 0) {
        return multiCards[0];
      }
      // 只有单牌，出最大单牌封堵
      const singles = candidates.filter(c => c.length === 1);
      if (singles.length > 0) {
        return singles[singles.length - 1];
      }
    }

    // 特殊战术 4: 地主只剩 2 张牌 -> 农民严禁出小对子！
    if (isFarmer && landlordRemainingCards === 2) {
      const nonPairs = (nonBombs.length > 0 ? nonBombs : candidates).filter(c => !(c.length === 2 && c[0].value === c[1].value));
      if (nonPairs.length > 0) {
        return nonPairs[0];
      }
    }

    // 常规首选：优先出较长顺子、连对、三带，最后出单张
    return nonBombs.length > 0 ? nonBombs[0] : candidates[0];
  }

  // 2. 盟友（同为农民）出的牌
  if (isTeammate) {
    // 如果队友出的牌已经比较大 (>= 10) 或顺子/炸弹，直接过牌放行
    if (tableHand.value >= 10 || tableHand.type === CARD_TYPES.BOMB || tableHand.type === CARD_TYPES.ROCKET || tableHand.length >= 5) {
      return null;
    }

    // 如果队友只剩 1~2 张牌，全力放行
    if (teammateRemainingCards <= 2) {
      return null;
    }

    // 队友出小牌，尝试接一手适中牌，但绝不扔炸弹或拆大牌
    const safeCandidates = candidates.filter(c => {
      const isBomb = c.length === 4 && c.every(x => x.value === c[0].value);
      const isRocket = c.length === 2 && c.some(x => x.value === 16) && c.some(x => x.value === 17);
      return !isBomb && !isRocket && c.every(x => x.value <= 13);
    });
    return safeCandidates.length > 0 ? safeCandidates[0] : null;
  }

  // 3. 对手出的牌 (地主出牌，或者地主面对农民出牌)
  // 极端拦截：如果地主只剩 1~2 张牌，或者农民只剩 1~2 张牌（对手是农民），全力压制！
  const opponentIsDanger = (isFarmer && landlordRemainingCards <= 2) || (!isFarmer && (teammateRemainingCards <= 2 || landlordRemainingCards <= 2));
  if (opponentIsDanger) {
    return candidates[candidates.length - 1]; // 出能压的最大牌，包括炸弹
  }

  // 正常情况：优先使用普通较小的牌型压制，尽量省下炸弹
  const nonBombs = candidates.filter(c => {
    const isBomb = c.length === 4 && c.every(x => x.value === c[0].value);
    const isRocket = c.length === 2 && c.some(x => x.value === 16) && c.some(x => x.value === 17);
    return !isBomb && !isRocket;
  });

  if (nonBombs.length > 0) {
    return nonBombs[0]; // 出最小能压的牌
  }

  // 如果只有炸弹能压：
  // 只有在对手手牌较少 (<= 6张) 或者自己手牌较少 (<= 5张) 时才交炸弹
  if (landlordRemainingCards <= 6 || myHand.length <= 5) {
    return candidates[0];
  }

  return null; // 否则保留炸弹
}

module.exports = {
  evaluateHandScore,
  decideBid,
  decidePlay
};
