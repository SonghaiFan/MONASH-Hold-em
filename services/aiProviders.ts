import { AI_MODELS } from "../constants";
import { AIModelKind } from "../types";
import {
  ACTION_INSTRUCTIONS,
  ActionOption,
  HAND_STRENGTH_INSTRUCTIONS,
  HAND_STRENGTH_LEVELS,
  RAISE_SIZE_INSTRUCTIONS,
  RaiseSizeOption,
  Situation,
} from "./pokerSituation";

// Two ways to ask a model the same question, both through OpenRouter:
//  - "decisions": TypeSafe's Decisions API (Jev). Typed questions in, calibrated
//    probabilities out, no free text.
//  - "chat": any OpenAI-compatible chat model. Same instructions and criteria
//    rendered as a prompt; the model is asked to return the same probability
//    shape as JSON, plus a one-sentence reasoning.
// Either way the result is a ModelJudgement the persona layer can work with.

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const APP_TITLE = "Frank's Hold'em";

export interface ModelJudgement {
  handStrength: number; // 0..4 on HAND_STRENGTH_LEVELS
  actionProbs: Partial<Record<ActionOption, number>>;
  sizeProbs: Partial<Record<RaiseSizeOption, number>>;
  reasoning?: string; // chat models only
}

export interface ModelTrace {
  model: string;
  kind: AIModelKind;
  request: unknown;
  response: unknown;
  judgement: ModelJudgement;
  latencyMs: number;
}

export const modelOptionFor = (modelId: string) =>
  AI_MODELS.find((m) => m.id === modelId);

export const modelKindFor = (modelId: string): AIModelKind =>
  modelOptionFor(modelId)?.kind ?? "chat";

const headers = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  "X-Title": APP_TITLE,
});

const postJson = async (url: string, apiKey: string, body: unknown) => {
  const response = await fetch(url, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${url} ${response.status}: ${text}`);
  }
  return response.json();
};

// ---------- Decisions API (Jev) ----------

interface ChoiceAnswer {
  choice: string;
  probabilities?: Record<string, number>;
}
interface ScoreAnswer {
  score: number;
}
interface DecisionAnswers {
  hand_strength?: ScoreAnswer;
  action?: ChoiceAnswer;
  raise_size?: ChoiceAnswer;
}

export const buildDecisionsRequest = (situation: Situation, modelId: string) => {
  const questions: Record<string, unknown> = {
    hand_strength: {
      type: "score",
      instructions: HAND_STRENGTH_INSTRUCTIONS,
      criteria: HAND_STRENGTH_LEVELS,
    },
    action: {
      type: "choice",
      instructions: ACTION_INSTRUCTIONS,
      criteria: situation.actionCriteria,
    },
  };
  if (Object.keys(situation.sizeCriteria).length > 0) {
    questions.raise_size = {
      type: "choice",
      instructions: RAISE_SIZE_INSTRUCTIONS,
      criteria: situation.sizeCriteria,
    };
  }
  return { model: modelId, state: situation.state, questions };
};

const runDecisions = async (
  situation: Situation,
  modelId: string,
  apiKey: string
): Promise<ModelTrace> => {
  const request = buildDecisionsRequest(situation, modelId);
  const started = performance.now();
  const response = (await postJson(DECISIONS_URL, apiKey, request)) as {
    answers: DecisionAnswers;
  };
  const latencyMs = performance.now() - started;
  const a = response.answers ?? {};

  const oneHot = (answer: ChoiceAnswer | undefined, options: string[]) => {
    const out: Record<string, number> = {};
    if (answer?.probabilities) return answer.probabilities;
    if (answer?.choice && options.includes(answer.choice)) out[answer.choice] = 1;
    return out;
  };

  return {
    model: modelId,
    kind: "decisions",
    request,
    response,
    latencyMs,
    judgement: {
      handStrength: a.hand_strength?.score ?? 2,
      actionProbs: oneHot(a.action, situation.legalActions),
      sizeProbs: oneHot(a.raise_size, Object.keys(situation.raiseSizes)),
      reasoning: undefined,
    },
  };
};

// ---------- Chat completions (Gemini / Claude / GPT / …) ----------

interface ChatDecision {
  hand_strength: number;
  action_probabilities: Record<string, number>;
  raise_size_probabilities?: Record<string, number>;
  reasoning: string;
}

const probabilitySchema = (keys: string[]) => ({
  type: "object",
  properties: Object.fromEntries(
    keys.map((k) => [k, { type: "number", minimum: 0, maximum: 1 }])
  ),
  required: keys,
  additionalProperties: false,
});

export const buildChatRequest = (situation: Situation, modelId: string) => {
  const sizeKeys = Object.keys(situation.sizeCriteria);
  const hasRaise = sizeKeys.length > 0;

  const criteriaBlock = (c: Record<string, string>) =>
    Object.entries(c)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");

  const system = [
    ACTION_INSTRUCTIONS,
    "",
    "You will receive the situation as a JSON object called `state`. Backtick paths in these instructions refer to fields in it.",
    "",
    "Answer THREE typed questions and return ONLY a JSON object matching the schema you are given.",
    "",
    `1. hand_strength — ${HAND_STRENGTH_INSTRUCTIONS} Integer 0-4 on this scale:`,
    HAND_STRENGTH_LEVELS.map((l, i) => `   ${i}: ${l}`).join("\n"),
    "",
    "2. action_probabilities — a probability distribution over ONLY these legal actions (values sum to 1). Express a mixed strategy: how often a GTO player takes each action in this exact spot.",
    criteriaBlock(situation.actionCriteria),
    "",
    hasRaise
      ? `3. raise_size_probabilities — ${RAISE_SIZE_INSTRUCTIONS} A distribution over ONLY these sizes (values sum to 1):\n${criteriaBlock(situation.sizeCriteria)}`
      : "3. raise_size_probabilities — omit; raising is not available.",
    "",
    "4. reasoning — one concise sentence explaining the distribution.",
  ].join("\n");

  const properties: Record<string, unknown> = {
    hand_strength: { type: "integer", minimum: 0, maximum: 4 },
    action_probabilities: probabilitySchema(situation.legalActions),
    reasoning: { type: "string" },
  };
  const required = ["hand_strength", "action_probabilities", "reasoning"];
  if (hasRaise) {
    properties.raise_size_probabilities = probabilitySchema(sizeKeys);
    required.push("raise_size_probabilities");
  }

  const reasoning = modelOptionFor(modelId)?.reasoning;
  return {
    model: modelId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ state: situation.state }) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "poker_decision",
        strict: true,
        schema: { type: "object", properties, required, additionalProperties: false },
      },
    },
    temperature: 0.2,
    ...(reasoning === "off"
      ? { reasoning: { enabled: false } }
      : reasoning
        ? { reasoning: { effort: reasoning } }
        : {}),
  };
};

const parseChatContent = (content: string): ChatDecision => {
  const trimmed = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(trimmed) as ChatDecision;
};

const runChat = async (
  situation: Situation,
  modelId: string,
  apiKey: string
): Promise<ModelTrace> => {
  const request = buildChatRequest(situation, modelId);
  const started = performance.now();
  const response = (await postJson(CHAT_URL, apiKey, request)) as {
    choices?: { message?: { content?: string } }[];
  };
  const latencyMs = performance.now() - started;

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("Chat model returned no content");
  const parsed = parseChatContent(content);

  return {
    model: modelId,
    kind: "chat",
    request,
    response,
    latencyMs,
    judgement: {
      handStrength: Number.isFinite(parsed.hand_strength) ? parsed.hand_strength : 2,
      actionProbs: parsed.action_probabilities ?? {},
      sizeProbs: parsed.raise_size_probabilities ?? {},
      reasoning: parsed.reasoning,
    },
  };
};

export const runModel = (
  situation: Situation,
  modelId: string,
  apiKey: string
): Promise<ModelTrace> =>
  modelKindFor(modelId) === "decisions"
    ? runDecisions(situation, modelId, apiKey)
    : runChat(situation, modelId, apiKey);
