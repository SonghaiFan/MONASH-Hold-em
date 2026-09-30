# Frank's Hold'em

No-Limit Texas Hold'em against AI opponents whose brains are OpenRouter models (TypeSafe Jev, Gemini, Claude, GPT, Grok, DeepSeek, Kimi), plus a spectator arena where the models play each other.


## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `OPENROUTER_API_KEY` in [.env.local](.env.local) to your OpenRouter API key (AI opponents use [TypeSafe Jev](https://openrouter.ai/~typesafe/jev-latest) via the OpenRouter Decisions API)
3. Run the app:
   `npm run dev`

### Custom prompt variables

Create variables locally by editing
[`plugins/variables.json`](plugins/variables.json) to ship shared variable plugins.
The UI only searches, previews, and inserts existing variables.
See the [variable plugin API](docs/variable-plugins.md) for value sources,
validation and extension examples.

### Algorithm plugins

Poker is the host; algorithms supply variables through the versioned
[`VariableAlgorithm` API](docs/algorithm-plugins.md). Define field metadata and a
`compute({ context, state })` function, then register the plugin in
[`plugins/registry.ts`](plugins/registry.ts). Variables appear in the editor
automatically. Built-in poker variables use the same contract. See
[`plugins/potPressure.ts`](plugins/potPressure.ts) for a complete example.

Coding agents creating variables must follow
[`plugins/AGENTS.md`](plugins/AGENTS.md), which contains the extension decision,
templates, information boundary, tests, and PR completion checklist.
