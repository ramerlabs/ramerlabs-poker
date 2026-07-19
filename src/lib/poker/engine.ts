import { createDeck, deal, shuffle } from "./deck";
import { compareHands, describeHand, evaluateBestHand } from "./hand";
import type {
  PlayerAction,
  PokerTableState,
  PublicTableState,
  RakeConfig,
  SeatState,
} from "./types";
import { DEFAULT_TURN_SECONDS } from "./types";

function markTurnClock(state: PokerTableState, seat: number | null) {
  state.actionSeat = seat;
  if (seat == null) {
    state.turnStartedAt = null;
    return;
  }
  // Don't burn the player's clock while cards are still being dealt
  if (state.streetHoldUntil && Date.now() < state.streetHoldUntil) {
    state.turnStartedAt = null;
  } else {
    state.turnStartedAt = Date.now();
  }
  if (!state.turnSeconds) state.turnSeconds = DEFAULT_TURN_SECONDS;
}

const MAX_STREET_HOLD_MS = 15_000;

/**
 * Clear absurd/expired deal holds and ensure the actor has a running clock.
 * A stuck streetHoldUntil (hours ahead) previously froze every table forever.
 */
export function sanitizeTableClocks(state: PokerTableState): boolean {
  let changed = false;
  const now = Date.now();

  if (state.streetHoldUntil != null) {
    const holdMs = state.streetHoldUntil - now;
    if (holdMs <= 0 || holdMs > MAX_STREET_HOLD_MS) {
      state.streetHoldUntil = null;
      changed = true;
    }
  }

  if (
    state.turnStartedAt != null &&
    (state.turnStartedAt > now + 5_000 || now - state.turnStartedAt > 600_000)
  ) {
    state.turnStartedAt = state.actionSeat != null ? now : null;
    changed = true;
  }

  if (
    state.actionSeat != null &&
    state.turnStartedAt == null &&
    (state.streetHoldUntil == null || now >= state.streetHoldUntil)
  ) {
    state.turnStartedAt = now;
    changed = true;
  }

  return changed;
}

/** Clear expired deal/reveal holds and start the turn clock when ready. */
export function releaseStreetHoldIfReady(state: PokerTableState): boolean {
  let changed = sanitizeTableClocks(state);
  if (state.streetHoldUntil != null && Date.now() >= state.streetHoldUntil) {
    state.streetHoldUntil = null;
    changed = true;
  }
  if (
    state.actionSeat != null &&
    state.turnStartedAt == null &&
    (state.streetHoldUntil == null || Date.now() >= state.streetHoldUntil)
  ) {
    state.turnStartedAt = Date.now();
    changed = true;
  }
  return changed;
}

function activeSeats(state: PokerTableState): SeatState[] {
  return state.seats.filter((s) => !s.sittingOut && s.stack + s.bet > 0);
}

function contesting(state: PokerTableState): SeatState[] {
  return state.seats.filter((s) => !s.folded && !s.sittingOut);
}

function nextOccupiedSeat(state: PokerTableState, from: number, predicate: (s: SeatState) => boolean) {
  const ordered = [...state.seats].sort((a, b) => a.seat - b.seat);
  if (!ordered.length) return null;
  const startIdx = ordered.findIndex((s) => s.seat === from);
  for (let i = 1; i <= ordered.length; i += 1) {
    const seat = ordered[(startIdx + i) % ordered.length]!;
    if (predicate(seat)) return seat.seat;
  }
  return null;
}

function collectBets(state: PokerTableState) {
  for (const seat of state.seats) {
    state.pot += seat.bet;
    seat.totalBet += seat.bet;
    seat.bet = 0;
  }
  state.currentBet = 0;
}

function dealCommunity(state: PokerTableState, count: number) {
  const burned = deal(state.deck, 1);
  state.deck = burned.deck;
  const dealt = deal(state.deck, count);
  state.deck = dealt.deck;
  state.community.push(...dealt.cards);
}

function playersToAct(state: PokerTableState): SeatState[] {
  return contesting(state).filter((s) => !s.allIn && (s.bet < state.currentBet || s.totalBet === 0));
}

function needsAction(state: PokerTableState, seat: SeatState) {
  if (seat.folded || seat.allIn || seat.sittingOut) return false;
  if (seat.bet < state.currentBet) return true;
  // Preflop BB option / unchecked street
  const acted = state.lastAction?.userId === seat.userId;
  if (state.currentBet === 0 && !acted) {
    // Allow check once around — simplified via actionSeat pointer
    return true;
  }
  return false;
}

function streetPauseMs(street: PokerTableState["street"], pendingExtra = 0) {
  if (pendingExtra > 0) return 450; // between staggered board cards
  if (street === "preflop") return 0;
  if (street === "flop") return 700;
  if (street === "turn") return 800;
  if (street === "fourth") return 800;
  if (street === "river") return 800;
  return 500;
}

function clearStreetSeatActions(state: PokerTableState) {
  for (const seat of state.seats) {
    if (seat.folded) {
      seat.lastAction = "fold";
      seat.lastActionAmount = undefined;
      continue;
    }
    if (seat.allIn) {
      seat.lastAction = "allin";
      continue;
    }
    seat.lastAction = null;
    seat.lastActionAmount = undefined;
  }
}

function advanceStreet(state: PokerTableState) {
  collectBets(state);
  state.lastAction = null;
  clearStreetSeatActions(state);
  state.minRaise = state.bigBlind;
  state.pendingCommunityDeals = 0;

  if (contesting(state).length <= 1) {
    finishHand(state);
    return;
  }

  // House board: 2 cards first, then 3rd / 4th / 5th one at a time (5 total).
  if (state.street === "preflop") {
    state.street = "flop";
    dealCommunity(state, 2);
    state.pendingCommunityDeals = 0;
    state.streetHoldUntil = Date.now() + streetPauseMs("flop");
    const first = nextOccupiedSeat(
      state,
      state.dealerSeat,
      (s) => !s.folded && !s.allIn && !s.sittingOut,
    );
    markTurnClock(state, first);
    return;
  }

  if (state.street === "flop") {
    // 3rd board card
    state.street = "turn";
    dealCommunity(state, 1);
  } else if (state.street === "turn") {
    // 4th board card
    state.street = "fourth";
    dealCommunity(state, 1);
  } else if (state.street === "fourth") {
    // 5th board card (river)
    state.street = "river";
    dealCommunity(state, 1);
  } else if (state.street === "river") {
    state.street = "showdown";
    finishHand(state);
    return;
  }

  state.streetHoldUntil = Date.now() + streetPauseMs(state.street);
  const first = nextOccupiedSeat(
    state,
    state.dealerSeat,
    (s) => !s.folded && !s.allIn && !s.sittingOut,
  );
  markTurnClock(state, first);
}

/** Deal remaining flop cards one-by-one, then open flop betting. */
export function continueCommunityDealIfReady(state: PokerTableState): PokerTableState | null {
  if (!state.pendingCommunityDeals || state.pendingCommunityDeals <= 0) return null;
  if (state.streetHoldUntil && Date.now() < state.streetHoldUntil) return null;

  const next = structuredClone(state) as PokerTableState;
  dealCommunity(next, 1);
  next.pendingCommunityDeals = Math.max(0, (next.pendingCommunityDeals ?? 1) - 1);

  if (next.pendingCommunityDeals > 0) {
    next.streetHoldUntil = Date.now() + streetPauseMs(next.street, next.pendingCommunityDeals);
    markTurnClock(next, null);
    return next;
  }

  // Flop complete — start betting
  next.streetHoldUntil = Date.now() + 400;
  const first = nextOccupiedSeat(
    next,
    next.dealerSeat,
    (s) => !s.folded && !s.allIn && !s.sittingOut,
  );
  markTurnClock(next, first);
  return next;
}

/** After all-in / no actors: reveal next board street once the pause elapses. */
export function continueRunoutIfReady(state: PokerTableState): PokerTableState | null {
  if (
    state.street === "waiting" ||
    state.street === "complete" ||
    state.street === "showdown"
  ) {
    return null;
  }
  // Prefer finishing a staggered flop first
  if (state.pendingCommunityDeals && state.pendingCommunityDeals > 0) return null;

  if (state.actionSeat != null) return null;
  if (state.streetHoldUntil && Date.now() < state.streetHoldUntil) return null;

  const someoneCanAct = state.seats.some(
    (s) => !s.folded && !s.allIn && !s.sittingOut && s.stack > 0,
  );
  if (someoneCanAct) return null;
  if (contesting(state).length <= 1) {
    const next = structuredClone(state) as PokerTableState;
    finishHand(next);
    return next;
  }

  const next = structuredClone(state) as PokerTableState;
  advanceStreet(next);
  return next;
}

function takeRake(pot: number, state: PokerTableState): { netPot: number; rake: number } {
  if (pot <= 0 || state.rakePercent <= 0) return { netPot: pot, rake: 0 };
  let rake = Math.floor((pot * state.rakePercent) / 100);
  if (state.rakeCap > 0) rake = Math.min(rake, state.rakeCap);
  // Never rake the entire pot — leave at least 1 chip when possible
  if (rake >= pot) rake = Math.max(0, pot - 1);
  return { netPot: pot - rake, rake };
}

function finishHand(state: PokerTableState) {
  collectBets(state);
  const alive = contesting(state);
  state.street = "showdown";
  markTurnClock(state, null);

  const { netPot, rake } = takeRake(state.pot, state);
  state.rakeTaken = rake;
  state.pot = netPot;

  if (alive.length === 1) {
    const winner = alive[0]!;
    winner.stack += state.pot;
    let handName = "Everyone else folded";
    if (winner.holeCards.length >= 2 && state.community.length >= 2) {
      handName = `${describeHand(evaluateBestHand(winner.holeCards, state.community))} (uncontested)`;
    } else if (winner.holeCards.length >= 2) {
      handName = "Everyone else folded";
    }
    state.winners = [{ userId: winner.userId, amount: state.pot, handName }];
    state.pot = 0;
    state.street = "complete";
    state.handEndedAt = Date.now();
    return;
  }

  const scored = alive.map((seat) => ({
    seat,
    hand: evaluateBestHand(seat.holeCards, state.community),
  }));
  scored.sort((a, b) => compareHands(b.hand, a.hand));

  const best = scored[0]!.hand;
  const winners = scored.filter((s) => compareHands(s.hand, best) === 0);
  const share = Math.floor(state.pot / winners.length);
  const remainder = state.pot - share * winners.length;

  state.winners = winners.map(({ seat, hand }, idx) => {
    const amount = share + (idx === 0 ? remainder : 0);
    seat.stack += amount;
    return { userId: seat.userId, amount, handName: describeHand(hand) };
  });

  state.pot = 0;
  state.street = "complete";
  state.handEndedAt = Date.now();
}

function postBlind(seat: SeatState, amount: number) {
  const pay = Math.min(seat.stack, amount);
  seat.stack -= pay;
  seat.bet += pay;
  if (seat.stack === 0) seat.allIn = true;
  return pay;
}

export function createWaitingState(
  roomId: string,
  seats: { userId: string; seat: number; stack: number }[],
  smallBlind: number,
  bigBlind: number,
  rake: RakeConfig = { percent: 0, cap: 0 },
): PokerTableState {
  return {
    roomId,
    street: "waiting",
    deck: [],
    community: [],
    seats: seats.map((s) => ({
      ...s,
      bet: 0,
      totalBet: 0,
      holeCards: [],
      folded: false,
      allIn: false,
      sittingOut: false,
      lastAction: null,
    })),
    pot: 0,
    currentBet: 0,
    minRaise: bigBlind,
    dealerSeat: seats[0]?.seat ?? 0,
    smallBlindSeat: seats[0]?.seat ?? 0,
    bigBlindSeat: seats[0]?.seat ?? 0,
    actionSeat: null,
    handNumber: 0,
    winners: [],
    lastAction: null,
    smallBlind,
    bigBlind,
    rakeTaken: 0,
    rakePercent: rake.percent,
    rakeCap: rake.cap,
    turnStartedAt: null,
    turnSeconds: DEFAULT_TURN_SECONDS,
    streetHoldUntil: null,
    pendingCommunityDeals: 0,
    botSkillPercent: 50,
    handEndedAt: null,
  };
}

export function startHand(state: PokerTableState): PokerTableState {
  const next = structuredClone(state) as PokerTableState;
  const seated = activeSeats(next).filter((s) => s.stack > 0);
  if (seated.length < 2) {
    next.street = "waiting";
    next.handEndedAt = null;
    markTurnClock(next, null);
    return next;
  }

  next.handNumber += 1;
  next.community = [];
  next.pot = 0;
  next.winners = [];
  next.rakeTaken = 0;
  next.lastAction = null;
  next.deck = shuffle(createDeck());
  next.street = "preflop";
  next.minRaise = next.bigBlind;
  next.streetHoldUntil = null;
  next.pendingCommunityDeals = 0;
  next.handEndedAt = null;

  for (const seat of next.seats) {
    seat.bet = 0;
    seat.totalBet = 0;
    seat.folded = seat.sittingOut || seat.stack <= 0;
    seat.allIn = false;
    seat.holeCards = [];
    seat.lastAction = null;
    seat.lastActionAmount = undefined;
  }

  const ordered = [...seated].sort((a, b) => a.seat - b.seat);
  const dealerIdx = ordered.findIndex((s) => s.seat === next.dealerSeat);
  const newDealer = ordered[(dealerIdx + 1) % ordered.length]!;
  next.dealerSeat = newDealer.seat;

  if (ordered.length === 2) {
    next.smallBlindSeat = next.dealerSeat;
    next.bigBlindSeat =
      ordered.find((s) => s.seat !== next.dealerSeat)?.seat ?? next.dealerSeat;
  } else {
    next.smallBlindSeat = nextOccupiedSeat(next, next.dealerSeat, (s) => !s.folded)!;
    next.bigBlindSeat = nextOccupiedSeat(next, next.smallBlindSeat, (s) => !s.folded)!;
  }

  for (const seat of ordered) {
    const dealt = deal(next.deck, 2);
    next.deck = dealt.deck;
    seat.holeCards = dealt.cards;
  }

  const sb = next.seats.find((s) => s.seat === next.smallBlindSeat)!;
  const bb = next.seats.find((s) => s.seat === next.bigBlindSeat)!;
  postBlind(sb, next.smallBlind);
  postBlind(bb, next.bigBlind);
  next.currentBet = Math.max(sb.bet, bb.bet);

  // Hold betting until hole cards finish animating (short pause)
  const dealMs = Math.min(1600, 400 + ordered.length * 120);
  next.streetHoldUntil = Date.now() + dealMs;

  markTurnClock(
    next,
    nextOccupiedSeat(
      next,
      next.bigBlindSeat,
      (s) => !s.folded && !s.allIn && !s.sittingOut,
    ),
  );

  return next;
}

export function applyAction(
  state: PokerTableState,
  userId: string,
  action: PlayerAction,
  amount = 0,
): PokerTableState {
  const next = structuredClone(state) as PokerTableState;
  releaseStreetHoldIfReady(next);

  if (next.street === "waiting" || next.street === "complete" || next.street === "showdown") {
    throw new Error("Hand is not in a betting round");
  }
  if (next.streetHoldUntil && Date.now() < next.streetHoldUntil) {
    throw new Error("Wait — the dealer is still dealing");
  }

  const seat = next.seats.find((s) => s.userId === userId);
  if (!seat) throw new Error("You are not seated at this table");
  if (next.actionSeat !== seat.seat) throw new Error("It is not your turn");
  if (seat.folded || seat.allIn) throw new Error("You cannot act");

  const toCall = next.currentBet - seat.bet;

  switch (action) {
    case "fold": {
      seat.folded = true;
      next.lastAction = { userId, action };
      break;
    }
    case "check": {
      if (toCall > 0) throw new Error("Cannot check facing a bet");
      next.lastAction = { userId, action };
      break;
    }
    case "call": {
      const pay = Math.min(seat.stack, toCall);
      seat.stack -= pay;
      seat.bet += pay;
      if (seat.stack === 0) seat.allIn = true;
      next.lastAction = { userId, action: seat.allIn ? "allin" : "call", amount: pay };
      break;
    }
    case "bet":
    case "raise": {
      const totalBet = amount;
      if (totalBet < next.currentBet + next.minRaise && totalBet < seat.stack + seat.bet) {
        throw new Error(`Minimum raise is to ${next.currentBet + next.minRaise}`);
      }
      const pay = totalBet - seat.bet;
      if (pay <= 0 || pay > seat.stack) throw new Error("Invalid bet amount");
      const raiseSize = totalBet - next.currentBet;
      seat.stack -= pay;
      seat.bet = totalBet;
      if (raiseSize > 0) next.minRaise = raiseSize;
      next.currentBet = totalBet;
      if (seat.stack === 0) seat.allIn = true;
      next.lastAction = {
        userId,
        action: seat.allIn ? "allin" : action,
        amount: totalBet,
      };
      break;
    }
    case "allin": {
      const pay = seat.stack;
      seat.bet += pay;
      seat.stack = 0;
      seat.allIn = true;
      if (seat.bet > next.currentBet) {
        next.minRaise = Math.max(next.minRaise, seat.bet - next.currentBet);
        next.currentBet = seat.bet;
      }
      next.lastAction = { userId, action, amount: seat.bet };
      break;
    }
    default:
      throw new Error("Unknown action");
  }

  if (next.lastAction) {
    seat.lastAction = next.lastAction.action;
    seat.lastActionAmount = next.lastAction.amount;
  }

  if (contesting(next).length <= 1) {
    finishHand(next);
    return next;
  }

  const stillToAct = next.seats.filter(
    (s) => !s.folded && !s.allIn && !s.sittingOut && s.bet < next.currentBet,
  );

  if (stillToAct.length === 0 && bettingRoundComplete(next, seat.userId)) {
    advanceStreet(next);
  } else {
    const nextSeat = nextOccupiedSeat(
      next,
      seat.seat,
      (s) =>
        !s.folded &&
        !s.allIn &&
        !s.sittingOut &&
        (s.bet < next.currentBet || needsActionRound(next, s, seat.userId)),
    );
    if (nextSeat == null) {
      // No legal actor left — close the betting round instead of freezing.
      advanceStreet(next);
    } else {
      markTurnClock(next, nextSeat);
    }
  }

  return next;
}

/**
 * If a hand has no actionSeat mid-round (bad check-round / null seat),
 * pick the next actor or advance the street so the table cannot freeze.
 */
export function recoverIfNoActionSeat(state: PokerTableState): boolean {
  if (state.actionSeat != null) return false;
  if (
    state.street === "waiting" ||
    state.street === "complete" ||
    state.street === "showdown"
  ) {
    return false;
  }

  sanitizeTableClocks(state);
  const live = contesting(state).filter((s) => !s.allIn);
  if (live.length <= 1) {
    finishHand(state);
    return true;
  }

  if (state.currentBet === 0) {
    if (live.every((s) => s.lastAction != null)) {
      advanceStreet(state);
      return true;
    }
    const next = live.find((s) => s.lastAction == null);
    if (next) {
      markTurnClock(state, next.seat);
      return true;
    }
  } else {
    const behind = live.find((s) => s.bet < state.currentBet);
    if (!behind) {
      advanceStreet(state);
      return true;
    }
    markTurnClock(state, behind.seat);
    return true;
  }

  return false;
}

/** Fold a player even if it is not their turn (disconnect / leave). */
export function forceFold(state: PokerTableState, userId: string): PokerTableState {
  if (
    state.street === "waiting" ||
    state.street === "complete" ||
    state.street === "showdown"
  ) {
    return state;
  }
  const seat = state.seats.find((s) => s.userId === userId);
  if (!seat || seat.folded) return state;

  if (state.actionSeat === seat.seat) {
    const next = structuredClone(state) as PokerTableState;
    next.streetHoldUntil = null;
    if (next.turnStartedAt == null) next.turnStartedAt = Date.now();
    return applyAction(next, userId, "fold");
  }

  const next = structuredClone(state) as PokerTableState;
  const s = next.seats.find((x) => x.userId === userId)!;
  s.folded = true;
  s.lastAction = "fold";
  s.lastActionAmount = undefined;
  next.lastAction = { userId, action: "fold" };
  if (contesting(next).length <= 1) {
    finishHand(next);
  }
  return next;
}

function needsActionRound(state: PokerTableState, seat: SeatState, justActedUserId: string) {
  if (seat.userId === justActedUserId) return false;
  if (state.currentBet === 0) {
    // Check-round: only seats that have not yet acted this street
    return seat.lastAction == null;
  }
  return seat.bet < state.currentBet;
}

function bettingRoundComplete(state: PokerTableState, _justActedUserId: string) {
  const live = contesting(state).filter((s) => !s.allIn);
  if (live.length === 0) return true;
  if (live.some((s) => s.bet < state.currentBet)) return false;

  if (state.currentBet === 0) {
    // All check-round actors have acted once
    return live.every((s) => s.lastAction != null);
  }

  return true;
}

export function toPublicState(state: PokerTableState, viewerId?: string): PublicTableState {
  return {
    roomId: state.roomId,
    street: state.street,
    community: state.community,
    pot: state.pot,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    dealerSeat: state.dealerSeat,
    smallBlindSeat: state.smallBlindSeat,
    bigBlindSeat: state.bigBlindSeat,
    actionSeat: state.actionSeat,
    handNumber: state.handNumber,
    winners: state.winners,
    lastAction: state.lastAction,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    rakeTaken: state.rakeTaken,
    rakePercent: state.rakePercent,
    rakeCap: state.rakeCap,
    turnStartedAt: state.turnStartedAt,
    turnSeconds: state.turnSeconds || DEFAULT_TURN_SECONDS,
    streetHoldUntil: state.streetHoldUntil ?? null,
    pendingCommunityDeals: state.pendingCommunityDeals ?? 0,
    botSkillPercent: state.botSkillPercent ?? 50,
    handEndedAt: state.handEndedAt ?? null,
    deckCount: state.deck.length,
    seats: state.seats.map((seat) => {
      const reveal =
        seat.userId === viewerId ||
        state.street === "showdown" ||
        state.street === "complete";
      return {
        userId: seat.userId,
        seat: seat.seat,
        stack: seat.stack,
        bet: seat.bet,
        totalBet: seat.totalBet,
        folded: seat.folded,
        allIn: seat.allIn,
        sittingOut: seat.sittingOut,
        lastAction: seat.lastAction ?? (seat.folded ? "fold" : seat.allIn ? "allin" : null),
        lastActionAmount: seat.lastActionAmount,
        cardCount: seat.holeCards.length,
        holeCards: reveal
          ? seat.holeCards
          : seat.holeCards.length
            ? (["hidden", "hidden"] as ["hidden", "hidden"])
            : [],
      };
    }),
  };
}

// silence unused helper in tree-shaken builds
void playersToAct;
void needsAction;
