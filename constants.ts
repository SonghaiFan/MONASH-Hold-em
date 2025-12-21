import { Card, GameState, Player, GamePhase, Suit, GameConfig } from "./types";

export const INITIAL_STACK_HUMAN = 10000;
export const INITIAL_STACK_AI_AVG = 5000;
export const BLIND_BIG = 200;

export const POSITIONS = ["SB", "BB", "UTG", "MP", "CO", "BTN"];

export const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];
const SUITS = [Suit.Hearts, Suit.Diamonds, Suit.Clubs, Suit.Spades];

export const AI_NAMES = [
  "Marcus",
  "Sarah",
  "David",
  "Elena",
  "James",
  "Jocelyn",
  "Luna",
  "Viktor",
  "Oliver",
  "Felix",
];

export const DEFAULT_CONFIG: GameConfig = {
  playerName: "Player",
  startingStackHuman: INITIAL_STACK_HUMAN,
  startingStackAI: INITIAL_STACK_AI_AVG,
  blindBig: BLIND_BIG,
  opponentCount: 5,
};

export const generateDeck = (): Card[] => {
  const deck: Card[] = [];
  SUITS.forEach((suit) => {
    RANKS.forEach((rank) => {
      deck.push({
        rank,
        suit,
        id: `${rank}-${suit}-${Math.random().toString(36).substr(2, 9)}`,
      });
    });
  });
  // Fisher-Yates Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

// Generates the initial table state with players
export const initializeGame = (
  config: GameConfig = DEFAULT_CONFIG
): GameState => {
  const aiPlayers: Player[] = [];

  // Create AI Players
  for (let i = 0; i < config.opponentCount; i++) {
    let name = AI_NAMES[i % AI_NAMES.length];
    // simple variance in AI stacks (+/- 10%)
    const variance =
      Math.floor(Math.random() * (config.startingStackAI * 0.2)) -
      config.startingStackAI * 0.1;
    const chips = Math.max(100, Math.floor(config.startingStackAI + variance));

    aiPlayers.push({
      id: `cpu-${i + 1}`,
      name,
      isHuman: false,
      chips,
      hand: [],
      status: "WAITING",
      position: "",
      isDealer: false,
      isActive: true,
      currentBet: 0,
    });
  }

  // Create Human Player
  const human: Player = {
    id: "hero",
    name: config.playerName || "You",
    isHuman: true,
    chips: config.startingStackHuman,
    hand: [],
    status: "WAITING",
    position: "",
    isDealer: false,
    isActive: true,
    currentBet: 0,
  };

  const players = [...aiPlayers, human];

  return {
    pot: 0,
    pots: [], // Initialize empty pots
    phase: GamePhase.PRE_FLOP,
    board: [],
    deck: [],
    players,
    dealerIndex: 0,
    activePlayerId: null,
    minRaise: config.blindBig,
    winningHand: null,
    isRunningOut: false,
    handHistory: [],
  };
};
