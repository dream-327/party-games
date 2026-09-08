// Dou Dizhu Smart AI (欢乐斗地主 AI 决策大脑)

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

  // 炸弹 (每个炸弹 5分)
  for (const [val, count] of counts.entries()) {
    if (count === 4) score += 5;
    else if (count === 3 && val >= 11) score += 1.5; // J/Q/K/A 三张
    else if (count === 2 && val >= 13) score += 1;   // K/A 对子
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
  // 叫地主门槛：手牌评分大于等于 6.5
  if (currentPhase === 'BID') {
    return score >= 6.5;
  } else {
    // 抢地主门槛更高：评分大于等于 8.5
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
 * @returns {Array|null} 返回出的卡牌数组，若不出/过牌则返回 null
 */
function decidePlay(myHand, tableHand, myRole, tableRole, landlordRemainingCards = 17) {
  const candidates = findBeatingHands(myHand, tableHand);
  if (!candidates || candidates.length === 0) {
    return null; // 无牌可压，必须不出
  }

  // 1. 主动出牌轮 (桌面无牌)
  if (!tableHand || tableHand.type === CARD_TYPES.INVALID) {
    // 优先选择非炸弹的顺子、连对、对子或最小单张
    const nonBombs = candidates.filter(c => c.length !== 4 && !(c.length === 2 && c.some(x => x.value === 17)));
    return nonBombs.length > 0 ? nonBombs[0] : candidates[0];
  }

  const isTeammate = (myRole === 'FARMER' && tableRole === 'FARMER');

  // 2. 盟友（同为农民）出的牌
  if (isTeammate) {
    // 如果盟友出的是大牌（比如大于等于K，或者顺子/炸弹），选择过牌保全手牌
    if (tableHand.value >= 13 || tableHand.type === CARD_TYPES.BOMB || tableHand.type === CARD_TYPES.ROCKET) {
      return null;
    }
    // 盟友出小牌，尝试接一手小牌，但绝不扔炸弹或拆王
    const safeCandidates = candidates.filter(c => {
      const isBomb = c.length === 4 && c.every(x => x.value === c[0].value);
      const isRocket = c.length === 2 && c.some(x => x.value === 16) && c.some(x => x.value === 17);
      return !isBomb && !isRocket && c.every(x => x.value < 15);
    });
    return safeCandidates.length > 0 ? safeCandidates[0] : null;
  }

  // 3. 对手出的牌 (地主出牌，或者地主面对农民出牌)
  // 如果地主只剩 1~2 张牌，必须全力拦截！
  if (myRole === 'FARMER' && landlordRemainingCards <= 2) {
    return candidates[candidates.length - 1];
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

  // 如果只有炸弹能压，且对手手牌已经较少 (<= 6张) 时才动用炸弹
  if (landlordRemainingCards <= 6 || myHand.length <= 4) {
    return candidates[0];
  }

  return null; // 否则暂时不出，保留炸弹
}

module.exports = {
  evaluateHandScore,
  decideBid,
  decidePlay
};
