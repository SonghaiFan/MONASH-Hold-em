# Frank's Hold'em

No-Limit Texas Hold'em against AI opponents whose brains are OpenRouter models (TypeSafe Jev, Gemini, Claude, GPT, Grok, DeepSeek, Kimi), plus a spectator arena where the models play each other.


## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `OPENROUTER_API_KEY` in [.env.local](.env.local) to your OpenRouter API key (AI opponents use [TypeSafe Jev](https://openrouter.ai/~typesafe/jev-latest) via the OpenRouter Decisions API)
3. Run the app:
   `npm run dev`
