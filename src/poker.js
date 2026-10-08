export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';
export const CATEGORIES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];
const BASE = 15 ** 5;

export function parseCard(text) {
  const normalized = text.replace(/^10/, 'T');
  if (!/^[2-9TJQKA][shdc]$/i.test(normalized)) throw new Error(`无效牌：${text}`);
  return SUITS.indexOf(normalized[1].toLowerCase()) * 13 + RANKS.indexOf(normalized[0].toUpperCase());
}
export function formatCard(card) {
  return RANKS[card % 13] + SUITS[Math.floor(card / 13)];
}
function score(category, ranks) {
  let value = category;
  for (let i = 0; i < 5; i++) value = value * 15 + (ranks[i] || 0);
  return value;
}
function straightHigh(mask) {
  for (let high = 14; high >= 6; high--) {
    const run = 31 << (high - 6);
    if ((mask & run) === run) return high;
  }
  return (mask & 4111) === 4111 ? 5 : 0;
}
// Rank counts and suit masks evaluate the best five cards directly, including the ace-low straight.
export function evaluate(cards) {
  if (cards.length < 5 || cards.length > 7) throw new Error('牌型评估需要 5–7 张牌');
  const counts = new Uint8Array(15);
  const suits = new Uint8Array(4);
  const masks = new Uint16Array(4);
  let mask = 0;
  for (const card of cards) {
    const rank = card % 13 + 2, suit = Math.floor(card / 13);
    counts[rank]++; suits[suit]++; masks[suit] |= 1 << (rank - 2); mask |= 1 << (rank - 2);
  }
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suits[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const high = straightHigh(masks[flushSuit]);
    if (high) return score(8, [high]);
  }
  const quads = [], trips = [], pairs = [], ranks = [];
  for (let rank = 14; rank >= 2; rank--) {
    if (counts[rank]) ranks.push(rank);
    if (counts[rank] === 4) quads.push(rank);
    if (counts[rank] === 3) trips.push(rank);
    if (counts[rank] === 2) pairs.push(rank);
  }
  if (quads.length) return score(7, [quads[0], ...ranks.filter(r => r !== quads[0]).slice(0, 1)]);
  if (trips.length && (pairs.length || trips.length > 1)) {
    return score(6, [trips[0], Math.max(pairs[0] || 0, trips[1] || 0)]);
  }
  if (flushSuit >= 0) {
    const flush = [];
    for (let r = 14; r >= 2; r--) if (masks[flushSuit] & (1 << (r - 2))) flush.push(r);
    return score(5, flush.slice(0, 5));
  }
  const straight = straightHigh(mask);
  if (straight) return score(4, [straight]);
  if (trips.length) return score(3, [trips[0], ...ranks.filter(r => r !== trips[0]).slice(0, 2)]);
  if (pairs.length >= 2) return score(2, [pairs[0], pairs[1], ...ranks.filter(r => r !== pairs[0] && r !== pairs[1]).slice(0, 1)]);
  if (pairs.length) return score(1, [pairs[0], ...ranks.filter(r => r !== pairs[0]).slice(0, 3)]);
  return score(0, ranks.slice(0, 5));
}
export function categoryOf(value) { return Math.floor(value / BASE); }

export function validate(config) {
  const { hero, board, opponents, iterations } = config;
  if (!Array.isArray(hero) || hero.length !== 2) throw new Error('请选择完整的两张手牌');
  if (!Array.isArray(board) || ![0, 3, 4, 5].includes(board.length)) throw new Error('公共牌必须为 0、3、4 或 5 张');
  if (!Array.isArray(opponents) || opponents.length < 1 || opponents.length > 8) throw new Error('对手人数必须为 1–8 人');
  if (opponents.some(h => !Array.isArray(h) || ![0, 2].includes(h.length))) throw new Error('对手手牌需要两张，或留空表示随机');
  const known = [...hero, ...board, ...opponents.flat()];
  if (known.some(c => !Number.isInteger(c) || c < 0 || c > 51)) throw new Error('存在无效牌');
  if (new Set(known).size !== known.length) throw new Error('同一张牌不能重复出现');
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 1000000) throw new Error('模拟次数必须在 1,000–1,000,000 之间');
  return known;
}
function choose(n, k) {
  let total = 1;
  for (let i = 1; i <= k; i++) total = total * (n - i + 1) / i;
  return Math.round(total);
}
export function outcomeCount(config) {
  const known = validate(config);
  let left = 52 - known.length;
  const missing = 5 - config.board.length;
  let count = choose(left, missing);
  left -= missing;
  for (const hand of config.opponents) if (!hand.length) { count *= choose(left, 2); left -= 2; }
  return count;
}

export function calculate(config, onProgress = () => {}, random = Math.random) {
  const known = new Set(validate(config));
  const deck = Array.from({ length: 52 }, (_, i) => i).filter(c => !known.has(c));
  const combinations = outcomeCount(config);
  const exact = combinations <= 150000;
  const total = exact ? combinations : config.iterations;
  const hands = [config.hero, ...config.opponents];
  const stats = hands.map(() => ({ wins: 0, ties: 0, losses: 0, share: 0 }));
  const categories = Array(9).fill(0);
  let done = 0;
  const visit = (board, resolved) => {
    const scores = resolved.map(hand => evaluate([...hand, ...board]));
    const best = Math.max(...scores);
    const winners = scores.reduce((n, value) => n + (value === best ? 1 : 0), 0);
    categories[categoryOf(scores[0])]++;
    scores.forEach((value, i) => {
      if (value !== best) stats[i].losses++;
      else { stats[i][winners === 1 ? 'wins' : 'ties']++; stats[i].share += 1 / winners; }
    });
    done++;
    if (done % 2000 === 0) onProgress(done, total);
  };
  if (exact) {
    const unknown = hands.map((h, i) => h.length ? -1 : i).filter(i => i >= 0);
    const select = (available, k, callback, selected = [], start = 0) => {
      if (!k) { callback(selected, available.filter(c => !selected.includes(c))); return; }
      for (let i = start; i <= available.length - k; i++) select(available, k - 1, callback, [...selected, available[i]], i + 1);
    };
    const assign = (remaining, resolved, index, board) => {
      if (index === unknown.length) { visit(board, resolved); return; }
      select(remaining, 2, (pair, rest) => {
        const next = [...resolved]; next[unknown[index]] = pair;
        assign(rest, next, index + 1, board);
      });
    };
    select(deck, 5 - config.board.length, (extra, rest) => assign(rest, hands, 0, [...config.board, ...extra]));
  } else {
    const draws = 5 - config.board.length + config.opponents.filter(h => !h.length).length * 2;
    for (let trial = 0; trial < total; trial++) {
      const shuffled = [...deck];
      for (let i = 0; i < draws; i++) {
        const j = i + Math.floor(random() * (shuffled.length - i));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      let offset = 5 - config.board.length;
      const board = [...config.board, ...shuffled.slice(0, offset)];
      const resolved = hands.map(hand => {
        if (hand.length) return hand;
        const result = shuffled.slice(offset, offset + 2); offset += 2; return result;
      });
      visit(board, resolved);
    }
  }
  onProgress(done, total);
  return {
    method: exact ? 'exact' : 'monte-carlo', samples: done,
    // Hoeffding's bound for the sample mean of pot share (bounded between 0 and 1).
    errorBound: exact ? 0 : Math.sqrt(Math.log(40) / (2 * done)) * 100,
    players: stats.map(s => ({ win: s.wins / done * 100, tie: s.ties / done * 100, lose: s.losses / done * 100, equity: s.share / done * 100 })),
    categories: categories.map(n => n / done * 100)
  };
}
