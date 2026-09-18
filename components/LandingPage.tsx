import React, { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { AI_MODELS, AI_NAMES, DEFAULT_CONFIG, modelCostPerM } from "../constants";
import { GameConfig } from "../types";
import { ActionButton } from "./ActionButton";
import { Assignees, Person } from "./Assignees";

// Table setup in three layers: the VENUE decides which model providers are
// on the menu; ordering from the menu seats a PERSON — a name and a face —
// who thinks with that model; the pill at the top is who is at the table.

interface LandingPageProps {
  onStartGame: (config: GameConfig) => void;
  username: string | null;
  isExiting?: boolean;
}

interface GameLevel {
  id: string;
  name: string;
  sub: string;
  buyIn: number;
  blindBig: number;
  desc: string;
  budgetPerM: number; // the dearest provider this venue will pay for, USD per million tokens
}

// What each venue serves follows from its budget and OpenRouter's prices:
// the cheaper the room, the cheaper the brains.
const menuFor = (venue: GameLevel) =>
  AI_MODELS.filter((m) => modelCostPerM(m) <= venue.budgetPerM).sort(
    (a, b) => modelCostPerM(a) - modelCostPerM(b)
  );

const LEVELS: GameLevel[] = [
  {
    id: "footscray",
    name: "FOOTSCRAY COURTS",
    sub: "Inner West",
    buyIn: 200,
    blindBig: 2,
    desc: "Entry-Level",
    budgetPerM: 0.05, // Jev only
  },
  {
    id: "boxhill",
    name: "BOX HILL CENTRE",
    sub: "Eastern Hub",
    buyIn: 1000,
    blindBig: 10,
    desc: "Middle-Class",
    budgetPerM: 1, // + DeepSeek V4 Flash, Gemini Flash Lite
  },
  {
    id: "glen",
    name: "GLEN WAVERLEY",
    sub: "School District",
    buyIn: 10000,
    blindBig: 100,
    desc: "Family-Stability",
    budgetPerM: 3, // + GPT-5 mini, Kimi K2.5
  },
  {
    id: "balwyn",
    name: "BALWYN HILL",
    sub: "Blue-Chip East",
    buyIn: 100000,
    blindBig: 1000,
    desc: "Old Money",
    budgetPerM: 4, // + Grok 4.3
  },
  {
    id: "toorak",
    name: "TOORAK ESTATE",
    sub: "Elite South",
    buyIn: 500000,
    blindBig: 5000,
    desc: "Top of the Chain",
    budgetPerM: Infinity, // everything, Claude Haiku included
  },
];

const MAX_OPPONENTS = 9; // a 10-max table

interface Seat {
  id: string; // the person's name doubles as the id
  model: string;
}

const avatarFor = (name: string) =>
  `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${encodeURIComponent(name)}`;

const modelFor = (id: string) => AI_MODELS.find((m) => m.id === id);

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartGame,
  username,
  isExiting,
}) => {
  const [selectedLevelId, setSelectedLevelId] = useState<string>(LEVELS[0].id);
  // The default order: one JEV, the only thing the entry venue serves
  const [seats, setSeats] = useState<Seat[]>([{ id: AI_NAMES[0], model: AI_MODELS[0].id }]);

  const level = LEVELS.find((l) => l.id === selectedLevelId) ?? LEVELS[0];
  const menu = useMemo(() => menuFor(level), [level]);

  // Moving venue sends home anyone whose provider is not on the new menu
  useEffect(() => {
    setSeats((s) => s.filter((seat) => menu.some((m) => m.id === seat.model)));
  }, [menu]);

  const cast: Person[] = useMemo(
    () =>
      seats.map((seat) => {
        const m = modelFor(seat.model);
        return { id: seat.id, name: seat.id, role: m?.label ?? seat.model, color: m?.color, avatar: avatarFor(seat.id) };
      }),
    [seats]
  );

  const countOf = (modelId: string) => seats.filter((s) => s.model === modelId).length;

  // Someone joins: the first name nobody at the table has yet
  const join = (modelId: string) =>
    setSeats((s) => {
      if (s.length >= MAX_OPPONENTS) return s;
      const name = AI_NAMES.find((n) => !s.some((seat) => seat.id === n));
      if (!name) return s;
      return [...s, { id: name, model: modelId }];
    });

  // Someone leaves: the most recent person on that model
  const leave = (modelId: string) =>
    setSeats((s) => {
      const idx = [...s].map((seat) => seat.model).lastIndexOf(modelId);
      return idx === -1 ? s : s.filter((_, i) => i !== idx);
    });

  const config: GameConfig = {
    ...DEFAULT_CONFIG,
    playerName: username || DEFAULT_CONFIG.playerName,
    blindBig: level.blindBig,
    startingStackHuman: level.buyIn,
    startingStackAI: level.buyIn,
    opponents: seats.map((s) => ({ name: s.id, model: s.model })),
    opponentModels: seats.map((s) => s.model),
    opponentCount: seats.length,
  };

  return (
    <div
      className={`
            w-full h-full flex flex-col relative z-20
            transition-all duration-700 ease-[cubic-bezier(0.64,0,0.78,0)]
            ${isExiting
          ? "-translate-y-8 opacity-0 blur-md"
          : "translate-y-0 opacity-100 blur-0"
        }
        `}
    >
      {/* Background elements */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-2/3 h-full bg-gradient-to-l from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col items-center p-4 md:p-6 py-8 md:py-12">
        <div className="w-full max-w-4xl flex flex-col gap-6 md:gap-8 animate-in slide-in-from-bottom-12 fade-in duration-700">
          {/* Header */}
          <div className="flex flex-col border-b border-white/10 pb-4 md:pb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl md:text-3xl font-light text-white tracking-tight font-sans">
                TABLE SETUP
              </h2>
              <div className="flex items-center gap-3">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#d4af37] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-full w-full bg-[#d4af37]"></span>
                </span>
                <span className="text-[0.6rem] md:text-xs font-mono text-white/50 uppercase tracking-widest">
                  PLAYER:{" "}
                  <span className="text-white">{username || "UNKNOWN"}</span>
                </span>
              </div>
            </div>
          </div>

          {/* VENUE — decides the menu */}
          <div className="flex flex-col gap-4">
            <label className="text-[0.6rem] font-bold uppercase tracking-widest text-[#666] font-sans pl-1">
              Select Venue
            </label>

            <div className="w-full overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 no-scrollbar snap-x snap-mandatory">
              <div className="flex gap-4 min-w-max">
                {LEVELS.map((venue) => {
                  const isActive = selectedLevelId === venue.id;
                  return (
                    <button
                      key={venue.id}
                      onClick={(e) => {
                        setSelectedLevelId(venue.id);
                        e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
                      }}
                      className={`
                                                relative w-[240px] md:w-[260px] p-6 rounded-2xl border text-left flex flex-col gap-4
                                                transition-all duration-300 snap-center group
                                                ${isActive
                          ? "bg-[#d4af37] border-[#d4af37] text-black shadow-[0_0_30px_rgba(212,175,55,0.2)] scale-100"
                          : "bg-black/40 border-white/10 text-gray-400 hover:bg-white/5 hover:border-white/30 scale-95 hover:scale-100"
                        }
                                            `}
                    >
                      <div className="flex justify-between items-start w-full">
                        <div className="flex flex-col">
                          <span
                            className={`text-[0.6rem] font-mono uppercase tracking-widest mb-1 ${isActive ? "text-black/60" : "text-gray-500"
                              }`}
                          >
                            {venue.sub}
                          </span>
                          <span
                            className={`text-lg font-bold font-sans tracking-tight leading-none ${isActive ? "text-black" : "text-white"
                              }`}
                          >
                            {venue.name}
                          </span>
                        </div>
                        {isActive && (
                          <div className="w-2 h-2 rounded-full bg-black animate-pulse" />
                        )}
                      </div>

                      <div className="mt-auto flex flex-col gap-1">
                        <div className="flex justify-between items-end border-b border-black/10 pb-2 mb-2">
                          <span className="text-[0.6rem] uppercase font-bold">
                            Buy-In
                          </span>
                          <span className="font-mono text-xl font-bold tracking-tighter">
                            ${venue.buyIn.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between items-end">
                          <span className="text-[0.6rem] uppercase font-bold">
                            Blinds
                          </span>
                          <span className="font-mono text-sm font-bold">
                            ${venue.blindBig / 2}/${venue.blindBig}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[0.5rem] uppercase tracking-widest font-bold shadow-sm ${isActive
                          ? "bg-black text-[#d4af37]"
                          : "bg-[#222] text-gray-500"
                          }`}
                      >
                        {venue.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>


          {/* AT THE TABLE — who has joined */}
          <div className="relative z-20 bg-black/20 border border-white/5 rounded-2xl p-5 md:p-6 backdrop-blur-sm flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            <div className="flex flex-col md:w-56 shrink-0">
              <label className="text-[0.6rem] font-bold uppercase tracking-widest text-[#666] font-sans pl-1">
                At the table
              </label>
              <span className="text-xs text-white/40 mt-1 pl-1">
                {seats.length === 0 ? "Nobody yet" : `${seats.length + 1}-handed`}
              </span>
            </div>
            <Assignees cast={cast} value={seats.map((s) => s.id)} onChange={(ids) => setSeats((s) => s.filter((seat) => ids.includes(seat.id)))} />
          </div>

          {/* MENU — what this venue serves */}
          <div className="bg-black/20 border border-white/5 rounded-2xl p-5 md:p-6 backdrop-blur-sm">
            <div className="flex items-baseline justify-between mb-3">
              <div className="flex flex-col">
                <label className="text-[0.6rem] font-bold uppercase tracking-widest text-[#666] font-sans pl-1">
                  Menu · {level.name}
                </label>
                <span className="text-xs text-white/40 mt-1 pl-1">{menu.length === 1 ? "One provider here" : `${menu.length} providers here`} · order one, someone sits down with it</span>
              </div>
              <span className="text-[0.65rem] font-mono text-white/35 shrink-0 whitespace-nowrap pl-3">{seats.length} / {MAX_OPPONENTS}</span>
            </div>
            <div className="rounded-xl bg-black/30 border border-white/5 divide-y divide-white/5">
              {menu.map((m) => {
                const n = countOf(m.id);
                const full = seats.length >= MAX_OPPONENTS;
                return (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-3">
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
                    <div className="min-w-0 flex-1">
                      <span className={`font-mono text-sm tracking-wider ${n ? "text-[#d4af37]" : "text-white"}`}>{m.label}</span>
                      <div className="text-[0.7rem] text-white/35 truncate">
                        {m.sub}
                        <span className="text-white/25"> · ${modelCostPerM(m).toFixed(2)}/M</span>
                      </div>
                    </div>
                    {n === 0 ? (
                      <button
                        onClick={() => join(m.id)}
                        disabled={full}
                        aria-label={`Seat someone on ${m.label}`}
                        className="w-9 h-9 rounded-full border border-white/15 text-white/70 grid place-items-center hover:border-[#d4af37] hover:text-[#d4af37] disabled:opacity-30 transition-colors"
                      >
                        <Plus size={16} strokeWidth={2.2} />
                      </button>
                    ) : (
                      <div className="flex items-center rounded-full bg-[#d4af37] text-black h-9">
                        <button onClick={() => leave(m.id)} aria-label={`Send one ${m.label} player home`} className="w-9 h-9 grid place-items-center rounded-full hover:bg-black/10">
                          <Minus size={16} strokeWidth={2.4} />
                        </button>
                        <span className="w-5 text-center font-mono font-bold text-sm tabular-nums">{n}</span>
                        <button onClick={() => join(m.id)} disabled={full} aria-label={`Seat one more on ${m.label}`} className="w-9 h-9 grid place-items-center rounded-full hover:bg-black/10 disabled:opacity-30">
                          <Plus size={16} strokeWidth={2.4} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* DEAL — the footer, always in view */}
      <div className="shrink-0 z-30 px-4 md:px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 border-t border-white/10 bg-[#0b1510]/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto">
          <ActionButton
            onClick={() => onStartGame(config)}
            disabled={seats.length === 0}
            variant="gold"
            className="w-full text-xs md:text-sm tracking-[0.3em] py-5 md:py-6 shadow-[0_0_40px_rgba(212,175,55,0.15)] hover:shadow-[0_0_80px_rgba(212,175,55,0.3)] border-[#d4af37]/50"
          >
            {seats.length === 0 ? "SEAT SOMEONE FIRST" : `DEAL · ${seats.length + 1} PLAYERS · ${level.name}`}
          </ActionButton>
        </div>
      </div>
    </div>
  );
};
