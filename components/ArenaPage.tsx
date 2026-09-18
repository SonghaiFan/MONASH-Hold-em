import React, { useEffect, useMemo, useRef, useState } from "react";
import { AI_MODELS } from "../constants";
import { GamePhase, Persona, Player } from "../types";
import {
  EngineState,
  applyAction,
  createEngine,
  currentHighBet,
  playersWithChips,
  potTotal,
  startHand,
  visibleBoard,
} from "../services/pokerEngine";
import { buildSituation } from "../services/pokerSituation";
import { runModel } from "../services/aiProviders";
import { decideWithPersona } from "../services/pokerAi";
import { PlayingCard } from "./PlayingCard";
import { AnimatedCounter } from "./AnimatedCounter";
import { ActionButton } from "./ActionButton";

// Spectator mode: every seat is a model, the human just watches.
// The headless engine owns the rules; this component only paces it and
// paints what each model saw, returned and did.

interface ArenaPageProps {
  onExit: () => void;
}

// No persona warp: sample straight from the model's own distribution so the
// table shows each model's native style.
const RAW: Persona = {
  id: "RAW",
  label: "RAW",
  description: "Model's own distribution, unmodified",
  aggression: 1,
  looseness: 1,
  bluffFreq: 0,
  sizing: "standard",
  temperature: 1,
  tiltFactor: 1,
};

const STARTING_CHIPS = 10000;
const BIG_BLIND = 200;
const API_KEY = process.env.OPENROUTER_API_KEY;
const SPEEDS = [
  { label: "FAST", ms: 400 },
  { label: "NORMAL", ms: 1200 },
  { label: "SLOW", ms: 3000 },
];

interface LastDecision {
  action: string;
  amount?: number;
  probs: Record<string, number>;
  handStrength: number;
  reasoning?: string;
  latencyMs: number;
  error?: string;
}

interface SeatStats {
  dealt: number;
  won: number;
  decisions: number;
  latency: number;
  raises: number;
  calls: number;
  vpip: Set<number>;
}

interface FeedItem {
  id: number;
  hand: number;
  playerId?: string;
  text: string;
  kind: "action" | "result" | "street";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const modelFor = (id: string) => AI_MODELS.find((m) => m.id === id);
const PHASE_LABEL: Record<GamePhase, string> = {
  [GamePhase.PRE_FLOP]: "PRE-FLOP",
  [GamePhase.FLOP]: "FLOP",
  [GamePhase.TURN]: "TURN",
  [GamePhase.RIVER]: "RIVER",
  [GamePhase.SHOWDOWN]: "SHOWDOWN",
};

export const ArenaPage: React.FC<ArenaPageProps> = ({ onExit }) => {
  const [seatModels, setSeatModels] = useState<string[]>(AI_MODELS.map((m) => m.id));
  const [engine, setEngine] = useState<EngineState | null>(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [revealCards, setRevealCards] = useState(true);
  const [thinking, setThinking] = useState<string | null>(null);
  const [last, setLast] = useState<Record<string, LastDecision>>({});
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState<Record<string, SeatStats>>({});
  const [chipHistory, setChipHistory] = useState<Record<string, number>[]>([]);
  const inflight = useRef<{ key: string; promise: Promise<{ decision: ReturnType<typeof decideWithPersona>; latencyMs: number; probs: Record<string, number>; strength: number; words?: string; error?: string }> } | null>(null);
  const feedId = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);

  const delayMs = SPEEDS[speed].ms;

  const pushFeed = (item: Omit<FeedItem, "id">) =>
    setFeed((f) => [...f.slice(-199), { ...item, id: feedId.current++ }]);

  const toggleSeat = (id: string) =>
    setSeatModels((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const deal = () => {
    const players: Player[] = seatModels.map((id, i) => {
      const m = modelFor(id)!;
      return {
        id: `seat-${i}`,
        name: m.label,
        isHuman: false,
        chips: STARTING_CHIPS,
        hand: [],
        status: "WAITING",
        position: "",
        isDealer: false,
        isActive: true,
        currentBet: 0,
        model: id,
      };
    });
    const initialStats: Record<string, SeatStats> = {};
    players.forEach((p) => {
      initialStats[p.id] = { dealt: 0, won: 0, decisions: 0, latency: 0, raises: 0, calls: 0, vpip: new Set() };
    });
    setStats(initialStats);
    setChipHistory([Object.fromEntries(players.map((p) => [p.id, p.chips]))]);
    setFeed([]);
    setLast({});
    setEngine(createEngine(players, BIG_BLIND));
    setRunning(true);
  };

  // --- Game loop: one step per engine state while running ---
  useEffect(() => {
    if (!engine || !running) return;
    let cancelled = false;

    const step = async () => {
      // Between hands
      if (engine.handOver) {
        if (engine.result) {
          engine.result.payouts.forEach((p) => {
            const name = engine.players.find((x) => x.id === p.playerId)?.name;
            pushFeed({ hand: engine.handNumber, playerId: p.playerId, kind: "result", text: `${name} wins $${p.amount.toLocaleString()} · ${p.winningHandName}` });
          });
          setStats((s) => {
            const next = { ...s };
            new Set(engine.result!.payouts.map((p) => p.playerId)).forEach((id: string) => {
              next[id] = { ...next[id], won: next[id].won + 1 };
            });
            return next;
          });
          setChipHistory((h) => [...h, Object.fromEntries(engine.players.map((p) => [p.id, p.chips]))]);
        }
        if (playersWithChips(engine).length < 2) {
          setRunning(false);
          return;
        }
        await sleep(engine.result ? delayMs * 3 : 0);
        if (cancelled) return;
        setThinking(null);
        setEngine(startHand(engine));
        return;
      }

      if (!engine.activePlayerId) return;
      const me = engine.players.find((p) => p.id === engine.activePlayerId)!;
      const key = `${engine.handNumber}:${engine.handHistory.length}`;

      // Announce new hand / street once
      if (engine.handHistory.length === 1) {
        pushFeed({ hand: engine.handNumber, kind: "street", text: `Hand #${engine.handNumber} · dealer ${engine.players[engine.dealerIndex].name}` });
        setStats((s) => {
          const next = { ...s };
          engine.players.filter((p) => p.hand.length).forEach((p) => {
            next[p.id] = { ...next[p.id], dealt: next[p.id].dealt + 1 };
          });
          return next;
        });
      }

      setThinking(me.id);
      if (!inflight.current || inflight.current.key !== key) {
        const situation = buildSituation(
          me,
          engine.players,
          engine.board,
          potTotal(engine),
          engine.phase,
          currentHighBet(engine),
          BIG_BLIND,
          engine.handHistory,
          me.reasoningHistory ?? []
        );
        const promise = (async () => {
          try {
            if (!API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
            const trace = await runModel(situation, me.model!, API_KEY);
            const decision = decideWithPersona(situation, trace.judgement, RAW, 1);
            return {
              decision,
              latencyMs: trace.latencyMs,
              probs: trace.judgement.actionProbs as Record<string, number>,
              strength: trace.judgement.handStrength,
              words: trace.judgement.reasoning,
            };
          } catch (error) {
            return {
              decision: { action: situation.safeDefault, reasoning: "Error in AI service." },
              latencyMs: 0,
              probs: {},
              strength: 0,
              error: String((error as Error).message ?? error),
            };
          }
        })();
        inflight.current = { key, promise };
      }

      const result = await inflight.current.promise;
      if (cancelled) return;

      const { decision } = result;
      setLast((l) => ({
        ...l,
        [me.id]: {
          action: decision.action,
          amount: decision.amount,
          probs: result.probs,
          handStrength: result.strength,
          reasoning: result.words,
          latencyMs: result.latencyMs,
          error: result.error,
        },
      }));
      setStats((s) => {
        const cur = s[me.id];
        const vpip = new Set(cur.vpip);
        if (engine.phase === GamePhase.PRE_FLOP && (decision.action === "call" || decision.action === "raise")) vpip.add(engine.handNumber);
        return {
          ...s,
          [me.id]: {
            ...cur,
            decisions: cur.decisions + 1,
            latency: cur.latency + result.latencyMs,
            raises: cur.raises + (decision.action === "raise" ? 1 : 0),
            calls: cur.calls + (decision.action === "call" ? 1 : 0),
            vpip,
          },
        };
      });
      const verb =
        decision.action === "raise"
          ? `${currentHighBet(engine) > 0 ? "raises to" : "bets"} $${decision.amount?.toLocaleString()}`
          : decision.action === "call"
            ? `calls $${(currentHighBet(engine) - me.currentBet).toLocaleString()}`
            : decision.action;
      pushFeed({ hand: engine.handNumber, playerId: me.id, kind: "action", text: `${me.name} ${verb}` });

      await sleep(delayMs);
      if (cancelled) return;
      setThinking(null);
      // Compute outside the state updater: updaters must stay pure (StrictMode runs them twice)
      const next = applyAction(engine, decision.action, decision.amount);
      // Keep the model's own reasoning line in its hand memory
      const players = next.players.map((p) =>
        p.id === me.id && decision.reasoning
          ? { ...p, reasoningHistory: [...(p.reasoningHistory ?? []), `[${engine.phase}] ${decision.reasoning}`].slice(-6) }
          : p
      );
      if (next.phase !== engine.phase && !next.handOver) {
        pushFeed({ hand: next.handNumber, kind: "street", text: `— ${PHASE_LABEL[next.phase]} —` });
      }
      setEngine({ ...next, players });
    };

    step();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, running, delayMs]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [feed]);

  const standings = useMemo(
    () => (engine ? [...engine.players].sort((a, b) => b.chips - a.chips) : []),
    [engine]
  );
  const winners = new Set(engine?.handOver ? engine.result?.payouts.map((p) => p.playerId) : []);
  const board = engine ? visibleBoard(engine) : [];
  const showAll = revealCards || engine?.phase === GamePhase.SHOWDOWN || (engine?.handOver && engine.result?.showdown);
  const gameOver = engine && engine.handOver && playersWithChips(engine).length < 2 && engine.handNumber > 0;

  // ---------- Pre-start: pick the seats ----------
  if (!engine) {
    return (
      <div className="w-full h-full overflow-y-auto flex items-center justify-center p-4 md:p-8 relative z-20">
        <button onClick={onExit} className="absolute top-4 left-4 z-50 p-2 rounded-full bg-black/40 text-white/30 hover:text-white hover:bg-white/10 transition-all backdrop-blur-md" title="Back">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <div className="w-full max-w-3xl flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="border-b border-white/10 pb-4">
            <h2 className="text-xl md:text-3xl font-light text-white tracking-tight">MODEL ARENA</h2>
            <p className="text-xs text-white/40 mt-2">Every seat is a model. Pick who plays, then watch. {STARTING_CHIPS.toLocaleString()} chips each, blinds {BIG_BLIND / 2}/{BIG_BLIND}.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {AI_MODELS.map((m) => {
              const on = seatModels.includes(m.id);
              return (
                <button key={m.id} onClick={() => toggleSeat(m.id)} title={m.id}
                  className={`relative flex flex-col items-start py-4 px-4 rounded-xl border transition-all duration-300 text-left ${on ? "bg-white/5 border-white/30" : "bg-black/40 border-white/5 opacity-50 hover:opacity-80"}`}>
                  <span className="flex items-center gap-2 font-mono font-bold text-sm tracking-wider" style={{ color: m.color }}>
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: m.color }} />{m.label}
                  </span>
                  <span className="text-[0.6rem] font-mono text-white/40 mt-1">{m.sub}</span>
                  <span className="text-[0.5rem] uppercase tracking-[0.2em] text-white/25 mt-1">{m.kind === "decisions" ? "probabilities" : "chat + json"}</span>
                </button>
              );
            })}
          </div>
          <ActionButton onClick={deal} variant="gold" disabled={seatModels.length < 2} className="w-full text-xs md:text-sm tracking-[0.3em] py-5">
            DEAL · {seatModels.length} SEATS
          </ActionButton>
        </div>
      </div>
    );
  }

  // ---------- Live table ----------
  return (
    <div className="w-full h-full flex flex-col relative z-20 overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-3 px-3 md:px-5 py-2 border-b border-white/10 bg-black/30 backdrop-blur-md">
        <button onClick={onExit} className="p-2 rounded-full text-white/30 hover:text-white hover:bg-white/10 transition-all" title="Exit">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-xs md:text-sm font-light tracking-[0.2em] text-white">MODEL ARENA</span>
        <span className="font-mono text-[0.65rem] text-white/40">HAND #{engine.handNumber} · {PHASE_LABEL[engine.phase]}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:flex rounded-lg overflow-hidden border border-white/10">
            {SPEEDS.map((s, i) => (
              <button key={s.label} onClick={() => setSpeed(i)} className={`px-3 py-1 text-[0.6rem] font-mono tracking-widest ${speed === i ? "bg-[#d4af37]/20 text-[#d4af37]" : "text-white/40 hover:text-white"}`}>{s.label}</button>
            ))}
          </div>
          <button onClick={() => setRevealCards((v) => !v)} className={`px-3 py-1 rounded-lg border border-white/10 text-[0.6rem] font-mono tracking-widest ${revealCards ? "text-[#d4af37]" : "text-white/40"}`}>
            {revealCards ? "CARDS UP" : "CARDS DOWN"}
          </button>
          {!gameOver && (
            <button onClick={() => setRunning((r) => !r)} className={`px-4 py-1 rounded-lg border text-[0.6rem] font-mono tracking-widest ${running ? "border-white/20 text-white" : "border-[#d4af37] text-[#d4af37]"}`}>
              {running ? "PAUSE" : "PLAY"}
            </button>
          )}
        </div>
      </div>

      <div className="grow min-h-0 flex flex-col lg:flex-row">
        {/* Table */}
        <div className="grow min-h-0 overflow-y-auto p-3 md:p-5 flex flex-col gap-4">
          {/* Board + pot */}
          <div className="flex items-center justify-center gap-4 md:gap-8 py-3 md:py-5 rounded-2xl bg-black/20 border border-white/5">
            <div className="flex gap-1.5 md:gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <PlayingCard key={engine.handNumber + "-" + i} card={board[i]} hidden={!board[i]} size="sm" delay={i * 0.08} />
              ))}
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[0.55rem] uppercase tracking-[0.3em] text-white/30">Pot</span>
              <span className="font-mono text-xl md:text-2xl text-[#d4af37]"><AnimatedCounter value={potTotal(engine)} prefix="$" /></span>
            </div>
            {gameOver && (
              <div className="flex flex-col items-center gap-2 pl-4 border-l border-white/10">
                <span className="text-[0.6rem] uppercase tracking-[0.3em] text-[#d4af37]">Tournament over</span>
                <ActionButton onClick={() => setEngine(null)} variant="gold" className="text-[0.6rem] tracking-[0.2em] px-4 py-2">NEW GAME</ActionButton>
              </div>
            )}
          </div>

          {/* Seats */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {engine.players.map((p) => {
              const m = modelFor(p.model!)!;
              const active = engine.activePlayerId === p.id && !engine.handOver;
              const out = p.status === "ELIMINATED" || (p.chips + p.currentBet <= 0 && p.hand.length === 0);
              const folded = p.status === "FOLDED";
              const ld = last[p.id];
              const isWinner = winners.has(p.id);
              const showCards = p.hand.length > 0 && !folded && (showAll || isWinner);
              return (
                <div key={p.id} className={`relative rounded-xl border p-3 flex flex-col gap-2 transition-all duration-300 ${isWinner ? "border-[#d4af37] bg-[#d4af37]/10 shadow-[0_0_30px_rgba(212,175,55,0.2)]" : active ? "border-white/40 bg-white/5" : "border-white/5 bg-black/30"} ${out || folded ? "opacity-40" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
                    <span className="font-mono font-bold text-xs tracking-wider" style={{ color: m.color }}>{p.name}</span>
                    {p.position && <span className={`text-[0.5rem] font-mono px-1.5 py-0.5 rounded ${p.isDealer ? "bg-[#d4af37] text-black" : "bg-white/10 text-white/60"}`}>{p.position}</span>}
                    <span className="ml-auto font-mono text-xs text-white"><AnimatedCounter value={p.chips} prefix="$" /></span>
                  </div>
                  <div className="flex items-center gap-2 h-[54px]">
                    <div className="flex gap-1">
                      {p.hand.length > 0 && !folded ? (
                        p.hand.map((c, i) => <PlayingCard key={engine.handNumber + c.id} card={c} hidden={!showCards} size="xs" delay={i * 0.06} />)
                      ) : (
                        <span className="text-[0.6rem] text-white/20 font-mono">{out ? "ELIMINATED" : folded ? "FOLDED" : "—"}</span>
                      )}
                    </div>
                    {p.currentBet > 0 && (
                      <span className="ml-auto text-[0.6rem] font-mono text-white/60">bet <span className="text-white">${p.currentBet.toLocaleString()}</span></span>
                    )}
                    {p.status === "ALL-IN" && <span className="ml-auto text-[0.55rem] font-mono tracking-widest text-red-400">ALL-IN</span>}
                  </div>
                  {/* Thought bubble */}
                  <div className="min-h-[44px] text-[0.62rem] leading-snug border-t border-white/5 pt-2">
                    {thinking === p.id ? (
                      <span className="text-white/50 font-mono animate-pulse">thinking…</span>
                    ) : ld ? (
                      <>
                        <div className="flex flex-wrap gap-x-2 font-mono text-white/50">
                          <span className="text-white uppercase">{ld.action}{ld.amount ? ` $${ld.amount.toLocaleString()}` : ""}</span>
                          {(Object.entries(ld.probs) as [string, number][]).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                            <span key={k}>{k} {Math.round(v * 100)}%</span>
                          ))}
                          <span className="text-white/30">str {Number.isInteger(ld.handStrength) ? ld.handStrength : ld.handStrength.toFixed(1)} · {(ld.latencyMs / 1000).toFixed(1)}s</span>
                        </div>
                        {ld.reasoning && <div className="text-white/45 italic mt-1 line-clamp-3">“{ld.reasoning}”</div>}
                        {ld.error && <div className="text-red-400 mt-1 truncate">{ld.error}</div>}
                      </>
                    ) : (
                      <span className="text-white/20 font-mono">waiting</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="shrink-0 lg:w-[300px] xl:w-[340px] border-t lg:border-t-0 lg:border-l border-white/10 bg-black/30 flex flex-col min-h-[240px] lg:min-h-0">
          <div className="p-3 border-b border-white/10">
            <div className="text-[0.55rem] uppercase tracking-[0.3em] text-white/30 mb-2">Standings</div>
            <div className="flex flex-col gap-1">
              {standings.map((p, i) => {
                const m = modelFor(p.model!)!;
                const st = stats[p.id];
                const net = p.chips - STARTING_CHIPS;
                return (
                  <div key={p.id} className="flex items-center gap-2 text-[0.68rem] font-mono">
                    <span className="text-white/30 w-3">{i + 1}</span>
                    <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
                    <span className="text-white/80 w-16 truncate">{p.name}</span>
                    <span className="text-white w-14 text-right">{p.chips.toLocaleString()}</span>
                    <span className={`w-14 text-right ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>{net >= 0 ? "+" : ""}{net.toLocaleString()}</span>
                    <span className="ml-auto text-white/30" title="hands won / VPIP / avg latency">
                      {st ? `${st.won}w · ${st.dealt ? Math.round((st.vpip.size / st.dealt) * 100) : 0}% · ${st.decisions ? (st.latency / st.decisions / 1000).toFixed(1) : "0.0"}s` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            {chipHistory.length > 2 && (
              <svg viewBox="0 0 300 60" className="w-full h-[60px] mt-3" role="img" aria-label="Chip history">
                {engine.players.map((p) => {
                  const max = Math.max(...chipHistory.flatMap((h) => Object.values(h) as number[]), 1);
                  const pts = chipHistory.map((h, k) => `${(k / (chipHistory.length - 1)) * 300},${60 - ((h[p.id] ?? 0) / max) * 56 - 2}`).join(" ");
                  return <polyline key={p.id} points={pts} fill="none" stroke={modelFor(p.model!)!.color} strokeWidth="1.5" />;
                })}
              </svg>
            )}
          </div>
          <div className="text-[0.55rem] uppercase tracking-[0.3em] text-white/30 px-3 pt-3 pb-1">Action</div>
          <div ref={feedRef} className="grow min-h-0 overflow-y-auto px-3 pb-3 flex flex-col gap-1">
            {feed.map((f) => {
              const color = f.playerId ? modelFor(engine.players.find((p) => p.id === f.playerId)?.model ?? "")?.color : undefined;
              return (
                <div key={f.id} className={`text-[0.66rem] font-mono ${f.kind === "street" ? "text-white/30 mt-1" : f.kind === "result" ? "text-[#d4af37]" : "text-white/70"}`}>
                  {color && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: color }} />}
                  {f.text}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
