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
}

export interface PublicSeatState extends Omit<SeatState, "holeCards"> {
  holeCards: Card[] | ["hidden", "hidden"] | [];
  cardCount: number;
}

export interface PublicTableState extends Omit<PokerTableState, "deck" | "seats"> {
  seats: PublicSeatState[];
  deckCount: number;
}
