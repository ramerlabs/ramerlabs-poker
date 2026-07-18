import type { Card, Rank } from "./types";
import { describeHand, evaluateBestHand } from "./hand";

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

const RANK_NAME: Record<number, string> = {
  2: "Deuces",
  3: "Threes",
  4: "Fours",
  5: "Fives",
  6: "Sixes",
  7: "Sevens",
  8: "Eights",
  9: "Nines",
  10: "Tens",
  11: "Jacks",
  12: "Queens",
  13: "Kings",
  14: "Aces",
};

function isRealCard(c: string): c is Card {
  return c.length >= 2 && c !== "hidden";
}

function rv(card: Card) {
  return RANK_VALUE[card[0] as Rank] ?? 0;
}

function suit(card: Card) {
  return card[1]!;
}

export type HandHints = {
  current: string;
  possibles: string[];
};

/** Friendly readouts for your hole cards + board. */
export function getHandHints(holeRaw: string[], community: Card[]): HandHints | null {
  const hole = holeRaw.filter(isRealCard);
  if (hole.length < 2) return null;

  const [a, b] = hole as [Card, Card];
  const board = community.filter(isRealCard);
  const possibles: string[] = [];

  if (board.length === 0) {
    const va = rv(a);
    const vb = rv(b);
    const high = Math.max(va, vb);
    const low = Math.min(va, vb);
    const suited = suit(a) === suit(b);
    const paired = va === vb;
    const gap = high - low;

    let current: string;
    if (paired) {
      current = `Pocket ${RANK_NAME[va] ?? "pair"}`;
      possibles.push("Set if the board pairs your rank");
      possibles.push("Full house / quads possible later");
    } else {
      const hiName = RANK_NAME[high]?.replace(/s$/, "") ?? "High";
      current = suited ? `Suited ${hiName}-high` : `Offsuit ${hiName}-high`;
      if (gap === 1) possibles.push("Connected — straight draw likely");
      else if (gap === 2) possibles.push("One-gap connector — straight possible");
      if (suited) {
        possibles.push("Flush if three more of your suit hit");
        possibles.push("Flush draw on a suited flop");
      }
      if (high >= 12 && low >= 10) possibles.push("Strong broadway cards");
      else if (high >= 14) possibles.push("Ace-high — top pair potential");
      possibles.push(`Pair of ${RANK_NAME[high] ?? "highs"} or ${RANK_NAME[low] ?? "lows"}`);
    }

    return { current, possibles: possibles.slice(0, 4) };
  }

  const best = evaluateBestHand(hole, board);
  const current = describeHand(best);

  const all = [...hole, ...board];
  const suitCounts = new Map<string, number>();
  const rankCounts = new Map<number, number>();
  for (const c of all) {
    suitCounts.set(suit(c), (suitCounts.get(suit(c)) ?? 0) + 1);
    rankCounts.set(rv(c), (rankCounts.get(rv(c)) ?? 0) + 1);
  }

  const holeSuits = new Set(hole.map(suit));
  for (const s of holeSuits) {
    const n = suitCounts.get(s) ?? 0;
    if (n === 4 && best.rank < 5) possibles.push("Flush draw — one more of your suit");
    if (n === 3 && board.length <= 3 && best.rank < 5) {
      possibles.push("Backdoor flush — need two more of your suit");
    }
  }

  const values = [...new Set(all.map(rv))].sort((x, y) => x - y);
  // Wheel / broadway openers — light straight-draw heuristic
  const hasWheelBits =
    values.includes(14) && values.includes(2) && values.includes(3) && values.includes(4);
  if (hasWheelBits && best.rank < 4) possibles.push("Wheel straight draw (A-2-3-4)");

  let openEnded = false;
  for (let i = 0; i + 3 < values.length; i += 1) {
    const slice = values.slice(i, i + 4);
    if (slice[3]! - slice[0]! === 3 && new Set(slice).size === 4) {
      openEnded = true;
      break;
    }
  }
  if (openEnded && best.rank < 4) possibles.push("Open-ended straight draw");

  const holeRanks = hole.map(rv);
  for (const r of holeRanks) {
    const n = rankCounts.get(r) ?? 0;
    if (n === 2 && best.rank <= 1) {
      /* already have pair — covered by current */
    }
    if (n === 1 && board.length < 5) {
      possibles.push(`Pair ${RANK_NAME[r] ?? ""} if board hits`.trim());
    }
    if (n === 2 && board.some((c) => rv(c) === r) && best.rank < 3) {
      possibles.push("Set if another matches your pair");
    }
  }

  if (best.rank === 1 && board.length < 5) {
    possibles.push("Two pair or trips if the board pairs");
  }
  if (best.rank === 2 && board.length < 5) {
    possibles.push("Full house if the board pairs again");
  }
  if (best.rank === 3 && board.length < 5) {
    possibles.push("Full house / quads still possible");
  }
  if (best.rank >= 4) {
    possibles.push("Strong made hand — protect or value bet");
  }

  // Dedupe & trim
  const seen = new Set<string>();
  const unique = possibles.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { current, possibles: unique.slice(0, 4) };
}
