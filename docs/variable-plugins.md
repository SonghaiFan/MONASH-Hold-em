# Formula variable plugins

For custom TypeScript algorithms and the unified host contract, see [Algorithm plugin API v1](algorithm-plugins.md).

Variables supply information alongside an opponent's prompt. The prompt refers to
`custom.callInBigBlinds`; the value is sent in `state.custom.callInBigBlinds`.
Display labels do not rewrite stored prompts. All registered variables are sent
for every opponent, even when a prompt does not mention them.

## Use variables in the app

Open an opponent → **Add information**, search for an existing variable, and tap
it to insert a reference. The UI cannot create, edit, or delete variables.
All definitions come from repository files. Legacy browser definitions are no
longer loaded; their stored data is left untouched. Prompts referencing them
remain unchanged and show unknown references until equivalent file definitions
are added with the same IDs.

## Formula syntax

Formulas support field paths, numbers, unary `+` / `-` / `!`, arithmetic
`+ - * / %`, comparisons, `&&` / `||`, and parentheses. `round(value, digits)`
uses 0–12 decimal places; `if(condition, yes, no)` selects a branch; and
`missing()` omits the variable for that situation. Examples: `toCall / bigBlind`,
`round((pot + toCall) / bigBlind, 1)`, and
`if(toCall > 0, equityPercent - potOddsPercent, missing())`. Field names may optionally use backticks or a
`state.` prefix. Fixed text uses double quotes (`"play cautiously"`); `true`,
`false` and `null` are also supported. Missing values and invalid arithmetic results are unavailable, not zero.

Legacy constant, field, ratio, difference and sum definitions remain supported;
they can still be declared in files.

## Add a shared variable in a file

Edit [`plugins/variables.json`](../plugins/variables.json). Its exported array is
automatically registered; no component or catalog changes are necessary. Vite
reloads changes during development. Production sites require a rebuild/deploy;
a deployed browser cannot read edits on your local disk.

```json
[
  {
    "id": "callInBigBlinds",
    "label": "Call in big blinds",
    "description": "The cost to call measured in big blinds.",
    "source": { "kind": "formula", "expression": "toCall / bigBlind" }
  }
]
```

File definitions are validated on load. Invalid definitions fail visibly instead
of silently publishing a broken catalog. Up to 50 file definitions are supported.

## TypeScript API

[`services/variablePlugins.ts`](../services/variablePlugins.ts) exports:

- `VariablePlugin`, `VariableSource`: version 1 definition types.
- `validateVariable(unknown)` / `validateVariables(unknown)`: validate and clone.
- `getVariablePlugins()`: detached copies of repository file definitions.
- `resolveVariable(plugin, state)`: evaluate one validated definition.
- `applyVariablePlugins(state)`: return a new state with refreshed `custom` values.

Call validation before resolving definitions from outside the registry. Returned definitions are detached copies; modifying them does not update the registry. Keep IDs stable so existing prompt references remain valid.

Preferred source:

```ts
{ kind: 'formula', expression: '(pot + toCall) / bigBlind' }
```

Backward-compatible sources:

```ts
{ kind: 'constant', value: 'Be careful multiway' }
{ kind: 'field', path: 'you.stack' }
{ kind: 'ratio', left: 'toCall', right: 'bigBlind' }
{ kind: 'difference', left: 'equityPercent', right: 'potOddsPercent' }
{ kind: 'sum', left: 'pot', right: 'toCall' }
```

IDs start with a letter and contain up to 48 letters, numbers or underscores.
All plugin outputs live under `custom` and cannot overwrite built-in information.
Sources read built-in and installed algorithm state, but not other formula variables. Paths use dot notation. Missing values, nonnumeric
calculation inputs, division by zero and nonfinite results omit the field for that
situation. Legacy arithmetic sources round to four decimals; formulas retain numeric precision. Fixed values are limited to 2000
characters, labels to 80 and descriptions to 400.

Formulas are parsed by a bounded expression parser, with no assignment or
JavaScript execution. The only callable names are the built-in `round`, `if`,
and `missing` helpers. File plugins
can refer to future fields, which remain unavailable until supplied.

The registry is declarative: it does not execute arbitrary JavaScript or fetch
remote data. To add a new source kind, extend `VariableSource`, validation and
`resolveVariable`, document it, and test it. The formula adapter implements the same VariableAlgorithm contract as code plugins. Its resolver is shared by live decisions and cached sample previews. Browser and CLI tournament runs load the same file definitions.

## Verification

Run `npm run test:variables`, `npx tsc --noEmit` and `npm run build`.
