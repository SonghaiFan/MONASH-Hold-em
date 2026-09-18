// Headless model-vs-model tournament. One OpenRouter model per seat; each
// decision is sampled straight from the model's returned distribution.
//
//   OPENROUTER_API_KEY=... npm run tournament            # 40 hands to .tournament/tournament.json
//   MAX_HANDS=100 RESUME=1 npm run tournament            # continue a saved run
//
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createEngine, startHand, applyAction, currentHighBet, potTotal, visibleBoard, EngineState } from "../services/pokerEngine";
import { buildSituation, ActionOption, RaiseSizeOption } from "../services/pokerSituation";
import { runModel } from "../services/aiProviders";
import { Player } from "../types";

const apiKey = process.env.OPENROUTER_API_KEY!;
const OUT = process.env.OUT ?? ".tournament/tournament.json";
const MAX_HANDS = Number(process.env.MAX_HANDS ?? 40);
const BB = 200;
const SEATS = [
  { id: "jev", name: "Jev", model: "~typesafe/jev-latest" },
  { id: "gemini", name: "Gemini", model: "google/gemini-2.5-flash-lite" },
  { id: "claude", name: "Claude", model: "anthropic/claude-haiku-4.5" },
  { id: "gpt", name: "GPT", model: "openai/gpt-5-mini" },
];
const fmt = (cs: { rank: string; suit: string }[]) => cs.map(c => c.rank + c.suit).join(" ");

const sample = <T extends string>(probs: Partial<Record<T, number>>, options: T[], fallback: T): T => {
  const w = options.map(o => Math.max(probs[o] ?? 0, 0));
  const tot = w.reduce((a, b) => a + b, 0);
  if (tot <= 0) return fallback;
  let r = Math.random() * tot;
  for (let i = 0; i < options.length; i++) { r -= w[i]; if (r <= 0) return options[i]; }
  return options[options.length - 1];
};

let st: EngineState = createEngine(SEATS.map(s => ({ id: s.id, name: s.name, isHuman: false, chips: 10000, hand: [], status: "WAITING", position: "", isDealer: false, isActive: true, currentBet: 0, model: s.model } as Player)), BB);
let log: any = { startedAt: new Date().toISOString(), seats: SEATS, bigBlind: BB, startingChips: 10000, hands: [], decisions: [] };
if (process.env.RESUME && existsSync(OUT)) {
  log = JSON.parse(readFileSync(OUT, "utf8"));
  const last = log.hands[log.hands.length - 1];
  if (last) {
    st = { ...st, players: st.players.map(p => ({ ...p, chips: last.chipsAfter[p.id] ?? p.chips })), handNumber: last.n, dealerIndex: st.players.findIndex(p => p.id === last.dealer) };
    console.log(`RESUMED after hand #${last.n}`);
  }
}
mkdirSync(dirname(OUT), { recursive: true });
const save = () => writeFileSync(OUT, JSON.stringify(log));

for (let h = log.hands.length; h < MAX_HANDS; h++) {
  st = startHand(st);
  if (st.handOver && !st.result) break;
  const handNo = st.handNumber;
  const holeCards = Object.fromEntries(st.players.filter(p => p.hand.length).map(p => [p.id, fmt(p.hand)]));
  const chipsBefore = Object.fromEntries(st.players.map(p => [p.id, p.chips + (st.committed[p.id] ?? 0)]));
  const reads: Record<string, string[]> = {};
  const t0 = Date.now();

  while (!st.handOver) {
    const me = st.players.find(p => p.id === st.activePlayerId)!;
    const sit = buildSituation(me, st.players, st.board, potTotal(st), st.phase, currentHighBet(st), BB, st.handHistory, reads[me.id] ?? []);
    let action: ActionOption = sit.safeDefault, amount: number | undefined, rec: any = null, err: string | null = null, latency = 0;
    for (let attempt = 0; attempt < 2 && !rec; attempt++) {
      try { const tr = await runModel(sit, me.model!, apiKey); rec = tr.judgement; latency = tr.latencyMs; }
      catch (e: any) { err = String(e.message ?? e).slice(0, 200); }
    }
    if (rec) {
      action = sample(rec.actionProbs, sit.legalActions, sit.safeDefault);
      if (action === "raise") {
        const sizes = Object.keys(sit.raiseSizes) as RaiseSizeOption[];
        const k = sample(rec.sizeProbs, sizes, "min");
        amount = sit.raiseSizes[k] ?? sit.minRaiseTotal;
      }
      const line = rec.reasoning ?? Object.entries(rec.actionProbs).map(([k, v]) => `${k} ${Math.round((v as number) * 100)}`).join("/");
      (reads[me.id] ??= []).push(`[${st.phase}] ${line} → ${action.toUpperCase()}${amount ? " $" + amount : ""}`);
    }
    log.decisions.push({ hand: handNo, street: st.phase, player: me.id, hole: fmt(me.hand), board: fmt(visibleBoard(st)), pot: potTotal(st), toCall: sit.toCall, equity: +sit.equity.toFixed(1), potOdds: +sit.potOdds.toFixed(1), legal: sit.legalActions, sizes: sit.raiseSizes, handStrength: rec?.handStrength ?? null, actionProbs: rec?.actionProbs ?? null, sizeProbs: rec?.sizeProbs ?? null, action, amount: amount ?? null, latencyMs: Math.round(latency), reasoning: rec?.reasoning ?? null, error: err });
    st = applyAction(st, action, amount);
  }

  const r = st.result!;
  const chipsAfter = Object.fromEntries(st.players.map(p => [p.id, p.chips]));
  log.hands.push({ n: handNo, dealer: st.players[st.dealerIndex].id, holeCards, board: fmt(r.board), showdown: r.showdown, pot: r.potTotal, pots: r.pots.map(p => ({ amount: p.amount, eligible: p.eligiblePlayerIds })), payouts: r.payouts, history: st.handHistory, chipsBefore, chipsAfter, seconds: Math.round((Date.now() - t0) / 1000) });
  save();
  const stacks = st.players.map(p => `${p.name} ${p.chips}`).join("  ");
  console.log(`#${String(handNo).padStart(2)} ${r.showdown ? "SD " : "   "} pot ${String(r.potTotal).padStart(5)} → ${r.payouts.map(p => `${p.playerId}+${p.amount}`).join(",")}  | ${stacks}  (${Math.round((Date.now() - t0) / 1000)}s)`);
  if (st.players.filter(p => p.chips > 0).length < 2) { console.log("TOURNAMENT OVER"); break; }
}
log.finishedAt = new Date().toISOString();
save();
console.log("DONE", log.hands.length, "hands,", log.decisions.length, "decisions");
