import React, { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { AI_MODELS, DEFAULT_CONFIG } from "../constants";
import { GameConfig } from "../types";

// Table setup, laid out like an order sheet: pick the stakes, then say how
// many of each opponent you want. Two JEVs and three GPTs is a valid order.

interface LandingPageProps {
  onStartGame: (config: GameConfig) => void;
  username: string | null;
  isExiting?: boolean;
}

interface Stakes {
  id: string;
  name: string;
  buyIn: number;
  blindBig: number;
}

const STAKES: Stakes[] = [
  { id: "footscray", name: "Footscray", buyIn: 200, blindBig: 2 },
  { id: "boxhill", name: "Box Hill", buyIn: 1000, blindBig: 10 },
  { id: "glen", name: "Glen Waverley", buyIn: 10000, blindBig: 100 },
  { id: "balwyn", name: "Balwyn", buyIn: 100000, blindBig: 1000 },
  { id: "toorak", name: "Toorak", buyIn: 500000, blindBig: 5000 },
];

const MAX_OPPONENTS = 9; // a 10-max table

const avatarFor = (label: string) =>
  `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${encodeURIComponent(label)}`;

// counts per model → one seat per unit, in menu order
const seatsFrom = (counts: Record<string, number>) =>
  AI_MODELS.flatMap((m) => Array.from({ length: counts[m.id] ?? 0 }, () => m.id));

const countsFrom = (seats: string[]) =>
  seats.reduce<Record<string, number>>((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {});

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartGame,
  username,
  isExiting,
}) => {
  const [stakesId, setStakesId] = useState<string>(STAKES[0].id);
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    countsFrom(DEFAULT_CONFIG.opponentModels ?? [])
  );

  const stakes = STAKES.find((s) => s.id === stakesId) ?? STAKES[0];
  const seats = useMemo(() => seatsFrom(counts), [counts]);
  const total = seats.length;

  const config: GameConfig = {
    ...DEFAULT_CONFIG,
    playerName: username || DEFAULT_CONFIG.playerName,
    blindBig: stakes.blindBig,
    startingStackHuman: stakes.buyIn,
    startingStackAI: stakes.buyIn,
    opponentModels: seats,
    opponentCount: total,
  };

  const bump = (id: string, delta: number) =>
    setCounts((c) => {
      if (delta > 0 && total >= MAX_OPPONENTS) return c;
      return { ...c, [id]: Math.max(0, (c[id] ?? 0) + delta) };
    });

  // Keep the page's own scroll at the top when it mounts after the login transition
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div
      className={`
        w-full h-full overflow-y-auto overflow-x-hidden relative z-20
        transition-all duration-700 ease-[cubic-bezier(0.64,0,0.78,0)]
        ${isExiting ? "-translate-y-8 opacity-0 blur-md" : "translate-y-0 opacity-100 blur-0"}
      `}
    >
      <div className="min-h-full flex flex-col max-w-md mx-auto px-5 pt-10 pb-32 animate-in slide-in-from-bottom-8 fade-in duration-700">
        {/* Header */}
        <div className="flex items-baseline justify-between border-b border-white/10 pb-4 mb-6">
          <h2 className="text-xl font-light text-white tracking-tight">Table</h2>
          <span className="text-[0.65rem] font-mono text-white/40 uppercase tracking-widest">
            {username || "Player"}
          </span>
        </div>

        {/* Stakes */}
        <div className="text-[0.6rem] font-bold uppercase tracking-widest text-white/35 mb-2">Stakes</div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1 mb-7">
          {STAKES.map((s) => {
            const on = s.id === stakesId;
            return (
              <button
                key={s.id}
                onClick={() => setStakesId(s.id)}
                className={`shrink-0 px-4 py-2 rounded-full border text-sm transition-all ${
                  on
                    ? "bg-[#d4af37] border-[#d4af37] text-black font-semibold"
                    : "bg-black/30 border-white/10 text-white/60 hover:border-white/30"
                }`}
              >
                ${s.buyIn.toLocaleString()}
                <span className={`ml-2 font-mono text-[0.65rem] ${on ? "text-black/60" : "text-white/30"}`}>
                  {s.blindBig / 2}/{s.blindBig}
                </span>
              </button>
            );
          })}
        </div>

        {/* Opponents menu */}
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[0.6rem] font-bold uppercase tracking-widest text-white/35">Opponents</div>
          <div className="text-[0.65rem] font-mono text-white/35">{total} / {MAX_OPPONENTS}</div>
        </div>
        <div className="rounded-2xl bg-black/30 border border-white/5 divide-y divide-white/5">
          {AI_MODELS.map((m) => {
            const n = counts[m.id] ?? 0;
            const full = total >= MAX_OPPONENTS;
            return (
              <div key={m.id} className="flex items-center gap-3 px-3 py-3">
                <img
                  src={avatarFor(m.label)}
                  alt=""
                  draggable={false}
                  className={`w-10 h-10 rounded-full bg-white shrink-0 transition-opacity ${n ? "opacity-100" : "opacity-40"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: m.color }} />
                    <span className={`font-mono text-sm tracking-wider ${n ? "text-white" : "text-white/60"}`}>{m.label}</span>
                  </div>
                  <div className="text-[0.7rem] text-white/35 truncate">{m.sub}</div>
                </div>

                {/* the stepper: a lone + until you order one, then − n + */}
                {n === 0 ? (
                  <button
                    onClick={() => bump(m.id, 1)}
                    disabled={full}
                    aria-label={`Add ${m.label}`}
                    className="w-9 h-9 rounded-full border border-white/15 text-white/70 grid place-items-center hover:border-[#d4af37] hover:text-[#d4af37] disabled:opacity-30 transition-colors"
                  >
                    <Plus size={16} strokeWidth={2.2} />
                  </button>
                ) : (
                  <div className="flex items-center rounded-full bg-[#d4af37] text-black h-9">
                    <button
                      onClick={() => bump(m.id, -1)}
                      aria-label={`Remove one ${m.label}`}
                      className="w-9 h-9 grid place-items-center rounded-full hover:bg-black/10"
                    >
                      <Minus size={16} strokeWidth={2.4} />
                    </button>
                    <span className="w-5 text-center font-mono font-bold text-sm tabular-nums">{n}</span>
                    <button
                      onClick={() => bump(m.id, 1)}
                      disabled={full}
                      aria-label={`Add one more ${m.label}`}
                      className="w-9 h-9 grid place-items-center rounded-full hover:bg-black/10 disabled:opacity-30"
                    >
                      <Plus size={16} strokeWidth={2.4} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Order button, pinned */}
      <div className="fixed inset-x-0 bottom-0 z-30 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-[#0b1510] via-[#0b1510]/95 to-transparent">
        <button
          onClick={() => onStartGame(config)}
          disabled={total === 0}
          className="w-full max-w-md mx-auto flex items-center justify-between px-6 h-14 rounded-2xl bg-[#d4af37] text-black font-semibold shadow-[0_0_40px_rgba(212,175,55,0.25)] disabled:opacity-40 disabled:shadow-none transition-all active:scale-[0.99]"
        >
          <span className="tracking-[0.2em] text-sm">DEAL</span>
          <span className="font-mono text-sm">
            {total === 0 ? "pick an opponent" : `${total + 1} players · $${stakes.buyIn.toLocaleString()}`}
          </span>
        </button>
      </div>
    </div>
  );
};
