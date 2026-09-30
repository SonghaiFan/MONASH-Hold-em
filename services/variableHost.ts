import type { PokerContext, VariableAlgorithm } from '../plugins/api';
export interface PluginDiagnostic { pluginId: string; message: string }
const forbidden = new Set(['__proto__','prototype','constructor']);
const pathOK = (path: string) => /^[A-Za-z]\w*(?:\[\])?(?:\.[A-Za-z]\w*(?:\[\])?)*$/.test(path) && !path.replaceAll('[]','').split('.').some(k => forbidden.has(k));
const normalPath = (path: string) => path.replaceAll('[]', '');
const overlaps = (a: string, b: string) => a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function jsonValue(value: unknown, depth = 0): void {
  if (depth > 30) throw new Error('Output exceeds maximum depth.');
  if (value === undefined || value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach(v => jsonValue(v, depth + 1)); return; }
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    for (const [key, val] of Object.entries(value)) { if (forbidden.has(key)) throw new Error('Unsafe output key.'); jsonValue(val, depth + 1); }
    return;
  }
  throw new Error('Output must be finite JSON data; promises are not supported.');
}
/** Independent host, usable by both browser and CLI without React or storage. */
export function createVariableHost(definitions: readonly VariableAlgorithm[]) {
  const byId = new Map<string, VariableAlgorithm>();
  const rootOwners = new Map<string, string>();
  const fieldOwners = new Map<string, string>();
  for (const definition of definitions) {
    const p = { ...definition, requires: [...(definition.requires ?? [])], fields: structuredClone(definition.fields) };
    if (p.apiVersion !== 1 || !/^[a-z][a-z0-9.-]*$/i.test(p.id) || !p.version || typeof p.compute !== 'function' || byId.has(p.id)) throw new Error(`Invalid or duplicate plugin: ${p.id}`);
    const paths = new Set<string>();
    for (const field of p.fields) {
      if (!pathOK(field.path) || paths.has(field.path) || !field.desc?.en || !field.desc?.zh) throw new Error(`Invalid field in ${p.id}: ${field.path}`);
      paths.add(field.path);
      const path = normalPath(field.path);
      const root = path.split('.')[0];
      if (p.outputMode === 'fields') {
        if (rootOwners.has(root) && rootOwners.get(root) !== p.id) throw new Error(`Output root ${root} is already owned by ${rootOwners.get(root)}.`);
        for (const [claimed, owner] of fieldOwners) if (owner !== p.id && overlaps(path, claimed)) throw new Error(`Output field ${path} overlaps ${claimed}, owned by ${owner}.`);
        fieldOwners.set(path, p.id);
      } else {
        if (rootOwners.has(root) && rootOwners.get(root) !== p.id) throw new Error(`Output root ${root} is already owned by ${rootOwners.get(root)}.`);
        for (const [claimed, owner] of fieldOwners) if (claimed.split('.')[0] === root && owner !== p.id) throw new Error(`Output root ${root} overlaps fields owned by ${owner}.`);
        rootOwners.set(root, p.id);
      }
    }
    byId.set(p.id, freeze(p));
  }
  const ordered: VariableAlgorithm[] = [];
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error(`Plugin dependency cycle at ${id}.`);
    if (visited.has(id)) return;
    const p = byId.get(id);
    if (!p) throw new Error(`Missing plugin dependency: ${id}`);
    visiting.add(id);
    p.requires?.forEach(visit);
    visiting.delete(id); visited.add(id); ordered.push(p);
  }
  byId.forEach(p => visit(p.id));
  return {
    fields: ordered.flatMap(p => p.fields),
    run(context: PokerContext) {
      const safeContext = freeze(structuredClone(context));
      const state: Record<string, unknown> = {};
      const diagnostics: PluginDiagnostic[] = [];
      const failed = new Set<string>();
      for (const p of ordered) {
        try {
          if (p.requires?.some(id => failed.has(id))) throw new Error('A required plugin failed.');
          const output = p.compute({context: safeContext, state: freeze(structuredClone(state))});
          if (!output || typeof output !== 'object' || Array.isArray(output)) throw new Error('Return an object containing declared output roots.');
          if (output instanceof Promise) { void output.catch(() => {}); throw new Error('Async plugins are not supported.'); }
          jsonValue(output);
          if (JSON.stringify(output).length > 100_000) throw new Error('Plugin output exceeds 100 KB.');
          let published = output;
          if (p.outputMode === 'fields') {
            const declared = p.fields.map(field => normalPath(field.path));
            const top = declared.filter(path => !declared.some(other => other !== path && path.startsWith(`${other}.`)));
            assertDeclaredOutput(output, top);
            published = pickDeclaredOutput(output, top);
          } else {
            for (const key of Object.keys(output)) if (rootOwners.get(key) !== p.id) throw new Error(`Undeclared output root: ${key}`);
          }
          // Publish atomically: a failed plugin cannot leave partial values behind.
          mergeOutput(state, JSON.parse(JSON.stringify(published)));
        } catch (error) {
          failed.add(p.id);
          diagnostics.push({pluginId:p.id, message:error instanceof Error ? error.message : String(error)});
        }
      }
      return {state, diagnostics};
    },
  };
}

function readPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' && Object.hasOwn(current, key) ? (current as Record<string, unknown>)[key] : undefined, value);
}
function writePath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let current = target;
  for (const key of parts.slice(0, -1)) {
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[parts.at(-1)!] = value;
}
function pickDeclaredOutput(output: Record<string, unknown>, paths: string[]) {
  const picked: Record<string, unknown> = {};
  paths.forEach(path => { const value = readPath(output, path); if (value !== undefined) writePath(picked, path, value); });
  return picked;
}
function assertDeclaredOutput(output: Record<string, unknown>, paths: string[], prefix = ''): void {
  for (const [key, value] of Object.entries(output)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (paths.includes(path)) continue;
    if (paths.some(declared => declared.startsWith(`${path}.`)) && value && typeof value === 'object' && !Array.isArray(value)) {
      assertDeclaredOutput(value as Record<string, unknown>, paths, path);
      continue;
    }
    throw new Error(`Undeclared output field: ${path}`);
  }
}
function mergeOutput(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      mergeOutput(target[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else target[key] = value;
  }
}
