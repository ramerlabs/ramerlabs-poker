import { evaluateBestHand } from "./hand";
import type { Card, PlayerAction, PokerTableState } from "./types";

export function isBotUserId(userId: string) {
  return userId.startsWith("bot_");
}

function hashSeed(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

/** Each bot gets a stable random skill in 30–50%. */
export function botSkillPercentFor(userId: string) {
  return 30 + (hashSeed(userId) % 21);
}

/** Think time before a bot acts — kept short so multi-bot hands stay snappy. */
export function botThinkMs(state: PokerTableState, userId: string) {
  const seed = `${userId}:${state.handNumber}:${state.street}:${state.actionSeat}:${state.pot}`;
  const h = hashSeed(seed);
  const skill = botSkillPercentFor(userId);
  // ~0.35–0.95s (was ~1.9–4.1s)
  const base = 350 + Math.floor(skill * 4);
  return base + (h % 450);
}

function rankValue(card: Card) {
  const r = card[0]!;
  if (r === "A") return 14;
  if (r === "K") return 13;
  if (r === "Q") return 12;
  if (r === "J") return 11;
  if (r === "T") return 10;
  return Number(r);
}

/** Preflop hole quality 0–1 (boosted so average hands still play). */
export function holeCardStrength(hole: Card[]): number {
  if (hole.length < 2) return 0.35;
  const [a, b] = hole;
  const r1 = rankValue(a!);
  const r2 = rankValue(b!);
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const suited = a![1] === b![1];
  const paired = r1 === r2;
  const gap = high - low;

  let score = 0.28; // floor — most hands are “playable” in loose games
  if (paired) {
    score = 0.62 + (high / 14) * 0.35;
  } else {
    score += (high / 14) * 0.35 + (low / 14) * 0.15;
    if (suited) score += 0.1;
    if (gap <= 2) score += 0.08;
    if (high >= 12) score += 0.08;
  }
  return Math.max(0.22, Math.min(0.98, score));
}

/** Made-hand strength on the board — also boosted so they stay in. */
export function boardHandStrength(hole: Card[], community: Card[]): number {
  if (community.length === 0) return holeCardStrength(hole);
  const hand = evaluateBestHand(hole, community);
  let score = 0.3 + hand.rank / 8 * 0.55;
  if (hand.rank === 0) score = 0.28 + (hand.tiebreakers[0] ?? 0) / 14 / 6;
  if (hand.rank === 1) score = 0.48 + (hand.tiebreakers[0] ?? 0) / 14 / 8;
  return Math.max(0.22, Math.min(0.98, score));
}

/**
 * Loose-active bots: prefer check/call over fold so hands reach showdown.
 * They still raise and bluff sometimes, but mass folds are rare.
 */
export function decideBotAction(
  state: PokerTableState,
  userId: string,
): { action: PlayerAction; amount?: number } {
  const seat = state.seats.find((s) => s.userId === userId);
  if (!seat || seat.folded || seat.allIn) {
    return { action: "check" };
  }

  const skill = botSkillPercentFor(userId) / 100;
  const toCall = Math.max(0, state.currentBet - seat.bet);
  const bb = Math.max(1, state.bigBlind);
  const strength = boardHandStrength(seat.holeCards, state.community);
  const loose = 0.55 + (1 - skill) * 0.25 + (hashSeed(userId) % 20) / 100; // ~0.55–0.95
  const roll = Math.random();
  const preflop = state.community.length === 0;
  const callInBb = toCall / bb;

  // ——— Free check / option to bet ———
  if (toCall === 0) {
    // Open / stab sometimes
    if (strength >= 0.55 && roll < 0.28 + skill * 0.15) {
      const raiseTo = Math.min(seat.stack + seat.bet, seat.bet + bb * (roll < 0.4 ? 3 : 2));
      if (raiseTo > state.currentBet) {
        return { action: state.currentBet > 0 ? "raise" : "bet", amount: raiseTo };
      }
    }
    // Light bluff c-bet
    if (strength < 0.4 && roll < 0.12) {
      const raiseTo = Math.min(seat.stack + seat.bet, seat.bet + bb * 2);
      if (raiseTo > state.currentBet) {
        return { action: state.currentBet > 0 ? "raise" : "bet", amount: raiseTo };
      }
    }
    return { action: "check" };
  }

  // ——— Facing a bet that covers us ———
  if (toCall >= seat.stack) {
    // Call/shove often enough that pots get contested
    if (strength >= 0.35 || roll < 0.4 * loose) return { action: "allin" };
    return { action: "fold" };
  }

  // ——— Small price (≤ 3 BB): almost always continue ———
  if (callInBb <= 3) {
    if (roll < 0.12 && seat.stack > toCall + state.minRaise && strength >= 0.45) {
      const raiseTo = Math.min(
        seat.stack + seat.bet,
        state.currentBet + Math.max(state.minRaise, bb * 2),
      );
      if (raiseTo > state.currentBet) return { action: "raise", amount: raiseTo };
    }
    // Fold only ~8–15% to tiny bets
    if (roll < 0.08 + (1 - loose) * 0.08 && strength < 0.32) {
      return { action: "fold" };
    }
    return { action: "call" };
  }

  // ——— Medium price (3–8 BB) ———
  if (callInBb <= 8) {
    if (strength >= 0.4 || roll < 0.65 * loose) {
      if (roll < 0.15 && strength >= 0.55 && seat.stack > toCall + state.minRaise) {
        const raiseTo = Math.min(
          seat.stack + seat.bet,
          state.currentBet + Math.max(state.minRaise, bb * 2),
        );
        if (raiseTo > state.currentBet) return { action: "raise", amount: raiseTo };
      }
      return { action: "call" };
    }
    // Still call often preflop
    if (preflop && roll < 0.55) return { action: "call" };
    return roll < 0.35 ? { action: "call" } : { action: "fold" };
  }

  // ——— Big bet / raise ———
  if (strength >= 0.55 || (strength >= 0.4 && roll < 0.45 * loose)) {
    if (strength >= 0.72 && roll < 0.25) return { action: "allin" };
    return { action: "call" };
  }
  if (preflop && roll < 0.3) return { action: "call" };

  // Default: call more than fold so the table stays alive
  if (roll < 0.55 * loose) return { action: "call" };
  return { action: "fold" };
}
