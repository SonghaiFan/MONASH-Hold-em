import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { AI_MODELS } from "../constants";
import { Player } from "../types";
import { useLanguage } from "../services/i18n";
import { Avatar } from "./Avatar";
import { MIN_HANDS_FOR_READS, summarise } from "../services/playerStats";
import { CUSTOM, pointOf } from "../services/style";
import { StylePad } from "./StylePad";
import { StatCards } from "./StatCards";

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
  const strategy = persona
    ? persona.id === CUSTOM
      ? t.seat.custom
      : t.personas[persona.id]?.name ?? persona.label
    : t.personas.RAW?.name;
  const early = s.hands < MIN_HANDS_FOR_READS;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={player.name}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fade-in_200ms_ease-out]" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[480px] max-h-[88svh] overflow-y-auto no-scrollbar rounded-t-[28px] bg-[#1c1c1e] animate-[sheet-up_320ms_cubic-bezier(0.19,1,0.22,1)]"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center gap-4 px-5 pt-3 pb-5">
          <Avatar name={player.name} isHuman={player.isHuman} alt="" className="w-16 h-16 object-contain" />
          <div className="min-w-0 flex-1">
            <div className="text-[22px] text-white leading-tight truncate">{player.name}</div>
            <div className="text-[15px] text-white/45 truncate">
              {[model?.label, strategy].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="text-[15px] text-white/45 tabular-nums shrink-0">{t.hud.hands(s.hands)}</div>
        </div>

        {/* Where the style was set, and where it has landed so far */}
        {persona?.vpip !== undefined && persona.pfr !== undefined && (
          <div className="px-5 pb-3">
            <StylePad
              compact
              target={pointOf(persona.vpip, persona.pfr)}
              actual={early ? null : pointOf(s.vpip, s.pfr)}
            />
          </div>
        )}

        <div className="px-5">
          <StatCards stats={s} targets={persona} quiet={early} />
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
