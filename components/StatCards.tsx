import React from "react";
import { useLanguage } from "../services/i18n";
import { StatsSummary } from "../services/playerStats";

interface StatCardsProps {
  stats: StatsSummary;
  targets?: { vpip?: number; pfr?: number }; // a style's targets, 0..1
  quiet?: boolean; // too few hands to trust: numbers step back
}

// Five segments from green to pink; each fills as far as the number reaches on
// its own scale (a VPIP of 60% is already very loose, an AFq of 80% very aggressive)
const SEGMENT_COLORS = ["#5eead4", "#7cc9a8", "#a3a3b5", "#d48fb4", "#f0509a"];
const SCALE = { vpip: 0.6, pfr: 0.5, afq: 0.8 };

const Bar: React.FC<{ value: number | null; max: number; target?: number }> = ({ value, max, target }) => {
  const reach = value === null ? 0 : Math.min(1, value / max) * SEGMENT_COLORS.length;
  return (
    <div className="relative mt-3 flex gap-1">
      {SEGMENT_COLORS.map((color, i) => {
        const fill = Math.max(0, Math.min(1, reach - i));
        return (
          <span key={color} className="relative flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
            <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${fill * 100}%`, background: color }} />
          </span>
        );
      })}
      {target !== undefined && (
        <span
          className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-[#f5e35b]"
          style={{ left: `calc(${Math.min(1, target / max) * 100}% - 1px)` }}
        />
      )}
    </div>
  );
};

// VPIP, PFR, AFq and hands played, as four cards
export const StatCards: React.FC<StatCardsProps> = ({ stats, targets, quiet }) => {
  const { t } = useLanguage();
  const pct = (v: number | null) => (v === null ? "–" : String(Math.round(v * 100)));

  const card = (label: string, hint: string, value: number | null, max: number, target?: number) => (
    <div className="rounded-[22px] border border-white/10 px-4 pt-3.5 pb-4 min-w-0" title={hint}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] text-white/85">{label}</span>
        {target !== undefined && <span className="text-[12px] text-[#f5e35b]/85 tabular-nums">{t.hud.target(Math.round(target * 100))}</span>}
      </div>
      <div className={`mt-1.5 text-[32px] font-light leading-none tabular-nums ${quiet ? "text-white/40" : "text-white"}`}>
        {pct(value)}
        {value !== null && <span className="text-[18px]">%</span>}
      </div>
      <Bar value={value} max={max} target={target} />
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      {card("VPIP", t.hud.vpipHint, stats.hands ? stats.vpip : null, SCALE.vpip, targets?.vpip)}
      <div className="rounded-[22px] border border-white/10 px-4 pt-3.5 pb-4 min-w-0">
        <span className="text-[15px] text-white/85">{t.hud.handsLabel}</span>
        <div className="mt-1.5 text-[32px] font-light leading-none tabular-nums text-white">{stats.hands}</div>
        <div className="mt-3 text-[12px] leading-snug text-white/40">{quiet ? t.hud.tooFew : t.hud.handsSub}</div>
      </div>
      {card("PFR", t.hud.pfrHint, stats.hands ? stats.pfr : null, SCALE.pfr, targets?.pfr)}
      {card("AFq", t.hud.afqHint, stats.afq, SCALE.afq)}
    </div>
  );
};
