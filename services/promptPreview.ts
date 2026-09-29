// What one opponent actually reads, street by street, for the prompt tuner.
// A fixed sample hand is played through the real situation and request
// builders, so the preview is the request the game would send — not a mock.

import { Card, GamePhase, Player, Suit } from "../types";
import { AI_MODELS } from "../constants";
import { buildChatRequest, buildDecisionsRequest, modelKindFor, playInstructions } from "./aiProviders";
import { Situation, buildSituation } from "./pokerSituation";

export const PREVIEW_STREETS = [GamePhase.PRE_FLOP, GamePhase.FLOP, GamePhase.TURN, GamePhase.RIVER] as const;
export type PreviewStreet = (typeof PREVIEW_STREETS)[number];

const card = (rank: string, suit: Suit): Card => ({ rank, suit, id: `${rank}${suit}` });
const HOLE = [card("A", Suit.Spades), card("Q", Suit.Hearts)];
const BOARD = [
  card("Q", Suit.Clubs),
  card("9", Suit.Diamonds),
  card("4", Suit.Spades),
  card("2", Suit.Hearts),
  card("7", Suit.Spades),
];
const BIG_BLIND = 200;
const STACK = 10000;

const player = (p: Partial<Player> & Pick<Player, "id" | "name" | "position">): Player => ({
  isHuman: false,
  chips: STACK,
  hand: [],
  status: "WAITING",
  isDealer: false,
  isActive: true,
  currentBet: 0,
  ...p,
});

interface Spot {
  pot: number;
  highBet: number;
  hero: Partial<Player>;
  you: Partial<Player>;
  sbFolded: boolean;
  history: string[];
}

// One hand: raise on the button, c-bet the flop, face a turn lead, checked to on the river.
const SPOTS: Record<PreviewStreet, Spot> = {
  [GamePhase.PRE_FLOP]: {
    pot: 300,
    highBet: 200,
    hero: { chips: STACK },
    you: { chips: STACK - 200, currentBet: 200, status: "WAITING" },
    sbFolded: false,
    history: ["SB posts $100", "You (BB) post $200"],
  },
  [GamePhase.FLOP]: {
    pot: 1300,
    highBet: 0,
    hero: { chips: STACK - 600 },
    you: { chips: STACK - 600, status: "CHECKED" },
    sbFolded: true,
    history: ["BTN raises to $600", "SB folds", "You (BB) call $400", "Flop: You check"],
  },
  [GamePhase.TURN]: {
    pot: 3900,
    highBet: 1300,
    hero: { chips: STACK - 1250 },
    you: { chips: STACK - 2550, currentBet: 1300, status: "RAISED" },
    sbFolded: true,
    history: ["BTN raises to $600", "SB folds", "You (BB) call", "Flop: You check, BTN bets $650, You call", "Turn: You bet $1300"],
  },
  [GamePhase.RIVER]: {
    pot: 5200,
    highBet: 0,
    hero: { chips: STACK - 2550 },
    you: { chips: STACK - 2550, status: "CHECKED" },
    sbFolded: true,
    history: ["BTN raises to $600", "You (BB) call", "Flop: BTN bets $650, You call", "Turn: You bet $1300, BTN calls", "River: You check"],
  },
};

export const sampleHole = HOLE;
export const sampleBoard = (street: PreviewStreet) =>
  BOARD.slice(0, street === GamePhase.PRE_FLOP ? 0 : street === GamePhase.FLOP ? 3 : street === GamePhase.TURN ? 4 : 5);

// Equity is a Monte Carlo estimate, so build these once and keep them.
export const buildSampleSituations = (name: string): Record<PreviewStreet, Situation> => {
  const out = {} as Record<PreviewStreet, Situation>;
  PREVIEW_STREETS.forEach((street) => {
    const spot = SPOTS[street];
    const hero = player({ id: "seat", name, position: "BTN", isDealer: true, hand: HOLE, ...spot.hero });
    const sb = player({
      id: "sb",
      name: "SB",
      position: "SB",
      currentBet: spot.sbFolded ? 0 : 100,
      chips: STACK - 100,
      status: spot.sbFolded ? "FOLDED" : "WAITING",
    });
    const you = player({ id: "hero", name: "You", position: "BB", isHuman: true, ...spot.you });
    out[street] = buildSituation(hero, [hero, sb, you], BOARD, spot.pot, street, spot.highBet, BIG_BLIND, spot.history);
  });
  return out;
};

// A rough count — about four characters a token for English and JSON.
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export interface PromptParts {
  kind: "chat" | "decisions";
  yours: string; // the words the player controls
  rules: string; // what the game adds: answer shape, legal actions, sizes
  table: string; // the situation, pretty-printed for reading
  tokens: { yours: number; rules: number; table: number; total: number };
  legal: string[];
  sizes: string[];
}

export const promptParts = (situation: Situation, modelId: string, prompt: string): PromptParts => {
  const yours = playInstructions(prompt);
  const table = JSON.stringify(situation.state, null, 2);
  const tableSent = JSON.stringify({ state: situation.state });
  let rules: string;
  let rulesSent: string;

  if (modelKindFor(modelId) === "decisions") {
    const req = buildDecisionsRequest(situation, modelId, prompt);
    const questions = req.questions as Record<string, Record<string, unknown>>;
    const shown = { ...questions, action: { ...questions.action, instructions: "↑ your words" } };
    rules = JSON.stringify(shown, null, 2);
    rulesSent = JSON.stringify({ ...questions, action: { ...questions.action, instructions: "" } });
  } else {
    const req = buildChatRequest(situation, modelId, prompt);
    const system = req.messages[0].content;
    rules = system.slice(yours.length).trim();
    rulesSent = rules + JSON.stringify(req.response_format);
  }

  const tokens = {
    yours: estimateTokens(yours),
    rules: estimateTokens(rulesSent),
    table: estimateTokens(tableSent),
    total: 0,
  };
  tokens.total = tokens.yours + tokens.rules + tokens.table;

  return {
    kind: modelKindFor(modelId),
    yours,
    rules,
    table,
    tokens,
    legal: situation.legalActions,
    sizes: Object.keys(situation.sizeCriteria),
  };
};

// USD for one decision: the prompt in, and a short structured answer out.
const ANSWER_TOKENS = 80;
export const costPerDecision = (modelId: string, inputTokens: number) => {
  const m = AI_MODELS.find((x) => x.id === modelId);
  if (!m) return 0;
  return (inputTokens * m.pricePerM.input + ANSWER_TOKENS * m.pricePerM.output) / 1e6;
};

// Fields of `state` a prompt can point at with backticks.
export const REFERABLE_FIELDS = [
  "equityPercent",
  "potOddsPercent",
  "toCall",
  "pot",
  "you.position",
  "you.stackInBigBlinds",
  "board",
  "opponentsInHand",
  "handHistory",
  "tableInActionOrder",
];

// Backtick references in a prompt, e.g. `equityPercent` → "equityPercent".
export const referencedFields = (text: string) =>
  Array.from(new Set(Array.from(text.matchAll(/`([\w.]+)`/g), (m) => m[1])));
