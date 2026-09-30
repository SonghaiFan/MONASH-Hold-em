# Instructions for agents creating poker variables

Read this file completely before editing a variable or algorithm. The goal is
that an agent can add a useful data variable by PR without changing the prompt
editor, preview, model request builder, or poker engine orchestration.

The poker application is a container. It creates a player-visible, read-only
snapshot. Plugins derive JSON values from that snapshot. Plugin field metadata
automatically drives variable search, readable prompt pills, field inspection,
formula suggestions, previews, and known-reference validation.

For the full API rationale and failure model, also read
[`../docs/algorithm-plugins.md`](../docs/algorithm-plugins.md). For formula-only
details, read [`../docs/variable-plugins.md`](../docs/variable-plugins.md).

## First decide which extension to use

Use the least powerful mechanism that preserves the intended semantics:

1. Use `defineFormulaPlugin` for deterministic arithmetic, comparisons,
   conditionals, rounding, or copying existing fields. Formula definitions are
   inspectable and do not execute JavaScript expressions.
2. Use `defineVariablePlugin` for card analysis, collection traversal,
   simulation, shared intermediate work, or another domain algorithm that a
   formula cannot express without changing its meaning.
3. Do not move an existing algorithm to a formula if doing so changes rounding,
   missing-value behavior, randomness, or edge cases.

`plugins/variables.json` is for file-authored
`custom.*` fields. The UI only uses existing variables; it cannot create or edit them.
A PR that adds a maintained project algorithm should normally
add a TypeScript plugin under this directory.

## Files an ordinary variable PR may change

- Add the plugin implementation under `plugins/`.
- Add one import and one entry in [`registry.ts`](registry.ts).
- Add focused tests to `scripts/test-variables.ts`, or a dedicated test file if
  the algorithm warrants it.
- Update relevant documentation.

Do not edit React components, `services/promptFields.ts`, or
`services/pokerSituation.ts` merely to expose a new variable. If that appears
necessary, stop and first verify that the plugin is registered and its `fields`
metadata is complete.

## Formula plugin template

```ts
import { defineFormulaPlugin } from './api';

export const stackMath = defineFormulaPlugin({
  apiVersion: 1,
  id: 'community.stack-math',
  version: '1.0.0',
  requires: ['poker.core'],
  fields: [{
    path: 'stackMath.callInBigBlinds',
    label: {
      en: 'Call in big blinds',
      zh: '跟注所需大盲数',
    },
    desc: {
      en: 'The call amount measured in big blinds.',
      zh: '以大盲为单位的跟注金额。',
    },
    group: 'maths',
    example: '2.5',
    expression: 'round(toCall / bigBlind, 1)',
  }],
});
```

Available formula features include numeric and JSON scalar literals, field
paths, parentheses, arithmetic, comparisons, `&&`, `||`, `round`, `if`, and
`missing`. Use `missing()` when a field should be absent in a situation. Do not
invent zero as a substitute for unavailable information.

Inspect [`poker/formulas.ts`](poker/formulas.ts) for maintained examples. Keep
existing paths unchanged when migrating an existing variable.

## Algorithm plugin template

```ts
import { defineVariablePlugin } from './api';

export const positionPressure = defineVariablePlugin({
  apiVersion: 1,
  id: 'community.position-pressure',
  version: '1.0.0',
  requires: ['poker.core'],
  fields: [{
    path: 'positionPressure.score',
    label: {
      en: 'Position pressure',
      zh: '位置压力',
    },
    desc: {
      en: 'Pressure created by position, stack, and the price to continue.',
      zh: '由位置、筹码和继续游戏的成本形成的压力。',
    },
    group: 'maths',
    example: '0.42',
  }],
  compute({ context, state }) {
    const toCall = state.toCall;
    if (typeof toCall !== 'number' || context.hero.chips <= 0) {
      return { positionPressure: {} };
    }
    return {
      positionPressure: {
        score: toCall / context.hero.chips,
      },
    };
  },
});
```

Use [`potPressure.ts`](potPressure.ts) as a small complete example and
[`poker/core.ts`](poker/core.ts) as the built-in domain-algorithm example.

## Registration

Import the plugin in [`registry.ts`](registry.ts) and add it to
`algorithmPlugins`:

```ts
import { positionPressure } from './positionPressure';

export const algorithmPlugins = [
  pokerCore,
  pokerFormulas,
  positionPressure,
];
```

Registration is explicit so Vite and the Node tournament runner load the same
trusted code. Adding a file without registering it must not execute it. Do not
implement filesystem scanning or runtime JavaScript installation as part of a
normal variable PR.

## Naming and compatibility

- Use a globally unique plugin ID such as `author.algorithm-name`.
- Give a new algorithm a unique top-level output namespace, such as
  `positionPressure.*`.
- `custom` is reserved for file formula variables.
- A normal algorithm plugin owns its complete top-level output roots.
- Formula plugins may contribute disjoint declared field paths. Exact, parent,
  child, and incompatible root collisions are rejected by the host.
- Declare every plugin whose state you read in `requires`; manifest order is not
  a substitute for dependencies.
- Never rename or silently change the meaning, unit, range, or missing-value
  behavior of a published field without an explicit migration plan.
- If replacing an implementation, retain its plugin ID and output contract when
  downstream plugins depend on them.

## Field metadata quality

Every field needs:

- a stable `path`;
- concise English and Chinese labels when a custom label improves readability;
- accurate English and Chinese descriptions;
- the closest group: `you`, `table`, `maths`, `opponents`, or `history`;
- a realistic serialized example;
- `sometimes: true` when the field can legitimately be absent;
- `children` when list/object child names should be referable in prompts.

Describe what the value means, its unit and important uncertainty. Do not market
an estimate as a fact. For example, simulation equity should say that it is an
estimate against an inferred range.

Keep runtime state values simple JSON. Put explanation and provenance in field
metadata. If uncertainty is useful to the model, expose a separate confidence
field rather than silently wrapping a number in an object.

## Information boundary

Plugins receive a cloned, deeply frozen `context`:

- `hero` includes the acting player's own hole cards;
- `players` contains public player state and aggregate statistics;
- `board` contains only community cards already revealed on this street;
- public hand history and the acting player's previous reasoning are available.

Plugins must not receive or attempt to infer access to opponent hole cards,
future board cards, another player's private prompt/reasoning, credentials, or
model configuration. Do not import mutable game stores to bypass this boundary.

`state` contains successful outputs from declared dependencies. Treat both
`context` and `state` as immutable. Plugins return data; they never move chips,
choose an action, modify the game, perform network requests, or write storage.

## Runtime constraints

API v1 plugins are synchronous trusted repository code. They may return only
finite JSON-compatible data. Do not return promises, functions, class instances,
dates, `NaN`, or infinities. Keep output below 100 KB and avoid excessive nesting.

The host catches ordinary exceptions, rejects invalid output atomically, and
skips dependents of a failed plugin. It cannot safely stop an infinite loop,
heavy CPU use, network side effects, or malicious global access. Keep algorithms
bounded and deterministic where possible. Seed or explicitly test unavoidable
randomness. Remote and asynchronous algorithms require a future worker/service
API and are outside v1.

## Tests required for the PR

Test the algorithm independently with deterministic fixtures. Cover:

- a normal value;
- every street or availability condition that changes behavior;
- missing prerequisites;
- zero denominators and empty collections;
- boundary values and rounding;
- malformed or nonnumeric dependency values when relevant;
- absence of hidden information;
- exact output path and JSON shape;
- failure behavior if the plugin intentionally validates input.

For simulations, avoid a flaky single random assertion. Use a deterministic seed
or assert a documented tolerance across enough samples.

Run all three commands before declaring the task complete:

```bash
npm run test:variables
npx tsc --noEmit
npm run build
```

Also open the opponent editor and verify that the new label can be searched,
inserted into the prompt, and inspected on a sample street. No component change
should be required for this verification.

## Agent completion checklist

Before finishing, report:

- plugin ID and version;
- every added variable path, type/range/unit, and when it is absent;
- dependencies and why they are needed;
- algorithm assumptions and uncertainty;
- confirmation that no hidden information is exposed;
- files added or changed;
- tests and build commands run;
- any compatibility or performance risk.

Do not claim completion if the plugin is unregistered, its UI discovery was not
verified, or required checks failed.
