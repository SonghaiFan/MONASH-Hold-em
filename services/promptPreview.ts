import { applyVariablePlugins } from "./variablePlugins";
// What one opponent actually reads, street by street, for the prompt editor.
// A fixed sample hand is played through the real situation and request
// builders, so the preview is the request the game would send — not a mock.

import { Card, GamePhase, Player, PlayerStats, Suit } from "../types";
import { AI_MODELS } from "../constants";
import { buildChatRequest, buildDecisionsRequest, modelKindFor, playInstructions } from "./aiProviders";
import { Situation, buildSituation } from "./pokerSituation";
import { PROMPT_FIELDS } from "./promptFields";

export const PREVIEW_STREETS = [GamePhase.PRE_FLOP, GamePhase.FLOP, GamePhase.TURN, GamePhase.RIVER] as const;
export type PreviewStreet = (typeof PREVIEW_STREETS)[number];

const card = (rank: string, suit: Suit): Card => ({ rank, suit, id: `${rank}${suit}` });
const HOLE = [card("A", Suit.Spades), card("K", Suit.Spades)];
const BOARD = [
  card("Q", Suit.Spades),
  card("9", Suit.Diamonds),
  card("4", Suit.Spades),
  card("J", Suit.Hearts),
  card("7", Suit.Diamonds),
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

// The big blind has been at the table a while, so their HUD reads come through
const VILLAIN_STATS: PlayerStats = {
  hands: 42,
  vpipHands: 13,
  pfrHands: 7,
  aggressive: 9,
  passive: 14,
  vpipThisHand: false,
  pfrThisHand: false,
};

interface Spot {
  pot: number;
  highBet: number;
  seat: Partial<Player>; // the opponent being edited, on the button
  bb: Partial<Player>; // the one who stays in with them
  sbFolded: boolean;
  history: string[];
  reads: string[];
}

// One hand from the button with a draw: open preflop, a flush draw facing a
// check on the flop, a combo draw facing a lead on the turn, and a miss
// checked to on the river. Log lines are in the game's own format.
const READ_PRE = "[PRE_FLOP] AKs on the button is a clear open; raise to 3bb.";
const READ_FLOP = "[FLOP] Nut flush draw with two overcards; c-bet half pot as a semi-bluff.";
const READ_TURN = "[TURN] Picked up a gutshot too; the combo draw calls the lead.";

const spots = (name: string): Record<PreviewStreet, Spot> => {
  const pre = [`PRE_FLOP: Leo (UTG) FOLDS`];
  const opened = [...pre, `PRE_FLOP: ${name} (BTN) RAISES to $600`, `PRE_FLOP: Mia (SB) FOLDS`, `PRE_FLOP: Sarah (BB) CALLS $400`];
  const flop = [...opened, `--- FLOP ---`, `FLOP: Sarah (BB) CHECKS`, `FLOP: ${name} (BTN) RAISES to $650`, `FLOP: Sarah (BB) CALLS $650`];
  const turn = [...flop, `--- TURN ---`, `TURN: Sarah (BB) RAISES to $1300`, `TURN: ${name} (BTN) CALLS $1300`];
  return {
    [GamePhase.PRE_FLOP]: {
      pot: 300,
      highBet: 200,
      seat: {},
      bb: { chips: STACK - 200, currentBet: 200, status: "WAITING" },
      sbFolded: false,
      history: pre,
      reads: [],
    },
    [GamePhase.FLOP]: {
      pot: 1300,
      highBet: 0,
      seat: { chips: STACK - 600 },
      bb: { chips: STACK - 600, status: "CHECKED" },
      sbFolded: true,
      history: [...opened, `--- FLOP ---`, `FLOP: Sarah (BB) CHECKS`],
      reads: [READ_PRE],
    },
    [GamePhase.TURN]: {
      pot: 3900,
      highBet: 1300,
      seat: { chips: STACK - 1250 },
      bb: { chips: STACK - 2550, currentBet: 1300, status: "RAISED" },
      sbFolded: true,
      history: [...flop, `--- TURN ---`, `TURN: Sarah (BB) RAISES to $1300`],
      reads: [READ_PRE, READ_FLOP],
    },
    [GamePhase.RIVER]: {
      pot: 5200,
      highBet: 0,
      seat: { chips: STACK - 2550 },
      bb: { chips: STACK - 2550, status: "CHECKED" },
      sbFolded: true,
      history: [...turn, `--- RIVER ---`, `RIVER: Sarah (BB) CHECKS`],
      reads: [READ_PRE, READ_FLOP, READ_TURN],
    },
  };
};

export const sampleBoard = (street: PreviewStreet) =>
  BOARD.slice(0, street === GamePhase.PRE_FLOP ? 0 : street === GamePhase.FLOP ? 3 : street === GamePhase.TURN ? 4 : 5);
export const sampleHole = HOLE;

// Equity is a Monte Carlo estimate — half a second for all four streets — so
// each street is built once per name, when first asked for, and kept.
const built = new Map<string, Situation>();
const keyOf = (name: string, street: PreviewStreet) => `${name}\u0000${street}`;

export const hasSampleSituation = (name: string, street: PreviewStreet) => built.has(keyOf(name, street));

export const sampleSituation = (name: string, street: PreviewStreet): Situation => {
  const key = keyOf(name, street);
  const cached = built.get(key);
  if (cached) return { ...cached, state: applyVariablePlugins(cached.state) };
  const spot = spots(name)[street];
  const seat = player({ id: "seat", name, position: "BTN", isDealer: true, hand: HOLE, ...spot.seat });
  const sb = player({
    id: "sb",
    name: "Mia",
    position: "SB",
    currentBet: spot.sbFolded ? 0 : 100,
    chips: STACK - 100,
    status: spot.sbFolded ? "FOLDED" : "WAITING",
  });
  const bb = player({ id: "bb", name: "Sarah", position: "BB", stats: VILLAIN_STATS, ...spot.bb });
  const utg = player({ id: "utg", name: "Leo", position: "UTG", status: "FOLDED" });
  const situation = buildSituation(seat, [seat, sb, bb, utg], BOARD, spot.pot, street, spot.highBet, BIG_BLIND, spot.history, spot.reads);
  built.set(key, situation);
  return situation;
};

// ---------- Reading a name out of `state` ----------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const walk = (root: unknown, parts: string[]): unknown => {
  let cur: unknown = root;
  for (const raw of parts) {
    const list = raw.endsWith("[]");
    const key = list ? raw.slice(0, -2) : raw;
    if (Array.isArray(cur)) {
      const picked = cur.map((e) => (isObject(e) ? e[key] : undefined)).filter((v) => v !== undefined);
      cur = picked.length ? picked : undefined;
    } else if (isObject(cur)) {
      cur = cur[key];
    } else {
      return undefined;
    }
    if (cur === undefined) return undefined;
  }
  return cur;
};

// What a backtick name holds in this spot: `you.madeHand`, `state.pot`,
// `tableInActionOrder[].reads`, or a key inside list entries on its own (`reads`).
// undefined when the field is not there on this street.
export const valueAt = (state: Record<string, unknown>, name: string): unknown => {
  const clean = name.trim().replace(/^state\./, "");
  if (clean === "state") return state;
  const direct = walk(state, clean.split("."));
  if (direct !== undefined) return direct;
  // A bare child key: look for it inside the list fields that carry it
  const owner = PROMPT_FIELDS.find((f) => f.children?.includes(clean) || f.path.endsWith(`.${clean}`));
  if (!owner) return undefined;
  const base = owner.path.endsWith(`.${clean}`) ? owner.path : `${owner.path}.${clean}`;
  return walk(state, base.split("."));
};

// A value written the way the field list shows its examples: { key: value }, [a, b]
const compact = (v: unknown, nested: boolean): string => {
  if (typeof v === "string") return nested ? JSON.stringify(v) : v;
  if (Array.isArray(v)) return `[${v.map((x) => compact(x, true)).join(", ")}]`;
  if (isObject(v)) return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${compact(x, true)}`).join(", ")} }`;
  return String(v);
};

// A value as one short line, for pills, tooltips and the variable list
export const formatValue = (v: unknown, max = 90): string => {
  if (v === undefined) return "—";
  const text = compact(v, false);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

// ---------- The request, in parts ----------

// A rough count — about four characters a token for English and JSON.
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export interface PromptParts {
  kind: "chat" | "decisions";
  yours: string; // the words the player controls
  rules: string; // what the game adds: answer shape, legal actions, sizes
  table: string; // the situation, pretty-printed for reading
  tokens: { yours: number; rules: number; table: number; total: number };
  legal: string[];
}

// The exact JSON body produced by the same builder used for the live model
// call. Authentication headers are intentionally outside this body.
export const rawRequestBody = (situation: Situation, modelId: string, prompt: string) =>
  JSON.stringify(
    modelKindFor(modelId) === "decisions"
      ? buildDecisionsRequest(situation, modelId, prompt)
      : buildChatRequest(situation, modelId, prompt),
    null,
    2
  );

export const promptParts = (situation: Situation, modelId: string, prompt: string): PromptParts => {
  let table: string;
  let tableSent: string;
  let yours: string;
  let rules: string;
  let rulesSent: string;

  if (modelKindFor(modelId) === "decisions") {
    table = JSON.stringify(situation.state, null, 2);
    tableSent = JSON.stringify({ state: situation.state });
    yours = playInstructions(prompt);
    const req = buildDecisionsRequest(situation, modelId, prompt);
    const questions = req.questions as Record<string, Record<string, unknown>>;
    const shown = { ...questions, action: { ...questions.action, instructions: "↑ your prompt" } };
    rules = JSON.stringify(shown, null, 2);
    rulesSent = JSON.stringify({ ...questions, action: { ...questions.action, instructions: "" } });
  } else {
    const req = buildChatRequest(situation, modelId, prompt);
    const system = req.messages[0].content;
    tableSent = req.messages[1].content;
    table = JSON.stringify(JSON.parse(tableSent), null, 2);
    yours = system;
    rules = JSON.stringify(req.response_format, null, 2);
    rulesSent = JSON.stringify(req.response_format);
  }

  const tokens = {
    yours: estimateTokens(yours),
    rules: estimateTokens(rulesSent),
    table: estimateTokens(tableSent),
    total: 0,
  };
  tokens.total = tokens.yours + tokens.rules + tokens.table;

  return { kind: modelKindFor(modelId), yours, rules, table, tokens, legal: situation.legalActions };
};

// USD for one decision: the prompt in, and a short structured answer out.
const ANSWER_TOKENS = 80;
export const costPerDecision = (modelId: string, inputTokens: number) => {
  const m = AI_MODELS.find((x) => x.id === modelId);
  if (!m) return 0;
  return (inputTokens * m.pricePerM.input + ANSWER_TOKENS * m.pricePerM.output) / 1e6;
};
