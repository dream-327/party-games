// 四川麻将客户端规则镜像 (用于本地快速听牌提示与理牌)
(function(exports) {
  const SUITS = {
    WAN: 'wan',
    TONG: 'tong',
    TIAO: 'tiao'
  };

  const SUIT_NAMES = {
    wan: '万',
    tong: '筒',
    tiao: '条'
  };

  function sortTiles(tiles) {
    const suitOrder = { [SUITS.WAN]: 1, [SUITS.TONG]: 2, [SUITS.TIAO]: 3 };
    return [...tiles].sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return a.rank - b.rank;
    });
  }

  function hasQueSuit(tiles, queSuit) {
    if (!queSuit) return false;
    return tiles.some(t => t.suit === queSuit);
  }

  function countSuits(tiles) {
    const counts = { [SUITS.WAN]: 0, [SUITS.TONG]: 0, [SUITS.TIAO]: 0 };
    for (const t of tiles) {
      if (counts[t.suit] !== undefined) counts[t.suit]++;
    }
    return counts;
  }

  function recommendQueSuit(tiles) {
    const counts = countSuits(tiles);
    let minSuit = SUITS.WAN;
    let minCount = counts[SUITS.WAN];

    for (const s of [SUITS.TONG, SUITS.TIAO]) {
      if (counts[s] < minCount) {
        minCount = counts[s];
        minSuit = s;
      }
    }
    return minSuit;
  }

  function tilesToCountMap(tiles) {
    const map = {
      [SUITS.WAN]: new Array(10).fill(0),
      [SUITS.TONG]: new Array(10).fill(0),
      [SUITS.TIAO]: new Array(10).fill(0)
    };
    for (const t of tiles) {
      if (map[t.suit] && t.rank >= 1 && t.rank <= 9) {
        map[t.suit][t.rank]++;
      }
    }
    return map;
  }

  function canMeldSuit(counts, totalTiles) {
    if (totalTiles === 0) return true;
    if (totalTiles % 3 !== 0) return false;

    const temp = [...counts];
    return backtrackMelds(temp);
  }

  function backtrackMelds(counts) {
    let idx = 1;
    while (idx <= 9 && counts[idx] === 0) idx++;
    if (idx > 9) return true;

    if (counts[idx] >= 3) {
      counts[idx] -= 3;
      if (backtrackMelds(counts)) return true;
      counts[idx] += 3;
    }

    if (idx <= 7 && counts[idx] >= 1 && counts[idx + 1] >= 1 && counts[idx + 2] >= 1) {
      counts[idx]--;
      counts[idx + 1]--;
      counts[idx + 2]--;
      if (backtrackMelds(counts)) return true;
      counts[idx]++;
      counts[idx + 1]++;
      counts[idx + 2]++;
    }

    return false;
  }

  function canMeldSuitWithPair(counts, totalTiles) {
    if (totalTiles < 2 || (totalTiles - 2) % 3 !== 0) return false;

    const temp = [...counts];
    for (let r = 1; r <= 9; r++) {
      if (temp[r] >= 2) {
        temp[r] -= 2;
        if (canMeldSuit(temp, totalTiles - 2)) {
          return true;
        }
        temp[r] += 2;
      }
    }
    return false;
  }

  function checkNormalHu(tiles, queSuit) {
    if (hasQueSuit(tiles, queSuit)) return false;
    const countMap = tilesToCountMap(tiles);
    const suitTotals = {
      [SUITS.WAN]: tiles.filter(t => t.suit === SUITS.WAN).length,
      [SUITS.TONG]: tiles.filter(t => t.suit === SUITS.TONG).length,
      [SUITS.TIAO]: tiles.filter(t => t.suit === SUITS.TIAO).length
    };

    const suits = [SUITS.WAN, SUITS.TONG, SUITS.TIAO];

    for (const pairSuit of suits) {
      if (suitTotals[pairSuit] % 3 !== 2) continue;

      const otherSuits = suits.filter(s => s !== pairSuit);
      if (suitTotals[otherSuits[0]] % 3 !== 0 || suitTotals[otherSuits[1]] % 3 !== 0) continue;

      if (!canMeldSuitWithPair(countMap[pairSuit], suitTotals[pairSuit])) continue;
      if (!canMeldSuit(countMap[otherSuits[0]], suitTotals[otherSuits[0]])) continue;
      if (!canMeldSuit(countMap[otherSuits[1]], suitTotals[otherSuits[1]])) continue;

      return true;
    }

    return false;
  }

  function checkSevenPairs(tiles, melds, queSuit) {
    if (melds && melds.length > 0) return false;
    if (tiles.length !== 14) return false;
    if (hasQueSuit(tiles, queSuit)) return false;

    const countMap = tilesToCountMap(tiles);
    let pairs = 0;

    for (const suit of [SUITS.WAN, SUITS.TONG, SUITS.TIAO]) {
      for (let r = 1; r <= 9; r++) {
        const c = countMap[suit][r];
        if (c === 2) pairs += 1;
        else if (c === 4) pairs += 2;
        else if (c !== 0) return false;
      }
    }

    return pairs === 7;
  }

  function canHu(handCards, melds = [], queSuit = null) {
    if (hasQueSuit(handCards, queSuit)) return false;
    if (checkSevenPairs(handCards, melds, queSuit)) return true;
    return checkNormalHu(handCards, queSuit);
  }

  function getTingInfo(handCards, melds = [], queSuit = null) {
    if (hasQueSuit(handCards, queSuit)) {
      return { isTing: false, huTiles: [] };
    }

    const huTiles = [];
    const suits = [SUITS.WAN, SUITS.TONG, SUITS.TIAO].filter(s => s !== queSuit);

    for (const suit of suits) {
      for (let rank = 1; rank <= 9; rank++) {
        const testTile = { id: 9999, suit, rank, key: `${suit}_${rank}` };
        const simulatedHand = [...handCards, testTile];

        if (canHu(simulatedHand, melds, queSuit)) {
          huTiles.push({
            suit,
            rank,
            key: `${suit}_${rank}`
          });
        }
      }
    }

    return {
      isTing: huTiles.length > 0,
      huTiles
    };
  }

  function analyzeDiscardsForTing(handCards, melds = [], queSuit = null) {
    const queTiles = handCards.filter(t => t.suit === queSuit);
    if (queTiles.length > 0) {
      return {
        mustDiscardQue: true,
        queTiles
      };
    }

    const recommendations = [];
    const checkedKeys = new Set();

    for (let i = 0; i < handCards.length; i++) {
      const tileToDiscard = handCards[i];
      const key = `${tileToDiscard.suit}_${tileToDiscard.rank}`;
      if (checkedKeys.has(key)) continue;
      checkedKeys.add(key);

      const remainingHand = handCards.filter((_, idx) => idx !== i);
      const tingResult = getTingInfo(remainingHand, melds, queSuit);

      if (tingResult.isTing) {
        recommendations.push({
          discardTile: tileToDiscard,
          tingCount: tingResult.huTiles.length,
          huTiles: tingResult.huTiles
        });
      }
    }

    recommendations.sort((a, b) => b.tingCount - a.tingCount);

    return {
      mustDiscardQue: false,
      recommendations
    };
  }

  exports.SUITS = SUITS;
  exports.SUIT_NAMES = SUIT_NAMES;
  exports.sortTiles = sortTiles;
  exports.hasQueSuit = hasQueSuit;
  exports.recommendQueSuit = recommendQueSuit;
  exports.canHu = canHu;
  exports.getTingInfo = getTingInfo;
  exports.analyzeDiscardsForTing = analyzeDiscardsForTing;

})(typeof window !== 'undefined' ? (window.MahjongRules = {}) : module.exports);
