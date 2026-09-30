import type { Card, GamePhase, Player, PlayerStats } from '../types';
import { evaluateFormula, parseFormula } from '../services/variableFormula';

export type DeepReadonly<T> = T extends (...args: any[]) => any ? T : T extends object ? {readonly [K in keyof T]: DeepReadonly<T[K]>} : T;
export interface PublicPlayer {
  id: string; name: string; chips: number; currentBet: number;
  position: string; status: Player['status']; isDealer: boolean; isActive: boolean;
  isHuman: boolean; stats?: PlayerStats;
}
export interface PokerContext {
  hero: PublicPlayer & { hand: Card[] };
  players: PublicPlayer[];
  board: Card[]; // Only already-revealed community cards.
  street: GamePhase;
  pot: number;
  currentHighBet: number;
  bigBlind: number;
  handHistory: string[];
  reasoningHistory: string[]; // Only the acting player's previous reasoning.
}
export interface VariableField {
  path: string;
  label?: {en: string; zh: string};
  desc: {en: string; zh: string};
  group: 'you' | 'table' | 'maths' | 'opponents' | 'history';
  example: string;
  sometimes?: boolean;
  children?: string[];
}
export interface VariableAlgorithm {
  apiVersion: 1;
  id: string;
  version: string;
  requires?: readonly string[];
  fields: readonly VariableField[];
  // Field mode lets independent plugins contribute disjoint paths under the
  // same top-level object. Only declared paths are published and deep-merged.
  outputMode?: 'root' | 'fields';
  // Each plugin owns complete top-level roots inferred from its field paths.
  // undefined fields are omitted. Return only finite, JSON-compatible data.
  compute(input: { context: DeepReadonly<PokerContext>; state: DeepReadonly<Record<string, unknown>> }): Record<string, unknown>;
}
export const defineVariablePlugin = <T extends VariableAlgorithm>(plugin: T): T => plugin;

export interface FormulaVariableField extends VariableField { expression: string }
type FormulaPluginDefinition = Omit<VariableAlgorithm, 'fields' | 'compute' | 'outputMode'> & {fields: readonly FormulaVariableField[]};
const unsafeFormulaKeys = new Set(['__proto__', 'prototype', 'constructor']);
const formulaRead = (state: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined, state);
const formulaWrite = (target: Record<string, unknown>, path: string, value: unknown) => {
  const parts = path.split('.');
  if (parts.some(part => unsafeFormulaKeys.has(part))) throw new Error(`Unsafe formula output path: ${path}`);
  let at = target;
  parts.slice(0, -1).forEach(part => {
    if (!at[part] || typeof at[part] !== 'object' || Array.isArray(at[part])) at[part] = {};
    at = at[part] as Record<string, unknown>;
  });
  at[parts.at(-1)!] = value;
};

/** Define safe, inspectable derived fields without executing JavaScript expressions. */
export function defineFormulaPlugin(definition: FormulaPluginDefinition): VariableAlgorithm {
  const parsed = definition.fields.map(field => ({field, formula:parseFormula(field.expression)}));
  return defineVariablePlugin({
    ...definition,
    outputMode: 'fields',
    fields: definition.fields.map(({expression: _expression, ...field}) => field),
    compute({state}) {
      const output: Record<string, unknown> = {};
      for (const {field, formula} of parsed) {
        const value = evaluateFormula(formula, path => {
          const derived = formulaRead(output, path);
          return derived === undefined ? formulaRead(state as Record<string, unknown>, path) : derived;
        });
        if (value !== undefined) formulaWrite(output, field.path, value);
      }
      return output;
    },
  });
}

export { createVariableHost } from '../services/variableHost';
