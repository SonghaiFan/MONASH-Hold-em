// Small expression language, deliberately independent of JavaScript execution.
export type Formula = { type: 'value'; value: string | number | boolean | null }
  | { type: 'field'; path: string }
  | { type: 'call'; name: 'if' | 'round' | 'missing'; args: Formula[] }
  | { type: 'unary'; op: string; value: Formula }
  | { type: 'binary'; op: string; left: Formula; right: Formula };
const blocked = new Set(['constructor', 'prototype', '__proto__', 'custom']);
const functions = new Set(['if', 'round', 'missing']);
export function parseFormula(text: string): Formula {
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new Error('Enter a formula of 1–2000 characters.');
  const tokens = text.match(/\s+|"(?:\\.|[^"\\])*"|`[^`\n]+`|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*|<=|>=|==|!=|&&|\|\||[(),+*/%<>!\-]|./g)!.filter(t => !/^\s+$/.test(t));
  let at = 0;
  let depth = 0;
  const precedence: Record<string, number> = {'||':1, '&&':2, '==':3, '!=':3, '<':3, '<=':3, '>':3, '>=':3, '+':4, '-':4, '*':5, '/':5, '%':5};
  const expression = (min = 0): Formula => {
    if (++depth > 64) throw new Error('Formula is nested too deeply.');
    const token = tokens[at++];
    let left: Formula;
    if (token === '(') {
      left = expression();
      if (tokens[at++] !== ')') throw new Error('Missing closing parenthesis.');
    } else if (token === '+' || token === '-' || token === '!') {
      left = {type:'unary', op:token, value:expression(6)};
    } else if (token?.startsWith('"')) {
      try { left = {type:'value', value:JSON.parse(token)}; } catch { throw new Error('Text must use double quotes.'); }
    } else if (token && /^(?:\d|\.\d)/.test(token) && Number.isFinite(Number(token))) {
      left = {type:'value', value:Number(token)};
    } else if (['true','false','null'].includes(token)) {
      left = {type:'value', value:JSON.parse(token)};
    } else if (token && functions.has(token) && tokens[at] === '(') {
      at++;
      const args: Formula[] = [];
      if (tokens[at] !== ')') {
        do {
          args.push(expression());
          if (tokens[at] !== ',') break;
          at++;
        } while (at < tokens.length);
      }
      if (tokens[at++] !== ')') throw new Error(`Missing closing parenthesis after ${token}.`);
      const expected = token === 'if' ? 3 : token === 'round' ? 2 : 0;
      if (args.length !== expected) throw new Error(`${token}() expects ${expected} arguments.`);
      left = {type:'call', name:token as 'if' | 'round' | 'missing', args};
    } else {
      const path = token?.replace(/^`|`$/g, '').replace(/^state\./, '');
      if (!path || !/^[A-Za-z]\w*(\.[A-Za-z]\w*)*$/.test(path) || path.split('.').some(p => blocked.has(p))) throw new Error(`Expected a number, field or parenthesis${token ? ` near “${token}”` : ''}.`);
      left = {type:'field', path};
    }
    while (at < tokens.length && (precedence[tokens[at]] ?? -1) >= min) {
      const op = tokens[at++];
      left = {type:'binary', op, left, right:expression(precedence[op] + 1)};
    }
    depth--;
    return left;
  };
  const result = expression();
  if (at !== tokens.length) throw new Error(`Unexpected “${tokens[at]}”. Use arithmetic, comparisons, conditions and parentheses.`);
  return result;
}
export function formulaFields(node: Formula): string[] {
  if (node.type === 'field') return [node.path];
  if (node.type === 'call') return node.args.flatMap(formulaFields);
  if (node.type === 'unary') return formulaFields(node.value);
  if (node.type === 'binary') return [...formulaFields(node.left), ...formulaFields(node.right)];
  return [];
}
export function evaluateFormula(node: Formula, read: (path: string) => unknown): unknown {
  if (node.type === 'value') return node.value;
  if (node.type === 'field') return read(node.path);
  if (node.type === 'call') {
    if (node.name === 'missing') return undefined;
    if (node.name === 'if') return evaluateFormula(node.args[0], read) ? evaluateFormula(node.args[1], read) : evaluateFormula(node.args[2], read);
    const value = evaluateFormula(node.args[0], read);
    const digits = evaluateFormula(node.args[1], read);
    if (typeof value !== 'number' || !Number.isFinite(value) || typeof digits !== 'number' || !Number.isInteger(digits) || digits < 0 || digits > 12) return undefined;
    return Number(value.toFixed(digits));
  }
  const left = evaluateFormula(node.type === 'unary' ? node.value : node.left, read);
  if (node.type === 'unary') {
    if (node.op === '!') return !left;
    if (typeof left !== 'number' || !Number.isFinite(left)) return undefined;
    return node.op === '-' ? -left : left;
  }
  if (node.op === '&&') return left ? evaluateFormula(node.right, read) : left;
  if (node.op === '||') return left ? left : evaluateFormula(node.right, read);
  const right = evaluateFormula(node.right, read);
  if (['==','!='].includes(node.op)) return node.op === '==' ? left === right : left !== right;
  if (typeof right !== 'number' || !Number.isFinite(right)) return undefined;
  if (typeof left !== 'number' || !Number.isFinite(left)) return undefined;
  if (node.op === '<') return left < right;
  if (node.op === '<=') return left <= right;
  if (node.op === '>') return left > right;
  if (node.op === '>=') return left >= right;
  const result = node.op === '+' ? left + right : node.op === '-' ? left - right : node.op === '*' ? left * right : node.op === '/' ? left / right : left % right;
  return Number.isFinite(result) ? result : undefined;
}
