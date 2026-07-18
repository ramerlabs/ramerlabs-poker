import { createDeck, deal, shuffle } from "./deck";
import { compareHands, evaluateBestHand } from "./hand";
import type {
  PlayerAction,
  PokerTableState,
  PublicTableState,
  SeatState,
} from "./types";

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

function advanceStreet(state: PokerTableState) {
  collectBets(state);
  for (const seat of state.seats) {
    // reset per-street tracking via lastAction clear
  }
  state.lastAction = null;
  state.minRaise = state.bigBlind;

  if (contesting(state).length <= 1) {
    finishHand(state);
    return;
  }

  if (state.street === "preflop") {
    state.street = "flop";
    dealCommunity(state, 3);
  } else if (state.street === "flop") {
    state.street = "turn";
    dealCommunity(state, 1);
  } else if (state.street === "turn") {
    state.street = "river";
    dealCommunity(state, 1);
  } else if (state.street === "river") {
    state.street = "showdown";
    finishHand(state);
    return;
  }

  const first = nextOccupiedSeat(
    state,
    state.dealerSeat,
    (s) => !s.folded && !s.allIn && !s.sittingOut,
  );
  state.actionSeat = first;
}

function finishHand(state: PokerTableState) {
  collectBets(state);
  const alive = contesting(state);
  state.street = "showdown";
  state.actionSeat = null;

  if (alive.length === 1) {
    const winner = alive[0]!;
    winner.stack += state.pot;
    state.winners = [{ userId: winner.userId, amount: state.pot, handName: "Uncontested" }];
    state.pot = 0;
    state.street = "complete";
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
  let remainder = state.pot - share * winners.length;

  state.winners = winners.map(({ seat, hand }, idx) => {
    const amount = share + (idx === 0 ? remainder : 0);
    seat.stack += amount;
    return { userId: seat.userId, amount, handName: hand.name };
  });

  state.pot = 0;
  state.street = "complete";
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
  };
}

export function startHand(state: PokerTableState): PokerTableState {
  const next = structuredClone(state) as PokerTableState;
  const seated = activeSeats(next).filter((s) => s.stack > 0);
  if (seated.length < 2) {
    next.street = "waiting";
    next.actionSeat = null;
    return next;
  }

  next.handNumber += 1;
  next.community = [];
  next.pot = 0;
  next.winners = [];
  next.lastAction = null;
  next.deck = shuffle(createDeck());
  next.street = "preflop";
  next.minRaise = next.bigBlind;

  for (const seat of next.seats) {
    seat.bet = 0;
    seat.totalBet = 0;
    seat.folded = seat.sittingOut || seat.stack <= 0;
    seat.allIn = false;
    seat.holeCards = [];
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

  next.actionSeat = nextOccupiedSeat(
    next,
    next.bigBlindSeat,
    (s) => !s.folded && !s.allIn && !s.sittingOut,
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
  if (next.street === "waiting" || next.street === "complete" || next.street === "showdown") {
    throw new Error("Hand is not in a betting round");
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

  if (contesting(next).length <= 1) {
    finishHand(next);
    return next;
  }

  const stillToAct = next.seats.filter(
    (s) => !s.folded && !s.allIn && !s.sittingOut && s.bet < next.currentBet,
  );

  const nextSeat = nextOccupiedSeat(
    next,
    seat.seat,
    (s) => !s.folded && !s.allIn && !s.sittingOut && (s.bet < next.currentBet || needsActionRound(next, s, seat.userId)),
  );

  if (stillToAct.length === 0 && bettingRoundComplete(next, seat.userId)) {
    advanceStreet(next);
  } else {
    next.actionSeat = nextSeat;
  }

  return next;
}

function needsActionRound(state: PokerTableState, seat: SeatState, justActedUserId: string) {
  if (seat.userId === justActedUserId) return false;
  if (state.currentBet === 0) {
    // Everyone gets one chance to check/bet when no bet open
    return state.lastAction?.userId !== seat.userId;
  }
  return seat.bet < state.currentBet;
}

function bettingRoundComplete(state: PokerTableState, justActedUserId: string) {
  const live = contesting(state).filter((s) => !s.allIn);
  if (live.length === 0) return true;
  if (live.some((s) => s.bet < state.currentBet)) return false;

  // When currentBet is 0, require that action has returned past the first actor after a full orbit.
  // Simplified: if no one faces a bet and we have a last action, close when next would be someone who already matched.
  if (state.currentBet === 0) {
    const actionable = contesting(state).filter((s) => !s.allIn);
    // Close after the last player before dealer acts when all checks
    const next = nextOccupiedSeat(
      state,
      actionable.find((s) => s.userId === justActedUserId)?.seat ?? state.dealerSeat,
      (s) => !s.folded && !s.allIn && !s.sittingOut,
    );
    // If next player is the first who could have opened and everyone checked, complete
    const first = nextOccupiedSeat(
      state,
      state.street === "preflop" ? state.bigBlindSeat : state.dealerSeat,
      (s) => !s.folded && !s.allIn && !s.sittingOut,
    );
    return next === first;
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
