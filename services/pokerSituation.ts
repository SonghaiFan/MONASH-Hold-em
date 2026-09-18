import { Card, GamePhase, Player } from "../types";
import { estimateEquity } from "./pokerEvaluator";

// Everything a model (of either kind) needs to judge one decision, computed
// once in code so the model never has to do arithmetic or guess what is legal.

export type ActionOption = "fold" | "check" | "call" | "raise";
export type RaiseSizeOption = "min" | "half_pot" | "pot" | "all_in";

export const EQUITY_ITERATIONS = 250;

export const HAND_STRENGTH_LEVELS = [
  "Air: no pair, no draw, negligible showdown value (preflop: junk offsuit hands)",
  "Weak: bottom pair, ace-high, or a gutshot only (preflop: weak aces, low offsuit broadways)",
  "Medium: middle pair, top pair with a weak kicker, or a single strong draw such as an open-ender or flush draw (preflop: suited connectors, small pairs, suited broadways)",
  "Strong: top pair with a good kicker, an overpair, two pair, or a combo draw (preflop: TT-JJ, AQ, AJs, KQs)",
  "Monster: a set, straight, flush or better, or a nut draw plus a made hand (preflop: QQ+, AK)",
];

export const ACTION_INSTRUCTIONS =
  "You are a game-theory-optimal No-Limit Hold'em player. `equityPercent` is your simulated chance to win at showdown against `opponentsInHand` random hands; adjust it downward when opponents have shown strength via `handHistory`. Compare it with `potOddsPercent`, weigh `you.position` and `tableInActionOrder`, and choose the single highest-EV action. A preflop raiser betting again represents strength; passive lines cap ranges.";

export const HAND_STRENGTH_INSTRUCTIONS =
  "Rate the absolute strength of `you.holeCards` given `board` and `street`, ignoring the betting.";

export const RAISE_SIZE_INSTRUCTIONS =
  "If you were to bet or raise here, which sizing is best given `pot`, `you.stack`, board texture and how many opponents remain?";

export interface Situation {
  state: Record<string, unknown>;
  toCall: number;
  potOdds: number;
  equity: number;
  minRaiseTotal: number;
  maxTotal: number;
  legalActions: ActionOption[];
  actionCriteria: Record<string, string>;
  raiseSizes: Partial<Record<RaiseSizeOption, number>>;
  sizeCriteria: Record<string, string>;
  safeDefault: ActionOption;
}

const formatCards = (cards: Card[]) =>
  cards.map((c) => `${c.rank}${c.suit}`).join(" ");

// Helper: Calculate standard Pot Odds
const calculatePotOdds = (toCall: number, currentPot: number): number => {
  if (toCall <= 0) return 0;
  return (toCall / (currentPot + toCall)) * 100;
};

// Helper: Sort players by action order for the current street
const getSortedPlayersByActionOrder = (
  players: Player[],
  dealerIndex: number,
  phase: GamePhase
) => {
  const total = players.length;
  // Pre-flop starts after BB (Dealer + 3), Post-flop starts after Dealer (Dealer + 1)
  const offset = phase === GamePhase.PRE_FLOP ? 3 : 1;
  const startIndex = (dealerIndex + offset) % total;

  const sorted: Player[] = [];
  for (let i = 0; i < total; i++) {
    sorted.push(players[(startIndex + i) % total]);
  }
  return sorted;
};

const describeStatus = (p: Player): string => {
  if (p.status === "ELIMINATED") return "Eliminated";
  if (p.status === "ALL-IN") return `All-in for $${p.currentBet}`;
  if (p.status === "CHECKED") return "Checked";
  if (p.status === "CALLED") return `Called $${p.currentBet}`;
  if (p.status === "RAISED") return `Raised to $${p.currentBet}`;
  // WAITING / THINKING / ACTING
  return p.currentBet > 0
    ? `Posted $${p.currentBet}, yet to act`
    : "Yet to act";
};

const snapToBlind = (amount: number, bigBlind: number) =>
  Math.round(amount / bigBlind) * bigBlind;

// Builds the raise-size menu the model can pick from, each mapped to a total bet.
// Sizes that collapse into each other (short stacks) are de-duplicated.
const buildRaiseSizes = (
  pot: number,
  toCall: number,
  currentHighBet: number,
  minRaiseTotal: number,
  maxTotal: number,
  bigBlind: number
): Partial<Record<RaiseSizeOption, number>> => {
  const potAfterCall = pot + toCall;
  const clamp = (total: number) =>
    Math.min(maxTotal, Math.max(minRaiseTotal, snapToBlind(total, bigBlind)));

  const candidates: [RaiseSizeOption, number][] = [
    ["min", minRaiseTotal],
    ["half_pot", clamp(currentHighBet + potAfterCall * 0.5)],
    ["pot", clamp(currentHighBet + potAfterCall)],
    ["all_in", maxTotal],
  ];

  const sizes: Partial<Record<RaiseSizeOption, number>> = {};
  const seen = new Set<number>();
  candidates.forEach(([key, total]) => {
    if (total < minRaiseTotal || total > maxTotal || seen.has(total)) return;
    seen.add(total);
    sizes[key] = total;
  });
  return sizes;
};

const SIZE_DESCRIPTIONS: Record<RaiseSizeOption, (amt: number) => string> = {
  min: (amt) =>
    `Minimum raise to $${amt}. Cheap probe or small range bet when checked to with a range advantage.`,
  half_pot: (amt) =>
    `About half pot, to $${amt}. Standard value bet on dry boards or a well-sized bluff.`,
  pot: (amt) =>
    `About full pot, to $${amt}. Deny equity on wet boards with strong hands, or polarised pressure.`,
  all_in: (amt) =>
    `All-in for $${amt}. Maximum pressure with the nuts, a short stack, or a combo draw with fold equity.`,
};

export const buildSituation = (
  activePlayer: Player,
  allPlayers: Player[],
  board: Card[],
  pot: number,
  phase: GamePhase,
  currentHighBet: number,
  bigBlind: number,
  handHistory: string[],
  reasoningHistory: string[] = []
): Situation => {
  const toCall = Math.min(
    currentHighBet - activePlayer.currentBet,
    activePlayer.chips
  );
  const potOdds = calculatePotOdds(toCall, pot);
  const maxTotal = activePlayer.chips + activePlayer.currentBet;
  const minRaiseTotal = Math.min(currentHighBet + bigBlind, maxTotal);
  const canRaise = activePlayer.chips > toCall && maxTotal > currentHighBet;

  // Filter visible board
  let visibleBoard: Card[] = [];
  if (phase === GamePhase.FLOP) visibleBoard = board.slice(0, 3);
  else if (phase === GamePhase.TURN) visibleBoard = board.slice(0, 4);
  else if (phase === GamePhase.RIVER || phase === GamePhase.SHOWDOWN)
    visibleBoard = board.slice(0, 5);

  // --- Table snapshot in action order (folded players omitted) ---
  const dealerIndex = allPlayers.findIndex((p) => p.isDealer);
  const tablePlayers = getSortedPlayersByActionOrder(
    allPlayers,
    dealerIndex !== -1 ? dealerIndex : 0,
    phase
  )
    .filter((p) => p.status !== "FOLDED" && p.status !== "ELIMINATED")
    .map((p) => ({
      name: p.name,
      position: p.isDealer ? "BTN" : p.position,
      status: describeStatus(p),
      stack: p.chips,
      isYou: p.id === activePlayer.id,
    }));

  const opponentsInHand = Math.max(
    1,
    tablePlayers.filter((p) => !p.isYou).length
  );

  // --- Local maths the model should not have to guess ---
  const equity = estimateEquity(
    activePlayer.hand,
    visibleBoard,
    opponentsInHand,
    EQUITY_ITERATIONS
  );

  const state = {
    game: "No-Limit Texas Hold'em, cash-style table",
    street: phase,
    you: {
      name: activePlayer.name,
      position: activePlayer.isDealer ? "BTN" : activePlayer.position,
      holeCards: formatCards(activePlayer.hand),
      stack: activePlayer.chips,
      stackInBigBlinds: Number((activePlayer.chips / bigBlind).toFixed(1)),
      alreadyBetThisStreet: activePlayer.currentBet,
    },
    board: visibleBoard.length ? formatCards(visibleBoard) : "none (preflop)",
    pot,
    toCall,
    potOddsPercent: Number(potOdds.toFixed(1)),
    equityPercent: Number(equity.toFixed(1)),
    equityMinusPotOdds: Number((equity - potOdds).toFixed(1)),
    bigBlind,
    opponentsInHand,
    minRaiseTotal,
    maxBetTotal: maxTotal,
    tableInActionOrder: tablePlayers,
    handHistory: handHistory.length ? handHistory : ["No actions yet."],
    yourEarlierReads: reasoningHistory,
  };

  // --- Only legal actions are offered ---
  const actionCriteria: Partial<Record<ActionOption, string>> = {};

  if (toCall > 0) {
    actionCriteria.fold = `Give up the hand. Correct when \`equityPercent\` is clearly below \`potOddsPercent\` (${potOdds.toFixed(1)}%) and you have no profitable raise; more attractive out of position, multiway, or facing a raise-and-barrel line.`;
    actionCriteria.call = `Match the $${toCall} bet. Correct when \`equityPercent\` is at least \`potOddsPercent\` but the hand is not strong enough to raise for value, or when floating in position against a capped range.`;
  } else {
    actionCriteria.check = `Take the free option. Correct with weak or marginal hands, when out of position without a range advantage, or when slow-playing a monster against an aggressive opponent.`;
  }

  const raiseSizes = canRaise
    ? buildRaiseSizes(pot, toCall, currentHighBet, minRaiseTotal, maxTotal, bigBlind)
    : {};

  const sizeCriteria: Record<string, string> = {};
  if (canRaise && Object.keys(raiseSizes).length > 0) {
    const verb = toCall > 0 ? "Raise" : "Bet";
    actionCriteria.raise = `${verb} (minimum total $${minRaiseTotal}). Correct with strong made hands and high-equity draws (\`equityPercent\` well above what is needed), or as a bluff only when you have a range advantage and the opponent has shown weakness. Do not bluff multiway or into a raise-and-barrel line.`;
    (Object.entries(raiseSizes) as [RaiseSizeOption, number][]).forEach(
      ([key, amt]) => {
        sizeCriteria[key] = SIZE_DESCRIPTIONS[key](amt);
      }
    );
  }

  return {
    state,
    toCall,
    potOdds,
    equity,
    minRaiseTotal,
    maxTotal,
    legalActions: Object.keys(actionCriteria) as ActionOption[],
    actionCriteria: actionCriteria as Record<string, string>,
    raiseSizes,
    sizeCriteria,
    safeDefault: toCall > 0 ? "fold" : "check",
  };
};
