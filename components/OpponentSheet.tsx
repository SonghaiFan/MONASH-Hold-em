import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AI_MODELS, PERSONAS, modelCostPerM } from "../constants";
import { AIModelOption } from "../types";
import { useLanguage } from "../services/i18n";
import { avatarFor } from "../services/avatars";
import { NATURAL, SeatSettings } from "../services/seats";
import { ACTION_INSTRUCTIONS } from "../services/pokerSituation";

interface OpponentSheetProps {
  seat: SeatSettings;
  menu: AIModelOption[]; // the models this venue serves
  model: string; // the model the seat will actually sit down with here
  onChange: (seat: SeatSettings) => void;
  onClose: () => void;
}

const STRATEGIES = [NATURAL, ...Object.keys(PERSONAS)];
// Every model, cheapest first; the ones this venue doesn't serve are shown but can't be picked
const ALL_MODELS = [...AI_MODELS].sort((a, b) => modelCostPerM(a) - modelCostPerM(b));
const PROMPT_LIMIT = 2000;

const Chevron = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

// One opponent's settings, as a sheet from the bottom. Every change applies as
// it is made; Done only closes.
export const OpponentSheet: React.FC<OpponentSheetProps> = ({ seat, menu, model, onChange, onClose }) => {
  const { t } = useLanguage();
  const strategy = t.personas[seat.strategy] ?? t.personas[NATURAL];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const currentModel = AI_MODELS.find((m) => m.id === model);
  // The box holds its own draft, so clearing it to start over doesn't snap the default back in.
  // What is saved: "" (the default) unless the text says something else.
  const [promptText, setPromptText] = useState(seat.prompt.trim() ? seat.prompt : ACTION_INSTRUCTIONS);
  const edited = seat.prompt.trim() !== "";
  const editPrompt = (text: string) => {
    setPromptText(text);
    const trimmed = text.trim();
    onChange({ ...seat, prompt: trimmed === "" || trimmed === ACTION_INSTRUCTIONS ? "" : text });
  };

  // Portalled to the body: the lobby animates with a transform, which would pin a fixed sheet to it
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={seat.id}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fade-in_200ms_ease-out]" onClick={onClose} />

      <div
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[480px] max-h-[88svh] flex flex-col rounded-t-[28px] bg-[#1c1c1e] animate-[sheet-up_320ms_cubic-bezier(0.19,1,0.22,1)]"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="shrink-0 flex justify-center pt-2.5 pb-1">
          <span className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Who */}
        <div className="shrink-0 flex items-center gap-4 px-5 pt-3 pb-5">
          <img src={avatarFor(seat.id)} alt="" draggable={false} className="w-16 h-16 object-contain" />
          <div className="min-w-0">
            <div className="text-[22px] text-white leading-tight truncate">{seat.id}</div>
            <div className="text-[15px] text-white/45 truncate">
              {[currentModel?.label, seat.strategy !== NATURAL ? strategy.name : ""].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 space-y-7 pb-2">
          {/* Model */}
          <section>
            <h3 className="text-[14px] text-white/45 mb-2">{t.seat.model}</h3>
            {/* A native select under a styled face: on a phone it opens the system picker */}
            <label className="relative flex items-center gap-3 h-[60px] px-4 rounded-[20px] bg-black/35 border border-white/10 focus-within:border-white/30 transition-colors cursor-pointer">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: currentModel?.color ?? "#fff" }} />
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] text-white truncate">{currentModel?.label ?? model}</span>
                <span className="block text-[13px] text-white/40 truncate">{currentModel?.sub}</span>
              </span>
              <span className="text-white/50 shrink-0">
                <Chevron />
              </span>
              <select
                value={model}
                onChange={(e) => onChange({ ...seat, model: e.target.value })}
                aria-label={t.seat.model}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[16px]"
              >
                {ALL_MODELS.map((m) => {
                  const served = menu.some((x) => x.id === m.id);
                  return (
                    <option key={m.id} value={m.id} disabled={!served}>
                      {served ? `${m.label} · ${m.sub}` : `${m.label} · ${t.seat.offMenu}`}
                    </option>
                  );
                })}
              </select>
            </label>
          </section>

          {/* Strategy */}
          <section>
            <h3 className="text-[14px] text-white/45 mb-2">{t.seat.strategy}</h3>
            <div className="flex flex-wrap gap-2">
              {STRATEGIES.map((id) => {
                const on = id === seat.strategy;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChange({ ...seat, strategy: id })}
                    className={`h-9 px-4 rounded-full text-[14px] transition-colors cursor-pointer ${on ? "bg-white text-black" : "bg-white/[0.07] text-white hover:bg-white/[0.12]"}`}
                  >
                    {t.personas[id]?.name ?? id}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[14px] leading-snug text-white/55">{strategy.desc}</p>
          </section>

          {/* Prompt: the default instructions, in full, to rewrite for this one player */}
          <section>
            <div className="flex items-center justify-between mb-2 min-h-7">
              <h3 className="text-[14px] text-white/45 flex items-center gap-2">
                {t.seat.prompt}
                <span className={`h-5 px-2 rounded-full text-[12px] leading-5 ${edited ? "bg-[#f5e35b] text-black" : "bg-white/[0.08] text-white/55"}`}>
                  {edited ? t.seat.editedTag : t.seat.defaultTag}
                </span>
              </h3>
              {edited && (
                <button
                  type="button"
                  onClick={() => editPrompt(ACTION_INSTRUCTIONS)}
                  className="h-7 px-3 rounded-full bg-white/[0.08] text-[13px] text-white hover:bg-white/[0.14] transition-colors cursor-pointer"
                >
                  {t.seat.restoreDefault}
                </button>
              )}
            </div>
            <textarea
              value={promptText}
              onChange={(e) => editPrompt(e.target.value.slice(0, PROMPT_LIMIT))}
              rows={9}
              spellCheck={false}
              className={`w-full resize-none rounded-[20px] bg-black/35 border outline-none px-4 py-3 text-[15px] leading-relaxed transition-colors ${
                edited ? "border-[#f5e35b]/40 text-white focus:border-[#f5e35b]/70" : "border-white/10 text-white/70 focus:border-white/30 focus:text-white"
              }`}
            />
            <div className="mt-1.5 flex justify-between gap-3 text-[13px] text-white/35">
              <span>{t.seat.promptNote}</span>
              <span className="tabular-nums shrink-0">{promptText.length}/{PROMPT_LIMIT}</span>
            </div>
          </section>
        </div>

        <div className="shrink-0 px-5 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-[52px] rounded-full bg-white text-black text-[16px] active:scale-[0.98] transition-transform cursor-pointer"
          >
            {t.seat.done}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
