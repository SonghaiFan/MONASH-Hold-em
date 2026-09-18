export enum Suit {
  Hearts = "♥",
  Diamonds = "♦",
  Clubs = "♣",
  Spades = "♠",
}

export interface Card {
  rank: string; // formerly value
  suit: Suit;
  id: string;
}

export type PlayerAction =
  | "WAITING"
  | "THINKING"
  | "ACTING"
  | "FOLDED"
  | "CHECKED"
  | "CALLED"
  | "RAISED"
  | "ALL-IN"
  | "ELIMINATED";

// How an AI opponent deviates from the "objectively correct" play.
// The decision model answers what the spot calls for; the persona warps the
// resulting probability distribution before we sample an action from it.
export interface Persona {
  id: string;
  label: string; // Short tag shown in the UI, e.g. "LAG"
  description: string;
  aggression: number; // Multiplier on raise probability (>1 raises more)
  looseness: number; // Divisor on fold probability (>1 folds less)
  bluffFreq: number; // Extra raise weight added when hand strength is weak
  sizing: "small" | "standard" | "big"; // Preferred bet sizing
  temperature: number; // Sampling temperature: low = consistent, high = erratic
  tiltFactor: number; // Aggression multiplier applied after losing a big pot
}

export interface Player {
  id: string;
  name: string;
  isHuman: boolean;
  chips: number;
  hand: Card[];
  status: PlayerAction;
  position: string; // 'SB', 'BB', 'BTN', etc.
  isDealer: boolean; // True if player has the button
  isActive: boolean; // True if in the hand (not folded)
  currentBet: number; // Amount contributed in current street
  reasoningHistory?: string[]; // AI's internal thought process history
  persona?: Persona; // AI only
  model?: string; // AI only: per-player OpenRouter model override
  tilt?: number; // AI only: current aggression multiplier from recent losses (1 = calm)
  handStartChips?: number; // AI only: stack at the start of the current hand, for tilt tracking
}

export enum GamePhase {
  PRE_FLOP = "PRE_FLOP",
  FLOP = "FLOP",
  TURN = "TURN",
  RIVER = "RIVER",
  SHOWDOWN = "SHOWDOWN",
}

export interface Pot {
  id: string;
  amount: number;
  eligiblePlayerIds: string[]; // Who can win this pot
  winners?: string[];
  kind: "MAIN" | "SIDE";
}

export interface WinningHand {
  playerId: string;
  cardIds: string[];
  description: string;
  focalPlayerId?: string; // ID of the player to highlight/scroll to (e.g., runner-up if human wins)
  potDetails?: string; // e.g., "Main Pot ($200)" or "Side Pot ($500)"
}

export type AIModelKind = "decisions" | "chat";

export interface AIModelOption {
  id: string; // OpenRouter model slug
  label: string;
  sub: string;
  kind: AIModelKind; // "decisions" = TypeSafe Decisions API, "chat" = OpenAI-compatible chat completions
  reasoning?: "off" | "low" | "medium" | "high"; // chat models that think: switch it off or cap the effort to keep the table moving
  color?: string; // seat colour in the arena
}

export interface GameConfig {
  playerName?: string; // Added for login flow
  startingStackHuman: number;
  startingStackAI: number;
  blindBig: number;
  opponentCount: number;
  aiModel: string; // OpenRouter model slug driving the AI opponents
}

export interface GameState {
  pot: number; // For display (sum of all pots + current bets)
  pots: Pot[]; // The actual internal pots (Main + Sides)
  phase: GamePhase;
  board: Card[];
  deck: Card[];
  players: Player[];
  dealerIndex: number;
  activePlayerId: string | null; // ID of player whose turn it is
  minRaise: number;
  winningHand: WinningHand | null;
  isRunningOut: boolean; // True if dealing cards automatically (All-In)
  handHistory: string[]; // Log of all actions in the current hand for AI Context
}
