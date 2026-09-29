// Preflop from a hand chart, not a model.
//
// Every starting hand has a place in one ranking of the 169 (best first); its
// percentile is where it sits among all 1,326 two-card combos. A style says how
// often it plays (VPIP) and raises (PFR); position widens or narrows that, and
// each raise in front narrows it again. A hand inside the raising range raises,
// inside the playing range calls, otherwise folds — blended at the edges so the
// same hand isn't played identically every time.
//
// The point is that the numbers are targets: a style set to play 22% of hands
// plays about 22% of hands. That's rules, not intuition, so it costs nothing,
// takes no time, and needs no model. The model takes over from the flop.

import { Card, Persona, Player, Suit } from "../types";
import type { ActionOption, Situation } from "./pokerSituation";

// The 169 hands, best to worst: the average of each hand's equity rank against
// one and against two random hands (Monte Carlo, 5,000 and 3,000 deals each).
const HAND_ORDER = "AA KK QQ JJ TT 99 AKs 88 AQs AJs 77 AKo AQo ATs AJo KQs KJs ATo A9s KTs 66 KQo A7s QJs KJo A5s KTo A8s A9o QTs K9s A6s 55 A3s QJo A4s A8o K8s K7s QTo JTs A7o J9s A5o Q9s K9o A6o Q8s K6s A4o A2s K7o K8o Q9o J8s 44 K3s K5s JTo A3o T9s A2o K4s Q7s K2s Q8o Q6s K6o J9o 33 T8s Q5s 98s K5o Q4s J7s T9o K4o Q7o J8o K3o T7s Q6o T8o Q3s J6s 87s 22 K2o Q2s J5s 97s 98o T6s J7o J3s 96s Q5o T7o T5s J6o J4s 85s Q3o 76s 86s J2s T4s Q4o 95s 97o J5o Q2o T6o 87o T3s 65s T2s 75s 86o J4o J3o 94s 96o 54s 84s 93s J2o T4o 74s 92s 64s 76o T5o 85o 53s 95o T2o T3o 63s 83s 73s 75o 65o 43s 62s 93o 94o 64o 54o 82s 72s 74o 84o 52s 92o 53o 32s 63o 73o 42s 83o 43o 82o 62o 42o 72o 52o 32o".split(" ");

const RANKS = "AKQJT98765432";
const combosOf = (code: string) => (code.length === 2 ? 6 : code.endsWith("s") ? 4 : 12);

// Midpoint of each hand's combos in the cumulative order: 0 is the best, 1 the worst
const PERCENTILE: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let before = 0;
  HAND_ORDER.forEach((code) => {
    const n = combosOf(code);
    out[code] = (before + n / 2) / 1326;
    before += n;
  });
  return out;
})();

const rankChar = (r: string) => (r === "10" ? "T" : r.trim().toUpperCase());

// "AKs", "T9o", "77"
export const handCode = (cards: Card[]): string => {
  const [a, b] = cards.map((c) => rankChar(c.rank)).sort((x, y) => RANKS.indexOf(x) - RANKS.indexOf(y));
  if (a === b) return a + b;
  return a + b + (cards[0].suit === cards[1].suit ? "s" : "o");
};

export const handPercentile = (cards: Card[]): number => PERCENTILE[handCode(cards)] ?? 1;

// --- Ranges as card combos, for equity against an estimated range ---

const SUIT_LIST = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs];
const toRank = (ch: string) => (ch === "T" ? "10" : ch);
const card = (rank: string, suit: Suit): Card => ({ rank, suit, id: `${rank}${suit}` });

const combosOf169 = (code: string): Card[][] => {
  const a = toRank(code[0]);
  const b = toRank(code[1]);
  const out: Card[][] = [];
  if (code.length === 2) {
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) out.push([card(a, SUIT_LIST[i]), card(b, SUIT_LIST[j])]);
  } else if (code[2] === "s") {
    SUIT_LIST.forEach((s) => out.push([card(a, s), card(b, s)]));
  } else {
    SUIT_LIST.forEach((s1) => SUIT_LIST.forEach((s2) => s1 !== s2 && out.push([card(a, s1), card(b, s2)])));
  }
  return out;
};

const rangeCache = new Map<number, Card[][]>();

// Every combo of the hands in the top `width` of starting hands (0..1). Never
// empty: the narrowest range is still aces.
export const combosInRange = (width: number): Card[][] => {
  const key = Math.round(clamp(width, 0, 1) * 200) / 200;
  const hit = rangeCache.get(key);
  if (hit) return hit;
  const codes = HAND_ORDER.filter((code) => PERCENTILE[code] <= key);
  const combos = (codes.length ? codes : [HAND_ORDER[0]]).flatMap(combosOf169);
  rangeCache.set(key, combos);
  return combos;
};

// How much wider or narrower than its average a style plays from each seat.
const POSITION_WIDTH: Record<string, number> = {
  UTG: 0.55,
  "UTG+1": 0.6,
  "UTG+2": 0.65,
  "UTG+3": 0.7,
  "UTG+4": 0.75,
  HJ: 0.8,
  CO: 1.05,
  BTN: 1.45,
  SB: 0.95,
  BB: 1.35,
};

// The seats at a table of n, named as the game names them (see getPositionLabel
// in PokerGame / pokerEngine): button, blinds, then UTG… up to HJ and CO.
const positionsAt = (n: number): string[] => {
  if (n <= 2) return ["SB", "BB"];
  const names = ["BTN", "SB", "BB"];
  for (let offset = 3; offset < n; offset++) {
    const fromButton = n - offset;
    if (fromButton === 1) names.push("CO");
    else if (fromButton === 2 && n >= 5) names.push("HJ");
    else names.push(offset === 3 ? "UTG" : `UTG+${offset - 3}`);
  }
  return names;
};

const widthOf = (position: string) => POSITION_WIDTH[position] ?? 0.8;
const meanWidth = (n: number) => {
  const seats = positionsAt(n);
  return seats.reduce((sum, p) => sum + widthOf(p), 0) / seats.length;
};
const SIX_MAX_MEAN = meanWidth(6);

// A seat's width, normalised so an orbit averages the same at any table size:
// a style's targets are its numbers heads-up, six-handed or nine. (Otherwise a
// three-handed table, all button and blinds, would play far looser.)
const positionWidth = (position: string, seatsDealt: number) =>
  (widthOf(position) * SIX_MAX_MEAN) / meanWidth(Math.max(2, seatsDealt));

// Raises in front take hands away from everyone behind, so ranges drawn at
// exactly the targets come out short — tight styles most of all, since they
// act into the most raises. The curve widens them back (more for smaller
// targets) to land on target at a typical table. Fitted by simulating the six
// styles together, stacks reset to 100bb each hand.
const CALIBRATION = {
  play: { scale: 1.33, pivot: 0.3, bend: -0.1 },
  raise: { scale: 1.55, pivot: 0.2, bend: -0.12 },
};
const calibrated = (target: number, c: { scale: number; pivot: number; bend: number }) =>
  target * c.scale * Math.pow(target / c.pivot, c.bend);

const SIZING_OPEN: Record<Persona["sizing"], number> = { small: 2.2, standard: 2.5, big: 3.2 };
const SHOVE_BB = 12; // at or under this many big blinds, a raise is all-in

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Soft edge: ~1 well inside the range, ~0 well outside, mixing near the line.
// The edge scales with the range, so a narrow 4-bet range stays crisp; a
// hotter-headed style blurs it more.
const inRange = (percentile: number, width: number, temperature: number) => {
  if (width <= 0) return 0;
  const edge = Math.max(0.004, width * (0.06 + 0.08 * temperature));
  return 1 / (1 + Math.exp(-(width - percentile) / edge));
};

export interface ChartDecision {
  action: ActionOption;
  amount?: number;
  reasoning: string;
}

// The chart's call for this spot, or null if the style has no targets (then
// the model decides preflop too).
export const preflopDecision = (
  situation: Situation,
  player: Player,
  persona: Persona,
  tilt: number,
  currentHighBet: number,
  bigBlind: number,
  seatsDealt: number
): ChartDecision | null => {
  if (persona.vpip === undefined || persona.pfr === undefined || player.hand.length !== 2) return null;

  const state = situation.state as {
    you: { position: string; stackInBigBlinds: number };
    handHistory: string[];
  };
  const position = state.you.position;
  const preflop = state.handHistory.filter((h) => h.startsWith("PRE_FLOP:"));
  const raises = preflop.filter((h) => h.includes("RAISES") || h.includes("-BETS")).length;
  const limpers = raises === 0 ? preflop.filter((h) => h.includes("CALLS")).length : 0;

  const code = handCode(player.hand);
  const p = handPercentile(player.hand);
  const width = positionWidth(position, seatsDealt);

  // Opening ranges from the targets; every raise in front cuts them down, and
  // a cheap price to continue (the big blind, a min-raise) opens them back up
  const openPlay = calibrated(persona.vpip, CALIBRATION.play) * width;
  const openRaise = calibrated(persona.pfr, CALIBRATION.raise) * width * tilt;
  const price = situation.potOdds / 100;
  const odds = situation.toCall > 0 ? clamp(0.3 / Math.max(price, 0.08), 0.6, 2.5) : 1;
  // Callers call raises: the more of a style's hands are calls rather than
  // raises, the less a raise in front scares it off
  const passive = 1 - persona.pfr / persona.vpip;
  const CUTS = [
    { raise: 1, play: 1 }, // unopened
    { raise: 0.28, play: 0.45 + 0.35 * passive }, // facing an open: 3-bet / call
    { raise: 0.1, play: 0.18 + 0.2 * passive }, // facing a 3-bet: 4-bet / call
    { raise: 0.05, play: 0.08 }, // facing a 4-bet or more
  ];
  const cut = CUTS[Math.min(raises, CUTS.length - 1)];
  // Aces and kings (queens, nearly) carry on against any raise, whoever holds them
  const floor = raises > 0 ? 0.02 : 0;
  const raiseWidth = clamp(Math.max(openRaise * cut.raise, floor), 0, 1);
  const playWidth = clamp(Math.max(openPlay * cut.play * (raises > 0 ? odds : 1), raiseWidth, floor), 0, 1);

  const canRaise = situation.legalActions.includes("raise");
  const pRaise = canRaise ? inRange(p, raiseWidth, persona.temperature) : 0;
  const pPlay = Math.max(pRaise, inRange(p, playWidth, persona.temperature));

  const roll = Math.random();
  let action: ActionOption = roll < pRaise ? "raise" : roll < pPlay ? "call" : "fold";

  // Free to see a flop: a fold is a check
  if (action === "fold" && situation.toCall <= 0) action = "check";
  if (action === "call" && situation.toCall <= 0) action = "check";
  if (!situation.legalActions.includes(action)) action = situation.safeDefault;

  let amount: number | undefined;
  if (action === "raise") {
    const stackBB = state.you.stackInBigBlinds;
    let total =
      raises === 0
        ? bigBlind * (SIZING_OPEN[persona.sizing] + limpers)
        : currentHighBet * (raises === 1 ? 3 : 2.3) * (persona.sizing === "big" ? 1.15 : 1);
    total = Math.round(total / bigBlind) * bigBlind;
    // Short, or committing a big share anyway: just move in
    if (stackBB <= SHOVE_BB || total >= situation.maxTotal * 0.4) total = situation.maxTotal;
    amount = clamp(total, situation.minRaiseTotal, situation.maxTotal);
  }

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const spot = raises === 0 ? (limpers ? `${limpers} limper${limpers > 1 ? "s" : ""}` : "unopened") : raises === 1 ? "facing a raise" : `facing ${raises + 1}-bet`;
  const reasoning = [
    `${persona.label} chart`,
    `${code} is top ${pct(p)}`,
    `${position}, ${spot}: raise top ${pct(raiseWidth)}, play top ${pct(playWidth)}`,
    `→ ${action.toUpperCase()}${amount ? ` to $${amount}` : ""}`,
  ].join(" · ");

  return { action, amount, reasoning };
};
