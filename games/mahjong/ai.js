// 四川麻将智能 AI 陪练算法引擎
// 具备定缺推荐、智能理牌、换三张、出牌决策与碰杠胡反应树

const rules = require('./rules');

class MahjongAI {
  // 1. 定缺决策
  static decideQue(handCards) {
    return rules.recommendQueSuit(handCards);
  }

  // 2. 换三张决策 (挑选同一门花色中连贯性最差的 3 张牌送出)
  static decideSwapThree(handCards) {
    const suits = [rules.SUITS.WAN, rules.SUITS.TONG, rules.SUITS.TIAO];
    let candidateSuit = null;
    let minCohesion = Infinity;
    let selectedTiles = [];

    for (const s of suits) {
      const suitTiles = handCards.filter(t => t.suit === s);
      if (suitTiles.length >= 3) {
        // 优先选择牌数少（但>=3张）的花色送掉，便于做清一色或定缺
        if (suitTiles.length < minCohesion) {
          minCohesion = suitTiles.length;
          candidateSuit = s;
        }
      }
    }

    if (!candidateSuit) {
      // 容错：任意找一个有 3 张的门类
      for (const s of suits) {
        const suitTiles = handCards.filter(t => t.suit === s);
        if (suitTiles.length >= 3) {
          candidateSuit = s;
          break;
        }
      }
    }

    const available = handCards.filter(t => t.suit === candidateSuit);
    // 排序后挑选边缘牌送出 (例如 1, 9 或不成对的孤张)
    available.sort((a, b) => a.rank - b.rank);
    selectedTiles = available.slice(0, 3);
    return selectedTiles;
  }

  // 3. 出牌决策 (打哪张牌最优)
  static decideDiscard(handCards, melds = [], queSuit = null) {
    // 规则强制第一优先级：有定缺牌必须先打定缺牌！
    const queTiles = handCards.filter(t => t.suit === queSuit);
    if (queTiles.length > 0) {
      // 优先打 1、9 孤张，其次打 2、8，再打中张
      queTiles.sort((a, b) => {
        const scoreA = Math.abs(a.rank - 5);
        const scoreB = Math.abs(b.rank - 5);
        return scoreB - scoreA;
      });
      return queTiles[0];
    }

    // 智能听牌推荐：如果有打某张牌能进听，优先选进听张数最多的
    const analysis = rules.analyzeDiscardsForTing(handCards, melds, queSuit);
    if (analysis.recommendations && analysis.recommendations.length > 0) {
      return analysis.recommendations[0].discardTile;
    }

    // 常规弃牌评分：计算手牌各张牌的孤张与危险度评分 (打出价值最小的孤张)
    let worstTile = handCards[0];
    let minScore = Infinity;

    for (const tile of handCards) {
      let score = 0;
      // 同点数重复牌加分 (对子、刻子保留)
      const sameRankCount = handCards.filter(t => t.suit === tile.suit && t.rank === tile.rank).length;
      if (sameRankCount === 2) score += 30;
      if (sameRankCount >= 3) score += 60;

      // 相邻连牌加分 (顺子搭子)
      const hasMinus1 = handCards.some(t => t.suit === tile.suit && t.rank === tile.rank - 1);
      const hasPlus1 = handCards.some(t => t.suit === tile.suit && t.rank === tile.rank + 1);
      const hasMinus2 = handCards.some(t => t.suit === tile.suit && t.rank === tile.rank - 2);
      const hasPlus2 = handCards.some(t => t.suit === tile.suit && t.rank === tile.rank + 2);

      if (hasMinus1 && hasPlus1) score += 40; // 两头顺
      else if (hasMinus1 || hasPlus1) score += 20; // 连牌搭子
      else if (hasMinus2 || hasPlus2) score += 10; // 嵌张搭子

      // 中张价值更高
      if (tile.rank >= 3 && tile.rank <= 7) score += 5;

      if (score < minScore) {
        minScore = score;
        worstTile = tile;
      }
    }

    return worstTile;
  }

  // 4. 面对别人出牌时的决策 (碰 / 杠 / 胡 / 过)
  static decideResponse({ handCards, melds = [], queSuit = null, discardTile, canHu, canGang, canPeng }) {
    // 毫不犹豫胡牌！
    if (canHu) {
      return { action: 'hu' };
    }

    // 杠牌 (刮风即收钱，AI 大概率杠)
    if (canGang && discardTile.suit !== queSuit) {
      return { action: 'gang' };
    }

    // 碰牌决策 (如果手牌顺子丰富且非对对胡可能不碰；这里让 AI 积极碰牌增加互动性)
    if (canPeng && discardTile.suit !== queSuit) {
      // 如果碰了不会破坏定缺且能加快胡牌
      const remainingQue = handCards.filter(t => t.suit === queSuit).length;
      if (remainingQue === 0) {
        return { action: 'peng' };
      }
    }

    return { action: 'pass' };
  }
}

module.exports = MahjongAI;
