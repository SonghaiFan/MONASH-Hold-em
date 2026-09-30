import { parseFormula, evaluateFormula } from "./variableFormula";
import fileDefinitions from '../plugins/variables.json';

export type VariableSource =
  | { kind: 'formula'; expression: string }
  | { kind: 'constant'; value: string | number | boolean | null }
  | { kind: 'field'; path: string }
  | { kind: 'ratio' | 'difference' | 'sum'; left: string; right: string };
export interface VariablePlugin {
  id: string;
  label: string;
  description: string;
  source: VariableSource;
}
const forbidden = new Set(['__proto__', 'prototype', 'constructor', 'custom']);
const pathOK = (path: unknown): path is string => typeof path === 'string' && path.length <= 120 && /^[A-Za-z]\w*(\.[A-Za-z]\w*)*$/.test(path) && !path.split('.').some(p => forbidden.has(p));
export function validateVariable(value: unknown): VariablePlugin {
  const v = value as VariablePlugin;
  if (!v || typeof v.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(v.id) || forbidden.has(v.id)) throw new Error('Use a unique ID starting with a letter (letters, numbers and underscores only).');
  if (typeof v.label !== 'string' || !v.label.trim() || v.label.length > 80) throw new Error('A label of 1–80 characters is required.');
  if (typeof v.description !== 'string' || v.description.length > 400) throw new Error('Description must be at most 400 characters.');
  const s = v.source;
  if (!s) throw new Error('A value source is required.');
  if (s.kind === 'formula') {
    parseFormula(s.expression);
  } else if (s.kind === 'constant') {
    if (!(s.value === null || typeof s.value === 'boolean' || (typeof s.value === 'number' && Number.isFinite(s.value)) || (typeof s.value === 'string' && s.value.length <= 2000))) throw new Error('Use text (up to 2000 characters), a finite number, boolean or null.');
  } else if (s.kind === 'field') {
    if (!pathOK(s.path)) throw new Error('Use an existing state field path, e.g. you.stack.');
  } else if (['ratio', 'difference', 'sum'].includes(s.kind)) {
    if (!pathOK(s.left) || !pathOK(s.right)) throw new Error('Use two existing numeric state field paths.');
  } else throw new Error('Unknown value source.');
  return JSON.parse(JSON.stringify(v));
}
export function validateVariables(values: unknown): VariablePlugin[] {
  if (!Array.isArray(values) || values.length > 50) throw new Error('Provide an array of at most 50 variables.');
  const result = values.map(validateVariable);
  if (new Set(result.map(v => v.id)).size !== result.length) throw new Error('Variable IDs must be unique.');
  return result;
}
const files = validateVariables(fileDefinitions);
// Repository files are the only source. Legacy browser data is left untouched.
export const getVariablePlugins = (): VariablePlugin[] => structuredClone(files);
export function readStateField(state: Record<string, unknown>, path: string): unknown {
  if (!pathOK(path)) return undefined;
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined, state);
}
export function resolveVariable(plugin: VariablePlugin, state: Record<string, unknown>): unknown {
  const s = plugin.source;
  if (s.kind === 'formula') return evaluateFormula(parseFormula(s.expression), path => readStateField(state, path));
  if (s.kind === 'constant') return s.value;
  if (s.kind === 'field') return readStateField(state, s.path);
  const left = readStateField(state, s.left), right = readStateField(state, s.right);
  if (typeof left !== 'number' || typeof right !== 'number' || !Number.isFinite(left) || !Number.isFinite(right)) return undefined;
  const value = s.kind === 'ratio' ? (right === 0 ? NaN : left / right) : s.kind === 'difference' ? left - right : left + right;
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : undefined;
}
export function applyVariablePlugins(state: Record<string, unknown>): Record<string, unknown> {
  const { custom: _old, ...base } = state;
  const output = formulaValues(getVariablePlugins(), base);
  return Object.keys(output).length ? {...base, ...output} : base;
}
/** Repository file formulas use the same host contract as TypeScript algorithms. */
export function formulaPlugin(): import('../plugins/api').VariableAlgorithm {
  const definitions = getVariablePlugins();
  return {
    apiVersion: 1, id: 'user.formulas', version: '1.0.0', requires: ['poker.core'],
    fields: definitions.map(v => ({path:`custom.${v.id}`, label:{en:v.label,zh:v.label}, desc:{en:v.description || v.label,zh:v.description || v.label}, group:'table',example:''})),
    compute({state}) { return formulaValues(definitions, state as Record<string, unknown>); },
  };
}

function formulaValues(definitions: VariablePlugin[], state: Record<string, unknown>) {
  const custom: Record<string, unknown> = {};
  for (const definition of definitions) {
    const value = resolveVariable(definition, state);
    if (value !== undefined) custom[definition.id] = value;
  }
  return definitions.length ? {custom} : {};
}
