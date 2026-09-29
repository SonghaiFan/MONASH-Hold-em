import React, { useState } from "react";
import { AI_MODELS } from "../constants";
import { Player, PlayerAction } from "../types";
import { useLanguage } from "../services/i18n";
import { Avatar } from "./Avatar";
import { summarise } from "../services/playerStats";
import { SeatStatsSheet } from "./SeatStatsSheet";

interface TableRosterProps {
  players: Player[]; // everyone, in seat order, you included
  activePlayerId: string | null;
  bigBlind: number;
  buyIn: number;
}

const STATUS_WORD: Partial<Record<PlayerAction, "check" | "call" | "raise" | "fold" | "allIn">> = {
  CHECKED: "check",
  CALLED: "call",
  RAISED: "raise",
  FOLDED: "fold",
  "ALL-IN": "allIn",
};

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}`);

// Desktop only: every seat at once, with what the phone keeps behind a long press —
// model, style, position, and how they have actually been playing.
export const TableRoster: React.FC<TableRosterProps> = ({ players, activePlayerId, bigBlind, buyIn }) => {
  const { t } = useLanguage();
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const statsPlayer = players.find((p) => p.id === statsFor);
  const hero = players.find((p) => p.isHuman);
  const net = (hero?.chips ?? 0) + (hero?.currentBet ?? 0) - buyIn;
  const handsPlayed = hero?.stats?.hands ?? 0;

  return (
    <aside className="h-full flex flex-col min-h-0">
      <div className="shrink-0 px-1 pb-4 grid grid-cols-3 gap-2">
        <Fact label={t.desk.blinds} value={`${(bigBlind / 2).toLocaleString()}/${bigBlind.toLocaleString()}`} />
        <Fact label={t.desk.hands} value={handsPlayed.toLocaleString()} />
        <Fact
          label={t.desk.session}
          value={`${net > 0 ? "+" : ""}${net.toLocaleString()}`}
          tone={net > 0 ? "up" : net < 0 ? "down" : undefined}
        />
      </div>

      <div className="shrink-0 px-1 pb-2 flex items-center justify-between text-[12px] text-white/35">
        <span>{t.desk.seats}</span>
        <span className="tabular-nums">VPIP · PFR · AF</span>
      </div>

      <ul className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1.5">
        {players.map((p) => {
          const out = p.status === "ELIMINATED";
          const folded = p.status === "FOLDED";
          const toAct = activePlayerId === p.id;
          const s = summarise(p.stats);
          const model = AI_MODELS.find((m) => m.id === p.model);
          const style = p.persona ? t.personas[p.persona.id]?.label || p.persona.label : "";
          const word = STATUS_WORD[p.status];
          const tilted = (p.tilt ?? 1) > 1.05;
          const sub = p.isHuman ? t.desk.you : [model?.label, style].filter(Boolean).join(" · ");

          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={p.isHuman}
                onClick={() => setStatsFor(p.id)}
                title={p.isHuman ? undefined : t.desk.openStats}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[18px] text-left transition-colors ${
                  toAct ? "bg-white/[0.1]" : "bg-[#1c1c1e]/60 enabled:hover:bg-[#1c1c1e]"
                } ${out ? "opacity-30" : folded ? "opacity-50" : ""} enabled:cursor-pointer`}
              >
                <span className="relative shrink-0 w-10 h-10">
                  <Avatar
                    name={p.name}
                    isHuman={p.isHuman}
                    alt=""
                    className="w-full h-full object-contain"
                  />
                  {model?.color && !p.isHuman && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-black"
                      style={{ background: model.color }}
                    />
                  )}
                  {tilted && !out && <span className="absolute -top-1 -left-1 text-xs leading-none">🔥</span>}
                </span>

                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[14px] text-white truncate">{p.name}</span>
                    {p.position && (
                      <span
                        className={`shrink-0 h-[18px] px-1.5 rounded-full text-[10px] leading-[18px] tabular-nums ${
                          p.isDealer ? "bg-white text-black" : "bg-white/[0.08] text-white/60"
                        }`}
                      >
                        {p.position}
                      </span>
                    )}
                  </span>
                  <span className="block text-[12px] text-white/40 truncate">
                    {toAct ? <span className="text-white/80">{p.isHuman ? t.desk.yourTurn : t.game.thinking}</span> : word ? t.game.actions[word] : sub}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-[14px] text-white tabular-nums">{p.chips.toLocaleString()}</span>
                  <span className="block text-[11px] text-white/35 tabular-nums">
                    {p.currentBet > 0 ? (
                      <span className="text-[#f5e35b]">{p.currentBet.toLocaleString()}</span>
                    ) : s.hands > 0 ? (
                      `${pct(s.vpip)} · ${pct(s.pfr)} · ${pct(s.afq)}`
                    ) : (
                      "–"
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {statsPlayer && <SeatStatsSheet player={statsPlayer} onClose={() => setStatsFor(null)} />}
    </aside>
  );
};

const Fact: React.FC<{ label: string; value: string; tone?: "up" | "down" }> = ({ label, value, tone }) => (
  <div className="rounded-[16px] bg-[#1c1c1e]/60 px-3 py-2.5 min-w-0">
    <div className="text-[11px] text-white/40 truncate">{label}</div>
    <div
      className={`text-[15px] tabular-nums truncate ${
        tone === "up" ? "text-[#86efac]" : tone === "down" ? "text-[#ff8a8a]" : "text-white"
      }`}
    >
      {value}
    </div>
  </div>
);
