import assert from 'node:assert/strict';
const storage = new Map<string, string>();
storage.set('frankie.variable-plugins.v1', JSON.stringify([{id:'browserOnly',label:'Browser only',description:'',source:{kind:'constant',value:99}}]));
const savedBrowserData = storage.get('frankie.variable-plugins.v1');
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { throw new Error('Variable registry must not write browser storage'); },
}});
const api = await import('../services/variablePlugins');
const fields = await import('../services/promptFields');
const preview = await import('../services/promptPreview');
const { GamePhase } = await import('../types');
const providers = await import('../services/aiProviders');
for (const street of preview.PREVIEW_STREETS) {
  const situation = preview.sampleSituation('Decision fields', street);
  const request = providers.buildChatRequest(situation, 'test-chat');
  const sent = JSON.parse(request.messages[1].content).state;
  for (const path of ['legalActions', 'actionCriteria', 'raiseSizes', 'raiseSizeCriteria']) {
    assert.equal(fields.isKnownField(path), true);
    assert.equal(fields.isKnownField(`state.${path}`), true);
    assert.notEqual(preview.valueAt(situation.state, path), undefined);
    assert.deepEqual(preview.valueAt(situation.state, `state.${path}`), sent[path]);
  }
  assert.deepEqual(fields.referencesIn(providers.DEFAULT_CHAT_PROMPT_TEMPLATE).unknown, []);
}
const make = (id: string, source: import('../services/variablePlugins').VariableSource) => ({id, label: id, description: '', source});
assert.throws(() => api.validateVariable(make('__proto__', {kind:'constant', value:1})));
assert.throws(() => api.validateVariable(make('bad', {kind:'field', path:'you.constructor'})));
assert.throws(() => api.validateVariables([make('same', {kind:'constant',value:1}), make('same', {kind:'constant',value:2})]));
const ratio = make('ratio', {kind:'ratio', left:'pot', right:'bigBlind'});
assert.equal(api.resolveVariable(ratio, {pot:300,bigBlind:200}), 1.5);
assert.equal(api.resolveVariable(ratio, {pot:300,bigBlind:0}), undefined);
assert.equal(api.resolveVariable(ratio, {pot:'300',bigBlind:200}), undefined);
assert.equal(api.resolveVariable(make('x',{kind:'field',path:'you.stack'}),{}), undefined);
assert.equal(api.resolveVariable(make('x',{kind:'difference',left:'pot',right:'toCall'}),{pot:300,toCall:100}),200);
assert.equal(api.resolveVariable(make('x',{kind:'sum',left:'pot',right:'toCall'}),{pot:300,toCall:100}),400);
assert.equal(api.getVariablePlugins().some(v => v.id === 'browserOnly'), false);
assert.equal(fields.isKnownField('custom.browserOnly'), false);
assert.equal(fields.isKnownField('custom.callInBigBlinds'), true);
assert.equal((preview.sampleSituation('Test', GamePhase.FLOP).state.custom as any).browserOnly, undefined);
assert.equal((preview.sampleSituation('Another', GamePhase.PRE_FLOP).state.custom as any).callInBigBlinds, 1);
assert.equal(storage.get('frankie.variable-plugins.v1'), savedBrowserData);
const detached = api.getVariablePlugins();
detached[0].label = 'Changed';
assert.notEqual(api.getVariablePlugins()[0].label, 'Changed');
console.log('File-only registry, preserved browser storage, catalog and preview checks passed.');
const formula = await import('../services/variableFormula');
const calc = (text: string, state: Record<string, unknown> = {}) => formula.evaluateFormula(formula.parseFormula(text), p => api.readStateField(state,p));
assert.equal(calc('2 + 3 * 4'),14);
assert.equal(calc('(2 + 3) * -4'),-20);
assert.equal(calc('10 - 3 - 2'),5);
assert.equal(calc('toCall / bigBlind', {toCall:300,bigBlind:200}),1.5);
assert.equal(calc('`state.you.stack` / bigBlind', {you:{stack:1000},bigBlind:200}),5);
assert.equal(calc('"hold position"'),'hold position');
assert.equal(calc('false'),false);
assert.equal(calc('null'),null);
assert.equal(calc('1 / 0'),undefined);
assert.equal(calc('unknown + 1'),undefined);
assert.equal(calc('"2" + 1'),undefined);
assert.equal(calc('10 % 3'),1);
assert.equal(calc('.5 * 1e2'),50);
assert.equal(calc('round(10 / 3, 1)'),3.3);
assert.equal(calc('if(toCall <= 0, 0, round(toCall / (pot + toCall) * 100, 1))',{toCall:25,pot:75}),25);
assert.equal(calc('if(toCall > 0 && pot > toCall, 1, missing())',{toCall:0,pot:100}),undefined);
assert.equal(calc('if(pot > 0, 1, null)',{pot:0}),null);
for (const invalid of ['pot +', '(pot', 'Math.random()', 'you.constructor', 'custom.other', 'pot; alert(1)', '1 ** 2', '1e309']) assert.throws(() => formula.parseFormula(invalid), invalid);
for (const invalid of ['round(1)', 'round(1, 2, 3)', 'if(true, 1)', 'missing(1)', 'unknown(1)']) assert.throws(() => formula.parseFormula(invalid), invalid);
console.log('Formula precedence, literals, invalid expressions, compatibility and preview checks passed.');
const { createVariableHost } = await import('../services/variableHost');
const field = (path: string) => ({path, group:'table' as const, example:'1', desc:{en:path,zh:path}});
const plugin = (id: string, path: string, compute: import('../plugins/api').VariableAlgorithm['compute'], requires: string[] = []): import('../plugins/api').VariableAlgorithm => ({apiVersion:1,id,version:'1.0.0',fields:[field(path)],requires,compute});
const context: import('../plugins/api').PokerContext = {hero:{id:'a',name:'A',hand:[],chips:100,currentBet:0,position:'BTN',status:'WAITING',isDealer:true,isActive:true,isHuman:false},players:[],board:[],street:GamePhase.FLOP,pot:100,currentHighBet:0,bigBlind:10,handHistory:[],reasoningHistory:[]};
const dependency = plugin('base','base.value',() => ({base:{value:3}}));
const dependent = plugin('derived','derived.value',({state}) => ({derived:{value:(state.base as any).value * 2}}),['base']);
assert.equal((createVariableHost([dependent,dependency]).run(context).state.derived as any).value,6);
assert.throws(() => createVariableHost([dependency,plugin('other','base.other',()=>({}))]));
assert.throws(() => createVariableHost([dependent]));
assert.throws(() => createVariableHost([{...dependency, requires:['derived']},dependent]));
assert.throws(() => createVariableHost([{...dependency,apiVersion:2} as any]));
const bad = plugin('bad','bad.value',() => {throw new Error('example failure');});
const isolated = createVariableHost([bad,dependency,plugin('blocked','blocked.value',()=>({blocked:{value:1}}),['bad'])]).run(context);
assert.equal((isolated.state.base as any).value,3);
assert.equal(isolated.diagnostics.length,2);
assert.equal(isolated.state.blocked,undefined);
assert.equal(createVariableHost([plugin('bad','bad.value',()=>({bad:{value:Infinity}}))]).run(context).diagnostics.length,1);
assert.equal(createVariableHost([plugin('bad','bad.value',()=>({stolen:1}))]).run(context).diagnostics.length,1);
assert.equal(createVariableHost([plugin('bad','bad.value',({context:c})=>{(c.hero as any).chips=0; return {};})]).run(context).diagnostics.length,1);
assert.equal(context.hero.chips,100);
const { defineFormulaPlugin } = await import('../plugins/api');
const fieldBase: import('../plugins/api').VariableAlgorithm = {...plugin('field-base','shared.base',()=>({shared:{base:3}})),outputMode:'fields'};
const fieldFormula = defineFormulaPlugin({apiVersion:1,id:'field-formula',version:'1.0.0',requires:['field-base'],fields:[{...field('shared.double'),expression:'shared.base * 2'}]});
const shared = createVariableHost([fieldFormula,fieldBase]).run(context);
assert.deepEqual(shared.state.shared,{base:3,double:6});
assert.throws(() => createVariableHost([fieldBase,{...plugin('field-overlap','shared.base.child',()=>({})),outputMode:'fields'}]));
assert.equal(createVariableHost([{...fieldBase,compute:()=>({shared:{extra:1}})}]).run(context).diagnostics.length,1);
// Exercise the real host adapter: opponents' hands, prompts and future board
// cards must never become plugin context, even though the engine has them.
const registry = await import('../plugins/registry');
const { runPokerVariables } = await import('../services/pokerVariables');
let observed: any;
const spy = plugin('test.spy','spy.count',({context:c})=>{observed=c; return {spy:{count:c.board.length}};});
registry.algorithmPlugins.push(spy as any);
try {
 const hero = {...context.hero, hand:[{rank:'A',suit:'♠',id:'a'},{rank:'K',suit:'♠',id:'k'}]} as any;
 const opponent = {...hero,id:'b',name:'B',isDealer:false,hand:[{rank:'2',suit:'♥',id:'2h'},{rank:'3',suit:'♥',id:'3h'}],prompt:'private',reasoningHistory:['secret']};
 const output = runPokerVariables({activePlayer:hero,allPlayers:[hero,opponent],board:[...hero.hand,...opponent.hand, {rank:'5',suit:'♣',id:'5c'}],phase:GamePhase.PRE_FLOP,pot:100,currentHighBet:10,bigBlind:10,handHistory:[],reasoningHistory:[]});
 assert.equal(observed.board.length,0);
 assert.equal(observed.players[1].hand,undefined);
 assert.equal(observed.players[1].prompt,undefined);
 assert.equal(observed.players[1].reasoningHistory,undefined);
 assert.equal(observed.hero.hand.length,2);
 assert.equal(output.diagnostics.length,0);
 assert.equal((output.state.you as any).stackInBigBlinds,10);
 assert.equal(output.state.potOddsPercent,9.1);
 assert.equal(output.state.minimumDefenseFrequencyPercent,90);
 assert.equal(output.state.stackToPotRatio,1);
} finally {registry.algorithmPlugins.pop();}
console.log('Plugin contracts, dependency ordering, failure isolation and hidden-information boundary checks passed.');
