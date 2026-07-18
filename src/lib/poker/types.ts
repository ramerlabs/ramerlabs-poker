export type Suit = "h" | "d" | "c" | "s";
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "T"
  | "J"
  | "Q"
  | "K"
  | "A";

export type Card = `${Rank}${Suit}`;

export type Street = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown" | "complete";

export type PlayerAction = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export interface SeatState {
  userId: string;
  seat: number;
  stack: number;
  bet: number;
  totalBet: number;
  holeCards: Card[];
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
  /** Most recent choice this street (fold/all-in persist for the hand). */
  lastAction: PlayerAction | null;
  lastActionAmount?: number;
}

export interface PokerTableState {
  roomId: string;
  street: Street;
  deck: Card[];
  community: Card[];
  seats: SeatState[];
  pot: number;
  currentBet: number;
  minRaise: number;
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  actionSeat: number | null;
  handNumber: number;
  winners: { userId: string; amount: number; handName: string }[];
  lastAction: { userId: string; action: PlayerAction; amount?: number } | null;
  smallBlind: number;
  bigBlind: number;
  /** Rake taken from the last completed pot (REAL rooms). */
  rakeTaken: number;
  rakePercent: number;
  rakeCap: number;
  /** Epoch ms when the current action seat's clock started. */
  turnStartedAt: number | null;
  /** Seconds allowed per turn before auto-fold. */
  turnSeconds: number;
  /** Do not allow actions until this time (card reveal pause). */
  streetHoldUntil: number | null;
  /** Extra community cards still to deal before betting resumes (flop = 2 after first). */
  pendingCommunityDeals: number;
  /** Bot planning strength 0–100 (admin-configured). */
  botSkillPercent: number;
}

/** Recommended cash-game think time. */
export const DEFAULT_TURN_SECONDS = 20;

export interface RakeConfig {
  percent: number;
  cap: number;
}

export interface PublicSeatState extends Omit<SeatState, "holeCards"> {
  holeCards: Card[] | ["hidden", "hidden"] | [];
  cardCount: number;
}

export interface PublicTableState extends Omit<PokerTableState, "deck" | "seats"> {
  seats: PublicSeatState[];
  deckCount: number;
}
