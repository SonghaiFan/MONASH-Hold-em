import type { VariableField } from '../plugins/api';

// Engine-owned decision inputs, alongside plugin-derived poker information.
export const decisionFields: VariableField[] = [
  { path: 'legalActions', group: 'table', label: { en: 'Legal actions', zh: '合法动作' }, desc: { en: 'Actions available for this decision.', zh: '当前决策允许执行的动作。' }, example: '["fold", "call", "raise"]' },
  { path: 'actionCriteria', group: 'table', label: { en: 'Action criteria', zh: '动作判断依据' }, desc: { en: 'Guidance for evaluating each legal action.', zh: '评估各个合法动作的判断依据。' }, example: '{"check": "Take the free option."}' },
  { path: 'raiseSizes', group: 'table', label: { en: 'Raise sizes', zh: '可选加注额度' }, desc: { en: 'Sizing keys mapped to total chips committed this betting round; empty when raising is unavailable.', zh: '各加注选项对应本轮累计下注筹码；无法加注时为空对象。' }, example: '{"min": 400}' },
  { path: 'raiseSizeCriteria', group: 'table', label: { en: 'Raise size criteria', zh: '加注尺度判断依据' }, desc: { en: 'Guidance for each available sizing; empty when raising is unavailable.', zh: '各加注尺度的判断依据；无法加注时为空对象。' }, example: '{"min": "Minimum raise."}' },
];
