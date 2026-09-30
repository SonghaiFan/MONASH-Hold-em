import { getVariablePlugins, formulaPlugin } from "./variablePlugins";
// What a seat's prompt can refer to. The model is never handed variables to
// fill in: before every decision it receives the whole situation as one JSON
// object, `state` (built in services/pokerSituation.ts), and the prompt points
// at its fields by name in backticks — `equityPercent`, `you.madeHand`. This is
// the list of those names, for the lobby's prompt editor.
//
// Keep it in step with buildSituation's `state`: a field added there belongs here.

import type { VariableField } from "../plugins/api";
import { algorithmFields } from "../plugins/registry";
import { decisionFields } from "./decisionFields";
export type PromptField = VariableField;
export type FieldGroup = VariableField['group'];
const BUILTIN_FIELDS = [...algorithmFields, ...decisionFields];

export const FIELD_GROUPS: FieldGroup[] = ["you", "table", "maths", "opponents", "history"];

// Every name a backtick in a prompt may hold without being a mistake: each path,
// the objects above it (`you`, `state`), and the keys inside list entries —
// written in full or on their own (`reads`, `estimatedRange`).
export const PROMPT_FIELDS: PromptField[] = [...BUILTIN_FIELDS];
const KNOWN = new Set<string>();
const refreshFields = () => {
  PROMPT_FIELDS.splice(0, PROMPT_FIELDS.length, ...BUILTIN_FIELDS, ...formulaPlugin().fields);
  KNOWN.clear();
  ["state", "you", "game", "custom"].forEach(k => KNOWN.add(k));
  PROMPT_FIELDS.forEach((f) => {
    KNOWN.add(f.path);
    const bare = f.path.replace("[]", "");
    KNOWN.add(bare);
    bare.split(".").forEach((part) => KNOWN.add(part));
    f.children?.forEach((c) => {
      KNOWN.add(c);
      KNOWN.add(`${bare}.${c}`);
      KNOWN.add(`${f.path}.${c}`);
    });
  });
};
refreshFields();

export const isKnownField = (name: string) => KNOWN.has(name.trim().replace(/^state\./, ""));

// The backtick names a prompt uses, split into the ones `state` has and the ones it doesn't
export const referencesIn = (prompt: string) => {
  const used = new Set<string>();
  const unknown = new Set<string>();
  for (const [, name] of prompt.matchAll(/`([^`\n]{1,80})`/g)) {
    const clean = name.trim().replace(/^state\./, "");
    (KNOWN.has(clean) ? used : unknown).add(clean);
  }
  return { used, unknown: [...unknown] };
};

// Presentation only: stored prompts retain their original field paths.
const LABELS: Record<string, [string, string]> = {
  equityPercent: ["win chance", "胜率"],
  equityVsRandomPercent: ["win chance against random hands", "对随机手牌的胜率"],
  potOddsPercent: ["equity needed to call", "跟注所需胜率"],
  opponentRanges: ["opponents’ likely hands", "对手可能的手牌"],
  "you.madeHand": ["made hand", "已成牌型"],
  "you.draws": ["possible draws", "听牌机会"],
  boardTexture: ["board texture", "牌面结构"],
  minimumDefenseFrequencyPercent: ["minimum defense frequency", "最低防守频率"],
  stackToPotRatio: ["stack-to-pot ratio", "筹码底池比"],
  "you.position": ["position", "位置"],
  tableInActionOrder: ["players in action order", "玩家行动顺序"],
  reads: ["opponent tendencies", "对手习惯"],
  "tableInActionOrder[].reads": ["opponent tendencies", "对手习惯"],
};
export const fieldLabel = (name: string, lang: "en" | "zh") => {
  const clean = name.trim().replace(/^state\./, "");
  const plugin = getVariablePlugins().find(v => `custom.${v.id}` === clean);
  if (plugin) return plugin.label;
  const label = LABELS[clean];
  if (label) return label[lang === "zh" ? 1 : 0];
  const field = PROMPT_FIELDS.find(f => f.path === clean);
  if (field?.label) return field.label[lang];
  if (lang === "zh" && field) return field.desc.zh;
  return clean.replace(/^you\./, "your ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
};
