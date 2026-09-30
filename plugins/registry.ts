// Explicit manifest: works identically in Vite and the Node tournament runner.
// Add an import and one entry to install a trusted algorithm plugin.
import { pokerCore } from './poker/core';
import { pokerFormulas } from './poker/formulas';
import { potPressure } from './potPressure';
import { createVariableHost } from '../services/variableHost';
export const algorithmPlugins = [pokerCore, pokerFormulas, potPressure];
if (algorithmPlugins.some(p => p.fields.some(f => f.path === 'custom' || f.path.startsWith('custom.')))) throw new Error('The custom root is reserved for formula variables.');
export const algorithmFields = createVariableHost(algorithmPlugins).fields;
