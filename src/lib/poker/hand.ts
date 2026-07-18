import type { Card, Rank } from "./types";

const RANK_VALUE: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export interface EvaluatedHand {
  rank: number;
  name: string;
  tiebreakers: number[];
}

function cardRank(card: Card): number {
  return RANK_VALUE[card[0] as Rank];
}

function cardSuit(card: Card): string {
  return card[1]!;
}

function combinations(cards: Card[], k: number): Card[][] {
  const result: Card[][] = [];
  const n = cards.length;
  const idxs = Array.from({ length: k }, (_, i) => i);

  const push = () => result.push(idxs.map((i) => cards[i]!));

  if (n < k) return result;
  push();

  while (true) {
    let i = k - 1;
    while (i >= 0 && idxs[i] === i + n - k) i -= 1;
    if (i < 0) break;
    idxs[i]! += 1;
    for (let j = i + 1; j < k; j += 1) idxs[j] = idxs[j - 1]! + 1;
    push();
  }
  return result;
}

function evaluateFive(cards: Card[]): EvaluatedHand {
  const ranks = cards.map(cardRank).sort((a, b) => b - a);
  const suits = cards.map(cardSuit);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);

  const byCount = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const isFlush = suits.every((s) => s === suits[0]);
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  let isStraight = false;
  let straightHigh = 0;

  if (unique.length === 5) {
    if (unique[0]! - unique[4]! === 4) {
      isStraight = true;
      straightHigh = unique[0]!;
    } else if (
      unique[0] === 14 &&
      unique[1] === 5 &&
      unique[2] === 4 &&
      unique[3] === 3 &&
      unique[4] === 2
    ) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  if (isStraight && isFlush) {
    return { rank: 8, name: straightHigh === 14 ? "Royal Flush" : "Straight Flush", tiebreakers: [straightHigh] };
  }

  if (byCount[0]?.[1] === 4) {
    return {
      rank: 7,
      name: "Four of a Kind",
      tiebreakers: [byCount[0][0], byCount[1]?.[0] ?? 0],
    };
  }

  if (byCount[0]?.[1] === 3 && byCount[1]?.[1] === 2) {
    return {
      rank: 6,
      name: "Full House",
      tiebreakers: [byCount[0][0], byCount[1][0]],
    };
  }

  if (isFlush) {
    return { rank: 5, name: "Flush", tiebreakers: ranks };
  }

  if (isStraight) {
    return { rank: 4, name: "Straight", tiebreakers: [straightHigh] };
  }

  if (byCount[0]?.[1] === 3) {
    const kickers = byCount.slice(1).map(([r]) => r);
    return { rank: 3, name: "Three of a Kind", tiebreakers: [byCount[0][0], ...kickers] };
  }

  if (byCount[0]?.[1] === 2 && byCount[1]?.[1] === 2) {
    const highPair = Math.max(byCount[0][0], byCount[1][0]);
    const lowPair = Math.min(byCount[0][0], byCount[1][0]);
    const kicker = byCount[2]?.[0] ?? 0;
    return { rank: 2, name: "Two Pair", tiebreakers: [highPair, lowPair, kicker] };
  }

  if (byCount[0]?.[1] === 2) {
    const kickers = byCount.slice(1).map(([r]) => r);
    return { rank: 1, name: "One Pair", tiebreakers: [byCount[0][0], ...kickers] };
  }

  return { rank: 0, name: "High Card", tiebreakers: ranks };
}

export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i += 1) {
    const diff = (a.tiebreakers[i] ?? 0) - (b.tiebreakers[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function evaluateBestHand(hole: Card[], community: Card[]): EvaluatedHand {
  const all = [...hole, ...community];
  if (all.length < 5) {
    const padded = [...all];
    while (padded.length < 5) padded.push("2c");
    return evaluateFive(padded.slice(0, 5));
  }

  let best: EvaluatedHand | null = null;
  for (const five of combinations(all, 5)) {
    const evaluated = evaluateFive(five);
    if (!best || compareHands(evaluated, best) > 0) best = evaluated;
  }
  return best!;
}
