import { defineFormulaPlugin, type FormulaVariableField } from '../api';
import { builtinFormulaFields } from './fields';

const expressions: Record<string, string> = {
  'you.stackInBigBlinds': 'round(you.stack / bigBlind, 1)',
  potOddsPercent: 'if(toCall <= 0, 0, round(toCall / (pot + toCall) * 100, 1))',
  minimumDefenseFrequencyPercent: 'if(toCall > 0 && pot > toCall, round((pot - toCall) / pot * 100, 0), missing())',
  stackToPotRatio: 'if(pot > 0, round(you.stack / pot, 1), null)',
};

export const pokerFormulaFields: FormulaVariableField[] = builtinFormulaFields.map(field => ({
  ...field,
  expression: expressions[field.path],
}));

export const pokerFormulas = defineFormulaPlugin({
  apiVersion: 1,
  id: 'poker.formulas',
  version: '1.0.0',
  requires: ['poker.core'],
  fields: pokerFormulaFields,
});
