import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AI_MODELS, DEFAULT_CONFIG, modelCostPerM } from "../constants";
import { STARTING_WEALTH } from "../services/bankroll";
import { GameConfig } from "../types";
import { useLanguage } from "../services/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { OpponentSheet } from "./OpponentSheet";
import { SeatSnake } from "./SeatSnake";
import { HERO_AVATAR } from "../services/avatars";
import { NATURAL, SeatSettings, defaultSeat, defaultSeats, loadSeats, saveSeats } from "../services/seats";

interface LandingPageProps {
  onStartGame: (config: GameConfig) => void;
  username: string | null;
  wealth: number;
  onTopUp: () => void;
  isExiting?: boolean;
}

interface GameVenue {
  id: string;
  name: string;
  sub: string;
  buyIn: number;
  blindBig: number;
  desc: string;
  budgetPerM: number;
  emoji: string;
  bgClass: string;
}

const VENUES: GameVenue[] = [
  {
    id: "footscray",
    name: "Footscray Courts",
    sub: "Inner West",
    buyIn: 200,
    blindBig: 2,
    desc: "Entry-Level",
    budgetPerM: 0.05,
    emoji: "🏀",
    bgClass: "from-[#fef08a] to-[#fde047]", // butter yellow
  },
  {
    id: "boxhill",
    name: "Box Hill Centre",
    sub: "Eastern Hub",
    buyIn: 1000,
    blindBig: 10,
    desc: "Middle-Class",
    budgetPerM: 1,
    emoji: "🥟",
    bgClass: "from-[#bbf7d0] to-[#86efac]", // mint jade
  },
  {
    id: "glen",
    name: "Glen Waverley",
    sub: "School District",
    buyIn: 10000,
    blindBig: 100,
    desc: "Family-Stability",
    budgetPerM: 3,
    emoji: "🎓",
    bgClass: "from-[#bae6fd] to-[#93c5fd]", // sky blue
  },
  {
    id: "balwyn",
    name: "Balwyn Hill",
    sub: "Blue-Chip East",
    buyIn: 100000,
    blindBig: 1000,
    desc: "Old Money",
    budgetPerM: 4,
    emoji: "🏛️",
    bgClass: "from-[#e9d5ff] to-[#d8b4fe]", // lavender
  },
  {
    id: "toorak",
    name: "Toorak Estate",
    sub: "Elite South",
    buyIn: 500000,
    blindBig: 5000,
    desc: "Top of the Chain",
    budgetPerM: Infinity,
    emoji: "👑",
    bgClass: "from-[#fed7aa] to-[#fdba74]", // amber peach
  },
];

const MIN_OPPONENTS = 1;
const MAX_OPPONENTS = 9;
const HOLD_MS = 450; // how long a press must last to open an opponent

const affordable = (venue: GameVenue, wealth: number) => venue.buyIn <= wealth;

// What a venue serves: every model within its per-token budget, cheapest first
const menuFor = (venue: GameVenue) =>
  AI_MODELS.filter((m) => modelCostPerM(m) <= venue.budgetPerM).sort(
    (a, b) => modelCostPerM(a) - modelCostPerM(b)
  );

// Press and hold: a timer that a release, a scroll or a drift of the finger cancels.
// Right-click (and the long-press context menu on Android) opens at once.
const useHold = (onHold: (id: string) => void) => {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [pressing, setPressing] = useState<string | null>(null);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    origin.current = null;
    setPressing(null);
  }, []);

  const fire = useCallback(
    (id: string) => {
      cancel();
      navigator.vibrate?.(10);
      onHold(id);
    },
    [cancel, onHold]
  );

  const bind = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      origin.current = { x: e.clientX, y: e.clientY };
      setPressing(id);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => fire(id), HOLD_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 8) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      fire(id);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fire(id);
      }
    },
  });

  useEffect(() => cancel, [cancel]);
  return { bind, pressing };
};

const ChevronDown = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const Lock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="11" width="16" height="10" rx="2.5" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartGame,
  username,
  wealth,
  onTopUp,
  isExiting,
}) => {
  const { t } = useLanguage();
  const [venueIndex, setVenueIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const venue = VENUES[venueIndex];
  const menu = useMemo(() => menuFor(venue), [venue]);

  // The opponents, remembered per player
  const [seats, setSeats] = useState<SeatSettings[]>(() => loadSeats(username) ?? defaultSeats(5));
  useEffect(() => saveSeats(username, seats), [username, seats]);

  // A seat keeps the model you chose for it; a venue that doesn't serve it seats them on one it does
  const modelAt = (seat: SeatSettings, i: number) =>
    menu.some((m) => m.id === seat.model) ? seat.model : menu[i % menu.length]?.id ?? AI_MODELS[0].id;

  const [unfolded, setUnfolded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const { bind, pressing } = useHold(setEditing);
  const editingIndex = seats.findIndex((s) => s.id === editing);

  const updateSeat = (next: SeatSettings) =>
    setSeats((prev) => prev.map((s) => (s.id === next.id ? next : s)));

  const addSeat = () =>
    setSeats((prev) => (prev.length >= MAX_OPPONENTS ? prev : [...prev, defaultSeat(prev.length, prev.map((s) => s.id))]));
  const removeSeat = () => setSeats((prev) => (prev.length <= MIN_OPPONENTS ? prev : prev.slice(0, -1)));

  // --- Venue carousel: cards snap to the left edge; the one there is the one you pick ---
  const scrollToVenue = (i: number) => {
    const c = carouselRef.current;
    const card = c?.children[i] as HTMLElement | undefined;
    if (!c || !card) return;
    c.scrollTo({ left: card.offsetLeft - 20, behavior: "smooth" });
  };

  const onCarouselScroll = () => {
    const c = carouselRef.current;
    if (!c) return;
    let nearest = 0;
    let best = Infinity;
    Array.from(c.children).forEach((el, i) => {
      const d = Math.abs((el as HTMLElement).offsetLeft - 20 - c.scrollLeft);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    if (nearest !== venueIndex) setVenueIndex(nearest);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "")) return;
      if (e.key === "ArrowLeft" && venueIndex > 0) scrollToVenue(venueIndex - 1);
      if (e.key === "ArrowRight" && venueIndex < VENUES.length - 1) scrollToVenue(venueIndex + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [venueIndex, editing]);

  const venueName = (v: GameVenue) => t.venues[v.id]?.name ?? v.name;

  const config: GameConfig = {
    ...DEFAULT_CONFIG,
    playerName: username || DEFAULT_CONFIG.playerName,
    blindBig: venue.blindBig,
    startingStackHuman: venue.buyIn,
    startingStackAI: venue.buyIn,
    opponents: seats.map((s, i) => ({ name: s.id, model: modelAt(s, i), strategy: s.strategy, prompt: s.prompt })),
    opponentModels: seats.map((s, i) => modelAt(s, i)),
    opponentCount: seats.length,
  };

  const isBroke = wealth < VENUES[0].buyIn;
  const canSit = affordable(venue, wealth);

  return (
    <div
      className={`
        w-full h-full overflow-y-auto no-scrollbar bg-black
        transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)]
        ${isExiting ? "-translate-y-6 opacity-0 blur-sm" : "translate-y-0 opacity-100 blur-0"}
      `}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="w-full max-w-[480px] mx-auto min-h-full flex flex-col">
        {/* You, and the language */}
        <div className="h-14 px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 h-9 pl-1 pr-3.5 rounded-full bg-[#1c1c1e] min-w-0">
            <img src={HERO_AVATAR} alt="" draggable={false} className="w-7 h-7 object-contain" />
            <span className="text-[14px] text-white truncate">{username || t.setup.unknown}</span>
          </div>
          <LanguageToggle />
        </div>

        {/* Bankroll */}
        <div className="px-5 pt-8 pb-9">
          <div className="text-[72px] font-extralight leading-none tracking-tight text-white tabular-nums">
            {wealth.toLocaleString()}
          </div>
          <div className="mt-3 text-[15px] text-white/45">{t.setup.bankroll}</div>

          {wealth < STARTING_WEALTH && (
            <div className="mt-5 flex flex-col items-start gap-3">
              {isBroke && <p className="text-[15px] text-white/70">{t.setup.brokeTitle(wealth)}</p>}
              <button
                type="button"
                onClick={onTopUp}
                className="h-10 px-4 rounded-full bg-[#1c1c1e] text-[15px] text-white hover:bg-[#2a2a2d] active:scale-[0.97] transition-all cursor-pointer"
              >
                {t.setup.takeStakeAmount(STARTING_WEALTH)}
              </button>
            </div>
          )}
        </div>

        {/* Venues */}
        <div
          ref={carouselRef}
          onScroll={onCarouselScroll}
          className="relative flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-px-5 px-5 shrink-0"
        >
          {VENUES.map((v, i) => {
            const open = affordable(v, wealth);
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => scrollToVenue(i)}
                aria-pressed={i === venueIndex}
                className={`
                  relative shrink-0 w-[84%] h-[220px] snap-start rounded-[32px] p-6 text-left
                  flex flex-col justify-between bg-gradient-to-br ${v.bgClass} text-black select-none cursor-pointer
                  transition-opacity duration-300 ${i === venueIndex ? "opacity-100" : "opacity-60"}
                `}
              >
                <div className="flex items-start justify-between">
                  <span className="text-[52px] leading-none">{v.emoji}</span>
                  {!open && (
                    <span className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center text-black/60">
                      <Lock />
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-[26px] leading-tight tracking-tight">{venueName(v)}</div>
                  <div className="mt-1 text-[15px] text-black/55">
                    {t.setup.venueLine(v.buyIn, v.blindBig / 2, v.blindBig)}
                  </div>
                </div>
              </button>
            );
          })}
          {/* lets the last card snap to the left edge */}
          <div className="shrink-0 w-[calc(16%-32px)]" aria-hidden />
        </div>

        {/* The table: faces stacked until you open it, then a list you can edit */}
        <div className="px-5 pt-10 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setUnfolded((u) => !u)}
            aria-expanded={unfolded}
            className="flex items-center gap-1.5 text-[20px] text-white cursor-pointer"
          >
            {t.setup.yourTable}
            <span className={`text-white/40 transition-transform duration-300 ${unfolded ? "rotate-180" : ""}`}>
              <ChevronDown />
            </span>
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={removeSeat}
              disabled={seats.length <= MIN_OPPONENTS}
              aria-label={t.setup.removeSeat}
              className="w-9 h-9 rounded-full bg-[#1c1c1e] text-white text-[20px] leading-none disabled:opacity-30 active:scale-95 transition cursor-pointer disabled:cursor-default"
            >
              −
            </button>
            <span className="min-w-[88px] text-center text-[15px] text-white/70 tabular-nums">
              {t.setup.playersCount(seats.length + 1)}
            </span>
            <button
              type="button"
              onClick={addSeat}
              disabled={seats.length >= MAX_OPPONENTS}
              aria-label={t.setup.addSeat}
              className="w-9 h-9 rounded-full bg-[#1c1c1e] text-white text-[20px] leading-none disabled:opacity-30 active:scale-95 transition cursor-pointer disabled:cursor-default"
            >
              +
            </button>
          </div>
        </div>
        <p className="px-5 mt-1 text-[14px] text-white/35">{unfolded ? t.setup.holdToEdit : t.setup.tapToOpen}</p>

        <SeatSnake
          rows={seats.map((seat, i) => ({
            id: seat.id,
            title: seat.id,
            subtitle: [
              AI_MODELS.find((x) => x.id === modelAt(seat, i))?.label,
              seat.strategy !== NATURAL ? t.personas[seat.strategy]?.name : "",
            ]
              .filter(Boolean)
              .join(" · "),
            marked: seat.prompt.trim() !== "",
          }))}
          unfolded={unfolded}
          onUnfold={() => setUnfolded(true)}
          unfoldLabel={t.setup.tapToOpen}
          markTitle={t.seat.customPrompt}
          rowProps={bind}
          pressing={pressing}
        />

        {/* Sit down */}
        <div
          className="sticky bottom-0 z-10 mt-auto px-5 pt-8 bg-gradient-to-t from-black via-black to-transparent"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        >
          {canSit ? (
            <button
              type="button"
              onClick={() => onStartGame(config)}
              className="w-full h-[52px] rounded-full bg-white text-black text-[16px] active:scale-[0.98] transition-transform cursor-pointer"
            >
              {t.setup.sitDown(venue.buyIn)}
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="w-full h-[52px] rounded-full border border-white/15 text-white/40 text-[16px] flex items-center justify-center gap-2 cursor-default"
            >
              <Lock />
              {t.setup.lockedCta(venue.buyIn, wealth)}
            </button>
          )}
        </div>
      </div>

      {editingIndex !== -1 && (
        <OpponentSheet
          key={seats[editingIndex].id}
          seat={seats[editingIndex]}
          menu={menu}
          model={modelAt(seats[editingIndex], editingIndex)}
          onChange={updateSeat}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};
