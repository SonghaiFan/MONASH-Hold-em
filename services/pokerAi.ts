import { Card, GamePhase, Persona, Player } from "../types";
import { PERSONAS } from "../constants";
import { estimateEquity } from "./pokerEvaluator";

// TypeSafe Jev via OpenRouter's Decisions API.
// Jev does not generate text: it answers typed questions (choice / score / noul)
// about a state object and returns calibrated probabilities. Our code owns the
// workflow: we compute equity locally, offer only legal actions, warp the
// returned distribution with the player's persona, sample an action from it,
// and synthesise a short "reasoning" line for the log.
const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const MODEL = "~typesafe/jev-latest";
const API_KEY = process.env.OPENROUTER_API_KEY;
const EQUITY_ITERATIONS = 250;

interface AIDecision {
  action: "fold" | "check" | "call" | "raise";
  amount?: number;
  reasoning?: string;
}

type ActionOption = AIDecision["action"];
type RaiseSizeOption = "min" | "half_pot" | "pot" | "all_in";

interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

interface ChoiceAnswer {
  choice: string;
  probabilities?: Record<string, number>;
  confidence?: number;
}

interface ScoreAnswer {
  score: number;
  probabilities?: number[];
  confidence?: number;
}

interface DecisionAnswers {
  action?: ChoiceAnswer;
  raise_size?: ChoiceAnswer;
  hand_strength?: ScoreAnswer;
}

const HAND_STRENGTH_LEVELS = [
  "Air: no pair, no draw, negligible showdown value (preflop: junk offsuit hands)",
  "Weak: bottom pair, ace-high, or a gutshot only (preflop: weak aces, low offsuit broadways)",
  "Medium: middle pair, top pair with a weak kicker, or a single strong draw such as an open-ender or flush draw (preflop: suited connectors, small pairs, suited broadways)",
  "Strong: top pair with a good kicker, an overpair, two pair, or a combo draw (preflop: TT-JJ, AQ, AJs, KQs)",
  "Monster: a set, straight, flush or better, or a nut draw plus a made hand (preflop: QQ+, AK)",
];
const WEAK_HAND_THRESHOLD = 1.5; // hand_strength at or below this counts as a bluffing hand

// Multipliers applied to the raise_size distribution per sizing preference
const SIZING_WEIGHTS: Record<Persona["sizing"], Record<RaiseSizeOption, number>> = {
  small: { min: 2.0, half_pot: 1.3, pot: 0.7, all_in: 0.4 },
  standard: { min: 1.0, half_pot: 1.0, pot: 1.0, all_in: 1.0 },
  big: { min: 0.5, half_pot: 0.8, pot: 1.5, all_in: 1.4 },
};

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

// --- Distribution helpers ---

// Weights over the offered options, seeded from the model's probabilities or,
// failing that, a one-hot on its chosen option.
const weightsFromAnswer = <T extends string>(
  answer: ChoiceAnswer | undefined,
  options: T[],
  fallback: T
): Record<T, number> => {
  const weights = {} as Record<T, number>;
  let total = 0;
  options.forEach((opt) => {
    const p = answer?.probabilities?.[opt] ?? 0;
    weights[opt] = p > 0 ? p : 0;
    total += weights[opt];
  });
  if (total <= 0) {
    const chosen = options.includes(answer?.choice as T)
      ? (answer!.choice as T)
      : fallback;
    options.forEach((opt) => (weights[opt] = opt === chosen ? 1 : 0));
  }
  return weights;
};

// Temperature-scaled sampling: p_i ∝ w_i^(1/T). T→0 becomes argmax.
const sampleWeighted = <T extends string>(
  weights: Record<T, number>,
  temperature: number
): T => {
  const options = Object.keys(weights) as T[];
  const exponent = 1 / Math.max(temperature, 0.05);
  const scaled = options.map((o) => Math.pow(Math.max(weights[o], 0), exponent));
  const total = scaled.reduce((a, b) => a + b, 0);
  if (total <= 0) return options[0];

  let roll = Math.random() * total;
  for (let i = 0; i < options.length; i++) {
    roll -= scaled[i];
    if (roll <= 0) return options[i];
  }
  return options[options.length - 1];
};

const formatPercent = (value: number | undefined) =>
  value === undefined ? "?" : `${Math.round(value * 100)}%`;

const normalise = <T extends string>(weights: Record<T, number>) => {
  const total = Object.values<number>(weights).reduce((a, b) => a + b, 0);
  const out = {} as Record<T, number>;
  (Object.keys(weights) as T[]).forEach((k) => {
    out[k] = total > 0 ? weights[k] / total : 0;
  });
  return out;
};

// Turns the numbers behind the decision into a one-line explanation for the log.
const buildReasoning = (
  persona: Persona,
  tilt: number,
  equity: number,
  potOdds: number,
  answers: DecisionAnswers,
  finalWeights: Record<ActionOption, number>,
  action: ActionOption,
  raiseLabel?: string
): string => {
  const parts: string[] = [];

  parts.push(tilt > 1.05 ? `${persona.label} (tilted x${tilt.toFixed(1)})` : persona.label);
  parts.push(
    potOdds > 0
      ? `Equity ${equity.toFixed(0)}% vs odds ${potOdds.toFixed(0)}%`
      : `Equity ${equity.toFixed(0)}%`
  );

  if (answers.hand_strength) {
    const strength = answers.hand_strength.score;
    parts.push(
      `Strength ${Number.isInteger(strength) ? strength : strength.toFixed(1)}/${HAND_STRENGTH_LEVELS.length - 1}`
    );
  }

  const mix = (Object.entries(finalWeights) as [ActionOption, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${formatPercent(v)}`)
    .join(" / ");
  parts.push(mix);

  parts.push(
    action === "raise" && raiseLabel
      ? `→ RAISE ${raiseLabel}`
      : `→ ${action.toUpperCase()}`
  );

  return parts.join(" · ");
};

export const getAIDecision = async (
  activePlayer: Player,
  allPlayers: Player[],
  board: Card[],
  pot: number,
  phase: GamePhase,
  currentHighBet: number,
  bigBlind: number,
  handHistory: string[],
  reasoningHistory: string[] = []
): Promise<AIDecision> => {
  const persona = activePlayer.persona ?? PERSONAS.TAG;
  const tilt = activePlayer.tilt ?? 1;

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

  // --- 1. Table snapshot in action order (folded players omitted) ---
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

  // --- 2. Local maths the model should not have to guess ---
  const equity = estimateEquity(
    activePlayer.hand,
    visibleBoard,
    opponentsInHand,
    EQUITY_ITERATIONS
  );

  // --- 3. State object the model reasons about ---
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

  // --- 4. Questions: only legal actions are offered ---
  const actionCriteria: Partial<Record<ActionOption, string>> = {};

  if (toCall > 0) {
    actionCriteria.fold = `Give up the hand. Correct when \`equityPercent\` is clearly below \`potOddsPercent\` (${potOdds.toFixed(1)}%) and you have no profitable raise; more attractive out of position, multiway, or facing a raise-and-barrel line.`;
    actionCriteria.call = `Match the $${toCall} bet. Correct when \`equityPercent\` is at least \`potOddsPercent\` but the hand is not strong enough to raise for value, or when floating in position against a capped range.`;
  } else {
    actionCriteria.check = `Take the free option. Correct with weak or marginal hands, when out of position without a range advantage, or when slow-playing a monster against an aggressive opponent.`;
  }

  const raiseSizes = canRaise
    ? buildRaiseSizes(
        pot,
        toCall,
        currentHighBet,
        minRaiseTotal,
        maxTotal,
        bigBlind
      )
    : {};

  if (canRaise && Object.keys(raiseSizes).length > 0) {
    const verb = toCall > 0 ? "Raise" : "Bet";
    actionCriteria.raise = `${verb} (minimum total $${minRaiseTotal}). Correct with strong made hands and high-equity draws (\`equityPercent\` well above what is needed), or as a bluff only when you have a range advantage and the opponent has shown weakness. Do not bluff multiway or into a raise-and-barrel line.`;
  }

  const questions: Record<string, ChoiceQuestion | ScoreQuestion> = {
    hand_strength: {
      type: "score",
      instructions:
        "Rate the absolute strength of `you.holeCards` given `board` and `street`, ignoring the betting.",
      criteria: HAND_STRENGTH_LEVELS,
    },
    action: {
      type: "choice",
      instructions:
        "You are a game-theory-optimal No-Limit Hold'em player. `equityPercent` is your simulated chance to win at showdown against `opponentsInHand` random hands; adjust it downward when opponents have shown strength via `handHistory`. Compare it with `potOddsPercent`, weigh `you.position` and `tableInActionOrder`, and choose the single highest-EV action. A preflop raiser betting again represents strength; passive lines cap ranges.",
      criteria: actionCriteria as Record<string, string>,
    },
  };

  const sizeLabels: Partial<Record<RaiseSizeOption, string>> = {};
  if (actionCriteria.raise) {
    const sizeCriteria: Record<string, string> = {};
    const describe: Record<RaiseSizeOption, (amt: number) => string> = {
      min: (amt) =>
        `Minimum raise to $${amt}. Cheap probe or small range bet when checked to with a range advantage.`,
      half_pot: (amt) =>
        `About half pot, to $${amt}. Standard value bet on dry boards or a well-sized bluff.`,
      pot: (amt) =>
        `About full pot, to $${amt}. Deny equity on wet boards with strong hands, or polarised pressure.`,
      all_in: (amt) =>
        `All-in for $${amt}. Maximum pressure with the nuts, a short stack, or a combo draw with fold equity.`,
    };
    (Object.entries(raiseSizes) as [RaiseSizeOption, number][]).forEach(
      ([key, amt]) => {
        sizeCriteria[key] = describe[key](amt);
        sizeLabels[key] = key === "all_in" ? "all-in" : key.replace("_", " ");
      }
    );

    questions.raise_size = {
      type: "choice",
      instructions:
        "If you were to bet or raise here, which sizing is best given `pot`, `you.stack`, board texture and how many opponents remain?",
      criteria: sizeCriteria,
    };
  }

  const legalActions = Object.keys(actionCriteria) as ActionOption[];
  const safeDefault: ActionOption = toCall > 0 ? "fold" : "check";

  try {
    if (!API_KEY) throw new Error("OPENROUTER_API_KEY is not set");

    const response = await fetch(DECISIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "MONASH Hold'em",
      },
      body: JSON.stringify({ model: MODEL, state, questions }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Decisions API ${response.status}: ${body}`);
    }

    const { answers } = (await response.json()) as { answers: DecisionAnswers };

    // --- 5. Persona: warp the model's distribution, then sample ---
    const weights = weightsFromAnswer(answers.action, legalActions, safeDefault);
    const strength = answers.hand_strength?.score ?? 2;

    if (weights.raise !== undefined) {
      weights.raise *= persona.aggression * tilt;
      if (strength <= WEAK_HAND_THRESHOLD) weights.raise += persona.bluffFreq;
    }
    if (weights.fold !== undefined) weights.fold /= persona.looseness;

    const finalWeights = normalise(weights);
    let action = sampleWeighted(finalWeights, persona.temperature);
    if (!legalActions.includes(action)) action = safeDefault;

    const decision: AIDecision = { action };
    let raiseLabel: string | undefined;

    if (action === "raise") {
      const sizeOptions = Object.keys(raiseSizes) as RaiseSizeOption[];
      const sizeWeights = weightsFromAnswer(answers.raise_size, sizeOptions, "min");
      sizeOptions.forEach((key) => {
        sizeWeights[key] *= SIZING_WEIGHTS[persona.sizing][key];
        if (key === "all_in") sizeWeights[key] *= tilt; // tilted players shove more
      });
      const sizeKey = sampleWeighted(sizeWeights, persona.temperature);
      const total = raiseSizes[sizeKey] ?? raiseSizes.min ?? minRaiseTotal;
      decision.amount = Math.min(Math.max(total, minRaiseTotal), maxTotal);
      raiseLabel = `${sizeLabels[sizeKey] ?? "min"} ($${decision.amount})`;
    }

    decision.reasoning = buildReasoning(
      persona,
      tilt,
      equity,
      potOdds,
      answers,
      finalWeights,
      action,
      raiseLabel
    );
    return decision;
  } catch (error) {
    console.error("AI Error:", error);
    return { action: safeDefault, reasoning: "Error in AI service." };
  }
};
