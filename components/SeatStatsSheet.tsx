import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { AI_MODELS } from "../constants";
import { Player } from "../types";
import { useLanguage } from "../services/i18n";
import { avatarFor } from "../services/avatars";
import { MIN_HANDS_FOR_READS, summarise } from "../services/playerStats";

interface SeatStatsSheetProps {
  player: Player;
  onClose: () => void;
}

// How an opponent has actually played at this table, against what their style
// is meant to play. The yellow tick on a bar is the target.
export const SeatStatsSheet: React.FC<SeatStatsSheetProps> = ({ player, onClose }) => {
  const { t } = useLanguage();
  const s = summarise(player.stats);
  const persona = player.persona;
  const model = AI_MODELS.find((m) => m.id === player.model);
  const strategy = persona ? t.personas[persona.id]?.name ?? persona.label : t.personas.RAW?.name;
  const early = s.hands < MIN_HANDS_FOR_READS;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows: { label: string; hint: string; value: number | null; target?: number }[] = [
    { label: "VPIP", hint: t.hud.vpipHint, value: s.vpip, target: persona?.vpip },
    { label: "PFR", hint: t.hud.pfrHint, value: s.pfr, target: persona?.pfr },
    { label: "AFq", hint: t.hud.afqHint, value: s.afq },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={player.name}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fade-in_200ms_ease-out]" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[480px] rounded-t-[28px] bg-[#1c1c1e] animate-[sheet-up_320ms_cubic-bezier(0.19,1,0.22,1)]"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center gap-4 px-5 pt-3 pb-5">
          <img src={avatarFor(player.name)} alt="" draggable={false} className="w-16 h-16 object-contain" />
          <div className="min-w-0 flex-1">
            <div className="text-[22px] text-white leading-tight truncate">{player.name}</div>
            <div className="text-[15px] text-white/45 truncate">
              {[model?.label, strategy].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="text-[15px] text-white/45 tabular-nums shrink-0">{t.hud.hands(s.hands)}</div>
        </div>

        <div className="px-5 space-y-3">
          {rows.map((row) => {
            const pct = row.value === null ? null : Math.round(row.value * 100);
            return (
              <div key={row.label} className="rounded-[20px] bg-black/35 px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] text-white">{row.label}</div>
                    <div className="text-[13px] text-white/40 truncate">{row.hint}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-[28px] font-light leading-none tabular-nums ${early ? "text-white/40" : "text-white"}`}>
                      {pct === null ? "–" : `${pct}%`}
                    </div>
                    {row.target !== undefined && (
                      <div className="mt-1 text-[12px] text-[#f5e35b]/80 tabular-nums">
                        {t.hud.target(Math.round(row.target * 100))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="relative mt-3 h-1.5 rounded-full bg-white/10">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${early ? "bg-white/25" : "bg-white/70"}`}
                    style={{ width: `${pct ?? 0}%` }}
                  />
                  {row.target !== undefined && (
                    <div
                      className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-[#f5e35b]"
                      style={{ left: `calc(${row.target * 100}% - 1px)` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="px-5 pt-4 text-[13px] leading-snug text-white/40">
          {early ? `${t.hud.tooFew} · ` : ""}
          {persona?.vpip !== undefined ? t.hud.chart : t.hud.natural}
        </p>
      </div>
    </div>,
    document.body
  );
};
