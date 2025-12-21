
export enum Suit {
    Hearts = '♥',
    Diamonds = '♦',
    Clubs = '♣',
    Spades = '♠'
}

export interface Card {
    rank: string; // formerly value
    suit: Suit;
    id: string; 
}

export type PlayerAction = 'WAITING' | 'THINKING' | 'ACTING' | 'FOLDED' | 'CHECKED' | 'CALLED' | 'RAISED' | 'ALL-IN' | 'ELIMINATED';

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
}

export enum GamePhase {
    PRE_FLOP = 'PRE_FLOP',
    FLOP = 'FLOP',
    TURN = 'TURN',
    RIVER = 'RIVER',
    SHOWDOWN = 'SHOWDOWN'
}

export interface Pot {
    id: string;
    amount: number;
    eligiblePlayerIds: string[]; // Who can win this pot
    winners?: string[];
    kind: 'MAIN' | 'SIDE';
}

export interface WinningHand {
    playerId: string;
    cardIds: string[];
    description: string;
    focalPlayerId?: string; // ID of the player to highlight/scroll to (e.g., runner-up if human wins)
    potDetails?: string; // e.g., "Main Pot ($200)" or "Side Pot ($500)"
}

export interface GameConfig {
    playerName?: string; // Added for login flow
    startingStackHuman: number;
    startingStackAI: number;
    blindBig: number;
    opponentCount: number;
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