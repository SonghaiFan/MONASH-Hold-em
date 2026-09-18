import { Card, GamePhase, Persona, Player } from "../types";
import { AI_MODELS, RAW_PERSONA } from "../constants";
import { ModelJudgement, runModel } from "./aiProviders";
import {
  ActionOption,
  HAND_STRENGTH_LEVELS,
  RaiseSizeOption,
  Situation,
  buildSituation,
} from "./pokerSituation";

// The decision pipeline for an AI opponent:
//   buildSituation  → everything computable (equity, pot odds, legal actions)
//   runModel        → a ModelJudgement (probabilities) from Jev or a chat model
//   persona layer   → warp the distribution, sample, map to chips, write a log line
// Our code owns the workflow; the model is asked only for judgement.

const API_KEY = process.env.OPENROUTER_API_KEY;
const WEAK_HAND_THRESHOLD = 1.5; // hand_strength at or below this counts as a bluffing hand

interface AIDecision {
  action: ActionOption;
  amount?: number;
  reasoning?: string;
}

// Multipliers applied to the raise_size distribution per sizing preference
const SIZING_WEIGHTS: Record<Persona["sizing"], Record<RaiseSizeOption, number>> = {
  small: { min: 2.0, half_pot: 1.3, pot: 0.7, all_in: 0.4 },
  standard: { min: 1.0, half_pot: 1.0, pot: 1.0, all_in: 1.0 },
  big: { min: 0.5, half_pot: 0.8, pot: 1.5, all_in: 1.4 },
};

const SIZE_LABELS: Record<RaiseSizeOption, string> = {
  min: "min",
  half_pot: "half pot",
  pot: "pot",
  all_in: "all-in",
};

// --- Distribution helpers ---

// Weights over the offered options, seeded from the model's probabilities or,
// failing that, a one-hot on the safe default.
const weightsFrom = <T extends string>(
  probs: Partial<Record<T, number>>,
  options: T[],
  fallback: T
): Record<T, number> => {
  const weights = {} as Record<T, number>;
  let total = 0;
  options.forEach((opt) => {
    const p = probs[opt] ?? 0;
    weights[opt] = p > 0 ? p : 0;
    total += weights[opt];
  });
  if (total <= 0) options.forEach((opt) => (weights[opt] = opt === fallback ? 1 : 0));
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

const normalise = <T extends string>(weights: Record<T, number>) => {
  const total = Object.values<number>(weights).reduce((a, b) => a + b, 0);
  const out = {} as Record<T, number>;
  (Object.keys(weights) as T[]).forEach((k) => {
    out[k] = total > 0 ? weights[k] / total : 0;
  });
  return out;
};

const formatPercent = (value: number | undefined) =>
  value === undefined ? "?" : `${Math.round(value * 100)}%`;

// Turns the numbers behind the decision into a one-line explanation for the log.
const buildReasoning = (
  persona: Persona,
  tilt: number,
  situation: Situation,
  judgement: ModelJudgement,
  finalWeights: Record<ActionOption, number>,
  action: ActionOption,
  raiseLabel?: string
): string => {
  const parts: string[] = [];

  if (persona.label) parts.push(tilt > 1.05 ? `${persona.label} (tilted x${tilt.toFixed(1)})` : persona.label);
  parts.push(
    situation.potOdds > 0
      ? `Equity ${situation.equity.toFixed(0)}% vs odds ${situation.potOdds.toFixed(0)}%`
      : `Equity ${situation.equity.toFixed(0)}%`
  );

  const strength = judgement.handStrength;
  parts.push(
    `Strength ${Number.isInteger(strength) ? strength : strength.toFixed(1)}/${HAND_STRENGTH_LEVELS.length - 1}`
  );

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

  if (judgement.reasoning) parts.push(`"${judgement.reasoning}"`);

  return parts.join(" · ");
};

// Applies persona + tilt to a model judgement and samples a concrete decision.
export const decideWithPersona = (
  situation: Situation,
  judgement: ModelJudgement,
  persona: Persona,
  tilt: number
): AIDecision => {
  const weights = weightsFrom(judgement.actionProbs, situation.legalActions, situation.safeDefault);

  if (weights.raise !== undefined) {
    weights.raise *= persona.aggression * tilt;
    if (judgement.handStrength <= WEAK_HAND_THRESHOLD) weights.raise += persona.bluffFreq;
  }
  if (weights.fold !== undefined) weights.fold /= persona.looseness;

  const finalWeights = normalise(weights);
  let action = sampleWeighted(finalWeights, persona.temperature);
  if (!situation.legalActions.includes(action)) action = situation.safeDefault;

  const decision: AIDecision = { action };
  let raiseLabel: string | undefined;

  if (action === "raise") {
    const sizeOptions = Object.keys(situation.raiseSizes) as RaiseSizeOption[];
    const sizeWeights = weightsFrom(judgement.sizeProbs, sizeOptions, "min");
    sizeOptions.forEach((key) => {
      sizeWeights[key] *= SIZING_WEIGHTS[persona.sizing][key];
      if (key === "all_in") sizeWeights[key] *= tilt; // tilted players shove more
    });
    const sizeKey = sampleWeighted(sizeWeights, persona.temperature);
    const total = situation.raiseSizes[sizeKey] ?? situation.raiseSizes.min ?? situation.minRaiseTotal;
    decision.amount = Math.min(Math.max(total, situation.minRaiseTotal), situation.maxTotal);
    raiseLabel = `${SIZE_LABELS[sizeKey]} ($${decision.amount})`;
  }

  decision.reasoning = buildReasoning(
    persona,
    tilt,
    situation,
    judgement,
    finalWeights,
    action,
    raiseLabel
  );
  return decision;
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
  reasoningHistory: string[] = [],
  modelId: string = AI_MODELS[0].id
): Promise<AIDecision> => {
  const persona = activePlayer.persona ?? RAW_PERSONA;
  const tilt = activePlayer.tilt ?? 1;

  const situation = buildSituation(
    activePlayer,
    allPlayers,
    board,
    pot,
    phase,
    currentHighBet,
    bigBlind,
    handHistory,
    reasoningHistory
  );

  try {
    if (!API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
    const trace = await runModel(situation, activePlayer.model ?? modelId, API_KEY);
    return decideWithPersona(situation, trace.judgement, persona, tilt);
  } catch (error) {
    console.error("AI Error:", error);
    return { action: situation.safeDefault, reasoning: "Error in AI service." };
  }
};
