import {
  Card,
  GameState,
  Player,
  GamePhase,
  Suit,
  GameConfig,
  Persona,
} from "./types";

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

export const PERSONAS: Record<string, Persona> = {
  TAG: {
    id: "TAG",
    label: "TAG",
    description: "Tight-aggressive regular: solid ranges, bets for value, rarely out of line.",
    aggression: 1.2,
    looseness: 0.9,
    bluffFreq: 0.08,
    sizing: "standard",
    temperature: 0.7,
    tiltFactor: 1.2,
  },
  LAG: {
    id: "LAG",
    label: "LAG",
    description: "Loose-aggressive: plays many hands, applies pressure, bluffs often.",
    aggression: 1.7,
    looseness: 1.5,
    bluffFreq: 0.25,
    sizing: "big",
    temperature: 1.0,
    tiltFactor: 1.4,
  },
  NIT: {
    id: "NIT",
    label: "NIT",
    description: "The rock: folds almost everything, only shows up with premiums.",
    aggression: 0.8,
    looseness: 0.5,
    bluffFreq: 0.02,
    sizing: "standard",
    temperature: 0.5,
    tiltFactor: 1.1,
  },
  STATION: {
    id: "STATION",
    label: "STN",
    description: "Calling station: hates folding, rarely raises, will pay you off.",
    aggression: 0.4,
    looseness: 2.2,
    bluffFreq: 0,
    sizing: "small",
    temperature: 0.8,
    tiltFactor: 1.3,
  },
  MANIAC: {
    id: "MANIAC",
    label: "MNC",
    description: "Maniac: raises everything, overbets, lives on the edge.",
    aggression: 2.5,
    looseness: 2.0,
    bluffFreq: 0.4,
    sizing: "big",
    temperature: 1.3,
    tiltFactor: 1.6,
  },
  FISH: {
    id: "FISH",
    label: "FSH",
    description: "Recreational: loose, unpredictable, chases draws, tilts easily.",
    aggression: 0.9,
    looseness: 1.6,
    bluffFreq: 0.1,
    sizing: "small",
    temperature: 1.6,
    tiltFactor: 1.5,
  },
};

// Fixed name -> personality so the same opponent always plays the same way.
export const AI_PERSONA_BY_NAME: Record<string, keyof typeof PERSONAS> = {
  Marcus: "TAG",
  Sarah: "NIT",
  David: "STATION",
  Elena: "LAG",
  James: "MANIAC",
  Jocelyn: "TAG",
  Luna: "FISH",
  Viktor: "LAG",
  Oliver: "NIT",
  Felix: "STATION",
};

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
      persona: PERSONAS[AI_PERSONA_BY_NAME[name] ?? "TAG"],
      tilt: 1,
      handStartChips: chips,
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
