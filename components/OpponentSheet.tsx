import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AI_MODELS, modelCostPerM } from "../constants";
import { AIModelOption, PlayerStats } from "../types";
import { useLanguage } from "../services/i18n";
import { Avatar } from "./Avatar";
import { NATURAL, SeatSettings } from "../services/seats";
import { ACTION_INSTRUCTIONS } from "../services/pokerSituation";
import { referencesIn } from "../services/promptFields";
import { PromptVariables } from "./PromptVariables";
import { StylePad } from "./StylePad";
import { StatCards } from "./StatCards";
import { CUSTOM, StylePoint, personaFor, pointFor, pointOf, presetPoint, snapToPreset, styleKeyOf } from "../services/style";
import { entryKey } from "../services/seatStats";
import { MIN_HANDS_FOR_READS, summarise } from "../services/playerStats";

interface OpponentSheetProps {
  seat: SeatSettings;
  menu: AIModelOption[]; // the models this venue serves
  model: string; // the model the seat will actually sit down with here
  onChange: (seat: SeatSettings) => void;
  onClose: () => void;
  record?: Record<string, PlayerStats>; // how each seat has played at this player's tables, per style
}

const START_POINT: StylePoint = { x: 0.3, y: 0.7 }; // where the dot lands when you first give a seat a style
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
export const OpponentSheet: React.FC<OpponentSheetProps> = ({ seat, menu, model, onChange, onClose, record = {} }) => {
  const { t } = useLanguage();

  // --- Style: a point on the map, a named corner of it, or none at all ---
  const natural = seat.strategy === NATURAL;
  const point = pointFor(seat.strategy, seat.style) ?? seat.style ?? START_POINT;
  const persona = personaFor(seat.strategy, seat.style);
  const styleName = natural
    ? t.personas[NATURAL]?.name
    : seat.strategy === CUSTOM
      ? t.seat.custom
      : t.personas[seat.strategy]?.name ?? seat.strategy;
  // Near a named style, the dot snaps onto it; anywhere else, it is a style of its own
  const dragTo = (p: StylePoint) => {
    const named = snapToPreset(p);
    onChange({ ...seat, strategy: named ?? CUSTOM, style: named ? presetPoint(named) ?? p : p });
  };
  const pickPreset = (id: string) => onChange({ ...seat, strategy: id, style: presetPoint(id) ?? undefined });
  const toggleNatural = () => {
    if (!natural) return onChange({ ...seat, strategy: NATURAL, style: point });
    const back = seat.style ?? START_POINT;
    const named = snapToPreset(back);
    onChange({ ...seat, strategy: named ?? CUSTOM, style: back });
  };
  // How this seat has actually played with this style, across sessions
  const played = summarise(record[entryKey(seat.id, styleKeyOf(seat.strategy, seat.style))]);
  const enough = played.hands >= MIN_HANDS_FOR_READS;
  const actualPoint = !natural && enough ? pointOf(played.vpip, played.pfr) : null;

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

  // A field from the list goes in where the caret is, in backticks — or at the
  // end, until you have put the caret somewhere yourself
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const caretPlaced = useRef(false);
  const refs = referencesIn(promptText);
  const insertField = (path: string) => {
    const box = promptRef.current;
    const at = caretPlaced.current && box ? box.selectionStart : promptText.length;
    const end = caretPlaced.current && box ? box.selectionEnd : at;
    const before = promptText.slice(0, at);
    const after = promptText.slice(end);
    const token = `${before && !/\s$/.test(before) ? " " : ""}\`${path}\`${after && !/^[\s.,;:!?)]/.test(after) ? " " : ""}`;
    const next = (before + token + after).slice(0, PROMPT_LIMIT);
    editPrompt(next);
    caretPlaced.current = true;
    requestAnimationFrame(() => {
      box?.focus();
      const caret = Math.min(before.length + token.length, next.length);
      box?.setSelectionRange(caret, caret);
    });
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
          <Avatar name={seat.id} alt="" className="w-16 h-16 object-contain" />
          <div className="min-w-0">
            <div className="text-[22px] text-white leading-tight truncate">{seat.id}</div>
            <div className="text-[15px] text-white/45 truncate">
              {[currentModel?.label, natural ? "" : styleName].filter(Boolean).join(" · ")}
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

          {/* Style: leave it to the model, or drag the shape, tap a corner */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[14px] text-white/45">{t.seat.strategy}</h3>
              <span className="text-[14px] text-white/80">{styleName}</span>
            </div>

            {/* The switch comes first: turning it on folds away everything below it, not the switch itself */}
            <button
              type="button"
              role="switch"
              aria-checked={natural}
              onClick={toggleNatural}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-[20px] bg-black/35 text-left cursor-pointer"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] text-white">{t.seat.naturalSwitch}</span>
                <span className="block text-[13px] text-white/40">{t.seat.naturalSwitchSub}</span>
              </span>
              <span className={`relative w-11 h-[26px] rounded-full shrink-0 transition-colors ${natural ? "bg-[#34c759]" : "bg-white/15"}`}>
                <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-transform ${natural ? "translate-x-[21px]" : "translate-x-[3px]"}`} />
              </span>
            </button>

            {/* Folds shut while the model decides (grid rows 0fr ↔ 1fr animate the height) */}
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${natural ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
              inert={natural}
              aria-hidden={natural}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="pt-3">
                  <StylePad
                    target={point}
                    actual={actualPoint}
                    onChange={dragTo}
                    onPreset={pickPreset}
                    selectedPreset={seat.strategy === CUSTOM || natural ? null : seat.strategy}
                  />
                  {persona?.vpip !== undefined && (
                    <p className="mt-3 text-[14px] leading-snug text-white tabular-nums">
                      {t.seat.targets(Math.round(persona.vpip * 100), Math.round(persona.pfr! * 100))}
                    </p>
                  )}
                  {played.hands === 0 && <p className="mt-1 text-[13px] leading-snug text-white/40">{t.seat.noRecord}</p>}
                  {/* How this style has actually played, once it has played at all */}
                  {played.hands > 0 && (
                    <div className="mt-3">
                      <StatCards stats={played} targets={persona} quiet={!enough} />
                      {!enough && (
                        <p className="mt-2 text-[13px] leading-snug text-white/40 tabular-nums">
                          {t.seat.recordFew(played.hands, MIN_HANDS_FOR_READS)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
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
              ref={promptRef}
              onSelect={() => (caretPlaced.current = true)}
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
            {refs.unknown.length > 0 && (
              <p className="mt-2 text-[13px] leading-snug text-[#ff8a8a]">
                {t.seat.unknownVariables}{" "}
                {refs.unknown.map((name) => (
                  <code key={name} className="font-mono mr-1.5">`{name}`</code>
                ))}
              </p>
            )}
            <div className="mt-4">
              <PromptVariables used={refs.used} onInsert={insertField} />
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
