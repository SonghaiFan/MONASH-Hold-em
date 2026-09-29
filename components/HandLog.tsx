import React, { useEffect, useRef } from "react";
import { GamePhase, Player } from "../types";
import { useLanguage } from "../services/i18n";
import { Avatar } from "./Avatar";

interface HandLogProps {
  history: string[]; // GameState.handHistory: the engine's own lines
  notes: Record<number, string>; // a model's reasoning, by the history line it explains
  players: Player[];
  phase: GamePhase;
  activePlayerId: string | null;
}

type Verb = "check" | "call" | "raise" | "fold" | "allIn";

type Line =
  | { kind: "street"; phase: string }
  | { kind: "act"; name: string; pos: string; verb: Verb; label?: string; amount?: number; note?: string };

// The engine writes lines like "FLOP: Ada (BTN) 3-BETS to $120". Read them back
// into something that can be translated and laid out.
const parse = (line: string, note?: string): Line | null => {
  const street = line.match(/^--- (\w+) ---$/);
  if (street) return { kind: "street", phase: street[1] };
  const m = line.match(/^\w+: (.+) \(([^)]*)\) (.+)$/);
  if (!m) return null;
  const [, name, pos, rest] = m;
  const amount = Number(rest.match(/\$(\d+)/)?.[1]);
  const base = { kind: "act" as const, name, pos, note, amount: Number.isFinite(amount) ? amount : undefined };
  if (rest.startsWith("FOLDS")) return { ...base, verb: "fold" };
  if (rest.startsWith("CHECKS")) return { ...base, verb: "check" };
  if (rest.includes("ALL-IN")) return { ...base, verb: "allIn" };
  if (rest.startsWith("CALLS")) return { ...base, verb: "call" };
  const nBet = rest.match(/^(\d+)-BETS/);
  return { ...base, verb: "raise", label: nBet ? `${nBet[1]}-bet` : undefined };
};

const PHASES: GamePhase[] = [GamePhase.PRE_FLOP, GamePhase.FLOP, GamePhase.TURN, GamePhase.RIVER, GamePhase.SHOWDOWN];

// Desktop only: the hand so far, line by line, with what each model was thinking.
export const HandLog: React.FC<HandLogProps> = ({ history, notes, players, phase, activePlayerId }) => {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lines = history.map((l, i) => parse(l, notes[i])).filter((l): l is Line => !!l);
  const thinking = players.find((p) => p.id === activePlayerId && !p.isHuman);

  useEffect(() => {
    const el = scrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [lines.length, thinking?.id]);

  return (
    <aside className="h-full flex flex-col min-h-0">
      {/* Where the hand is */}
      <div className="shrink-0 px-1 pb-4 flex gap-1">
        {PHASES.map((ph) => {
          const at = PHASES.indexOf(phase);
          const i = PHASES.indexOf(ph);
          return (
            <div key={ph} className="flex-1 min-w-0">
              <div className={`h-1 rounded-full ${i <= at ? "bg-white/70" : "bg-white/10"}`} />
              <div className={`mt-1.5 text-[11px] truncate ${i === at ? "text-white" : "text-white/35"}`}>
                {t.desk.phases[ph]}
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 px-1 pb-2 text-[12px] text-white/35">{t.desk.handLog}</div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto no-scrollbar pr-1">
        {lines.length === 0 && !thinking && <p className="px-1 text-[13px] text-white/30">{t.desk.logEmpty}</p>}
        <ol className="space-y-1">
          {lines.map((l, i) =>
            l.kind === "street" ? (
              <li key={i} className="pt-3 pb-1 px-1 text-[11px] tracking-wide text-white/35">
                {t.desk.phases[l.phase as GamePhase] ?? l.phase}
              </li>
            ) : (
              <li key={i} className="rounded-[16px] bg-[#1c1c1e]/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Avatar
                    name={l.name}
                    isHuman={players.find((x) => x.name === l.name)?.isHuman}
                    alt=""
                    className="w-6 h-6 object-contain shrink-0"
                  />
                  <span className="text-[13px] text-white truncate">{l.name}</span>
                  <span className="text-[10px] text-white/35 shrink-0">{l.pos}</span>
                  <span className={`ml-auto shrink-0 text-[13px] tabular-nums ${l.verb === "fold" ? "text-white/40" : l.verb === "raise" || l.verb === "allIn" ? "text-[#f5e35b]" : "text-white/80"}`}>
                    {l.label ?? t.game.actions[l.verb]}
                    {l.amount !== undefined && l.verb !== "fold" && l.verb !== "check" ? ` ${l.amount.toLocaleString()}` : ""}
                  </span>
                </div>
                {l.note && <p className="mt-1.5 pl-8 text-[12px] leading-snug text-white/45">{l.note}</p>}
              </li>
            )
          )}
          {thinking && (
            <li className="rounded-[16px] border border-dashed border-white/15 px-3 py-2 flex items-center gap-2">
              <Avatar name={thinking.name} alt="" className="w-6 h-6 object-contain shrink-0" />
              <span className="text-[13px] text-white/60 truncate">{thinking.name}</span>
              <span className="ml-auto text-[12px] text-white/40 animate-pulse">{t.game.thinking}</span>
            </li>
          )}
        </ol>
      </div>
    </aside>
  );
};
