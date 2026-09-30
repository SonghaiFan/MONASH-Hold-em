# Poker variable plugin API v1

The poker engine is the host: it owns cards, turns, money and legal actions.
Variable plugins turn a **player-visible snapshot** into information for the
model. Built-in variables, TypeScript algorithms, file formulas
all implement `VariableAlgorithm` and feed the same field catalog.

This is a repository-local TypeScript API, not a published npm package. The
initial contract is synchronous. It does not yet support remote services,
asynchronous workers, UI installation of JavaScript, or plugins that change game
rules.

## Create your first algorithm

Create `plugins/myAlgorithm.ts`:

```ts
import { defineVariablePlugin } from './api';

export const myAlgorithm = defineVariablePlugin({
  apiVersion: 1,
  id: 'my-team.stack-pressure',
  version: '1.0.0',
  requires: ['poker.core'],
  fields: [{
    path: 'myPressure.callFraction',
    label: { en: 'Call as a share of stack', zh: '跟注占筹码比例' },
    desc: { en: 'How much of the remaining stack a call uses.', zh: '跟注需要用掉多少剩余筹码。' },
    group: 'maths',
    example: '0.1',
  }],
  compute({ context, state }) {
    const call = state.toCall;
    return {
      myPressure: {
        callFraction: context.hero.chips > 0 && typeof call === 'number'
          ? call / context.hero.chips
          : undefined,
      },
    };
  },
});
```

Import it into `plugins/registry.ts` and add it to `algorithmPlugins`. That is the
only installation step: **do not edit UI components, promptFields, or the situation
builder**. The manifest is explicit so browser builds and the Node tournament
runner load exactly the same plugins. Vite reloads source edits in development;
production requires a rebuild. Merely dropping an unregistered file in the folder
does not execute it.

A working example ships in `plugins/potPressure.ts`.

## Contract

`plugins/api.ts` exports `defineVariablePlugin`, `VariableAlgorithm`,
`VariableField`, `PokerContext`, `PublicPlayer`, `DeepReadonly`, and
`createVariableHost`. The identity helper gives inline definitions contextual
TypeScript types; the host validates definitions at installation.

- `apiVersion`: must be `1`; incompatible versions fail at registration.
- `id`: unique plugin ID, e.g. `team.algorithm-name`.
- `version`: the plugin author's version string (informational in v1).
- `requires`: IDs whose successful outputs this plugin needs. List dependencies
  explicitly; the host sorts them independently of manifest order.
- `fields`: output paths plus labels, descriptions, examples and optional child
  keys. The UI derives search, pills and known-reference checks from these fields.
- `compute({context, state})`: returns an object containing the plugin's output
  roots. It may return strings, finite numbers, booleans, null, arrays and plain
  objects. `undefined` omits an object property. Dates, functions, promises,
  nonfinite numbers, unsafe keys, excessive depth and oversized outputs fail.

By default, each plugin owns **complete top-level roots** inferred from its fields. A plugin
with `myPressure.callFraction` owns `myPressure`; another plugin cannot also own
`myPressure.other`. Use a unique namespace. `custom` is reserved for the formula
adapter. This deliberately avoids implicit overrides. To replace an algorithm,
replace its manifest entry, retaining its ID and output contract if dependents
rely on it. The bundled `poker.core` owns existing built-in roots and can be
replaced as a unit.

Safe formula plugins can contribute disjoint paths under an existing object by
using `defineFormulaPlugin`. The host publishes only their declared fields and
deep-merges those fields after dependencies have run. Exact, parent, or child
path collisions are rejected. The bundled `poker.formulas` plugin demonstrates
this by adding `you.stackInBigBlinds` alongside fields from `poker.core`:

```ts
import { defineFormulaPlugin } from '../api';

export const stackMath = defineFormulaPlugin({
  apiVersion: 1,
  id: 'team.stack-math',
  version: '1.0.0',
  requires: ['poker.core'],
  fields: [{
    path: 'team.stackInBigBlinds',
    expression: 'round(you.stack / bigBlind, 1)',
    desc: { en: 'Stack in big blinds', zh: '大盲数筹码' },
    group: 'maths',
    example: '50',
  }],
});
```

Formula plugins support the same bounded expression language as JSON
variables: arithmetic, comparisons, `&&` / `||`, `round`, `if`, and `missing`.
They do not execute JavaScript expressions.

## Context and dependencies

`context` is a cloned, deeply frozen snapshot:

- `hero`: acting player's public properties plus their own hole cards.
- `players`: public properties and aggregate statistics. No hole cards, private
  prompts, private reasoning, model credentials, or player persona configuration.
- `board`: only the community cards revealed on this street.
- `street`, `pot`, `currentHighBet`, `bigBlind`.
- `handHistory`: public action log.
- `reasoningHistory`: the acting player's previous reasoning only.

`state` is a frozen copy of successful preceding plugin outputs. Reading it does
not allow a plugin to alter the engine or another plugin's published result.
Dependencies must be declared; reading unrelated plugins without `requires`
creates an unsupported order dependency. There are no plugin-to-plugin API calls.

The formula adapter runs after the installed algorithm list and reads its state.
Formulas cannot reference `custom.*` or other formulas; this avoids formula cycles.
Existing saved prompts and their built-in paths continue to work.

## Failures and trust

Duplicate IDs, duplicate root ownership, missing dependencies and dependency
cycles reject registration. A compute exception or invalid result omits that
plugin's entire output, records a diagnostic, and skips its dependents. Independent
plugins continue. Diagnostics are returned on `Situation.variableDiagnostics`
and shown in the sample preview; they are not sent as model instructions.

TypeScript plugins are **trusted application code**, not sandboxed code. The host
isolates ordinary exceptions and data mutation, but cannot stop infinite loops,
CPU-heavy work, global side effects or intentional access to browser APIs. Review
plugins before installing them. Keep computation fast; move costly async or remote
work to a future worker contract rather than returning promises from v1.

## Test independently

```ts
import { createVariableHost } from './plugins/api';

const host = createVariableHost([dependencyPlugin, myAlgorithm]);
const { state, diagnostics } = host.run(sampleContext);
```

The host has no React, localStorage or browser dependency. Its inputs are ordinary
objects; use deterministic fixtures and test missing values, edge cases and errors.

Run `npm run test:variables`, `npx tsc --noEmit`, and `npm run build` before sending
a PR. The current suite checks dependency order, collisions, version rejection,
exception isolation, immutable context, hidden-information filtering, formulas,
file-only loading, catalog discovery and cached sample values.

## Architecture

```text
Engine → public snapshot → plugin host → state → model request
                               │
                               ├─ poker.core (base and algorithmic built-ins)
                               ├─ poker.formulas (inspectable built-in maths)
                               ├─ installed algorithm plugins
                               └─ user.formulas (repository file definitions)

Plugin field metadata → shared catalog → editor / search / preview
```

Legal action validation and chip movement remain in the engine. Supplying a
variable never grants a plugin authority to execute a poker action.
