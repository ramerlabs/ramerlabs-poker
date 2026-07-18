import type { Card, Rank, Suit } from "./types";

const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS: Suit[] = ["h", "d", "c", "s"];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

/** Fisher–Yates shuffle using crypto-quality randomness when available. */
export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(secureRandom() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function secureRandom() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! / 0x100000000;
  }
  return Math.random();
}

export function deal(deck: Card[], count: number): { cards: Card[]; deck: Card[] } {
  if (deck.length < count) {
    throw new Error("Not enough cards remaining in deck");
  }
  return {
    cards: deck.slice(0, count),
    deck: deck.slice(count),
  };
}
