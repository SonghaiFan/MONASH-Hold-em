import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AI_MODELS, modelCostPerM } from "../constants";
import { AIModelOption, GamePhase, PlayerStats } from "../types";
import { useLanguage } from "../services/i18n";
import { Avatar } from "./Avatar";
import { NATURAL, SeatSettings } from "../services/seats";
import { ACTION_INSTRUCTIONS } from "../services/pokerSituation";
import { isKnownField, referencesIn } from "../services/promptFields";
import { PREVIEW_STREETS, PreviewStreet, hasSampleSituation, sampleSituation, valueAt } from "../services/promptPreview";
import { PromptVariables } from "./PromptVariables";
import { PromptEditor, PromptEditorHandle, VarState } from "./PromptEditor";
import { PromptPreview } from "./PromptPreview";
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

// A desktop has room to show the prompt and what it turns into side by side
const WIDE = "(min-width: 1024px)";
const useWide = () => {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
};

// One opponent's settings: a sheet from the bottom on a phone, a three-pane
// prompt workbench on a desktop (the player · the prompt · what the model reads). Every change applies as
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

  // A field from the list goes in where the caret is, as a pill — or at the
  // end, until you have put the caret somewhere yourself
  const editor = useRef<PromptEditorHandle>(null);
  const refs = referencesIn(promptText);
  const insertField = (path: string) => editor.current?.insert(path);

  // The same sample hand for every street, played through the real builders
  const wide = useWide();
  const [street, setStreet] = useState<PreviewStreet>(GamePhase.FLOP);
  // The other streets are simulated after the panel has opened, one at a time
  const [, warmed] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      const todo = PREVIEW_STREETS.find((s) => !hasSampleSituation(seat.id, s));
      if (!todo) return;
      sampleSituation(seat.id, todo);
      warmed((n) => n + 1);
      timer = setTimeout(next, 40);
    };
    timer = setTimeout(next, 400);
    return () => clearTimeout(timer);
  }, [seat.id]);
  const [picked, setPicked] = useState<string | null>(null);
  const [showValues, setShowValues] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const spot = sampleSituation(seat.id, street).state as Record<string, unknown>;
  const valueOf = (name: string) => valueAt(spot, name);
  const stateOf = (name: string): VarState =>
    !isKnownField(name) ? "unknown" : valueAt(spot, name) === undefined ? "absent" : "known";

  // Model
  const modelSection = (
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
  );

  // Style: leave it to the model, or drag the shape, tap a corner
  const styleSection = (
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
  );

  const promptSection = (
    <section>
      <div className="flex items-center justify-between gap-3 mb-2 min-h-7">
        <h3 className="text-[14px] text-white/45 flex items-center gap-2">
          {t.seat.prompt}
          <span className={`h-5 px-2 rounded-full text-[12px] leading-5 ${edited ? "bg-[#f5e35b] text-black" : "bg-white/[0.08] text-white/55"}`}>
            {edited ? t.seat.editedTag : t.seat.defaultTag}
          </span>
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            role="switch"
            aria-checked={showValues}
            onClick={() => setShowValues((v) => !v)}
            className={`h-7 px-3 rounded-full text-[13px] transition-colors cursor-pointer ${
              showValues ? "bg-[#f5e35b]/15 text-[#f5e35b]" : "bg-white/[0.08] text-white/70 hover:bg-white/[0.14]"
            }`}
          >
            {t.seat.showValues}
            {showValues && <span className="text-[#f5e35b]/60"> · {t.desk.phases[street]}</span>}
          </button>
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
      </div>
      {wide && <p className="-mt-1 mb-3 text-[13px] leading-snug text-white/40">{t.seat.promptNote}</p>}
      <PromptEditor
        ref={editor}
        value={promptText}
        onChange={editPrompt}
        limit={PROMPT_LIMIT}
        stateOf={stateOf}
        valueOf={valueOf}
        showValues={showValues}
        selected={picked}
        onSelect={setPicked}
        edited={edited}
        className={wide ? "min-h-[280px]" : "min-h-[220px]"}
      />
      <div className="mt-1.5 flex justify-between gap-3 text-[13px] text-white/35">
        <span>{wide ? t.seat.typeBacktick : t.seat.promptNote}</span>
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
    </section>
  );

  const variables = <PromptVariables used={refs.used} onInsert={insertField} valueOf={valueOf} />;

  const preview = (
    <PromptPreview
      name={seat.id}
      street={street}
      onStreet={setStreet}
      modelId={model}
      prompt={seat.prompt}
      draft={promptText}
      selected={picked}
      onSelect={setPicked}
      chartPreflop={!natural}
    />
  );

  const subtitle = [currentModel?.label, natural ? "" : styleName].filter(Boolean).join(" · ");

  // Portalled to the body: the lobby animates with a transform, which would pin a fixed sheet to it
  if (wide)
    return createPortal(
      <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={seat.id}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-[fade-in_200ms_ease-out]" onClick={onClose} />

        <div className="absolute inset-5 xl:inset-8 mx-auto max-w-[1480px] flex flex-col rounded-[28px] bg-[#1c1c1e] border border-white/[0.06] shadow-2xl shadow-black/60 overflow-hidden animate-[panel-in_360ms_cubic-bezier(0.19,1,0.22,1)]">
          <header className="shrink-0 flex items-center gap-4 px-6 h-[76px] border-b border-white/[0.06]">
            <img src={avatarFor(seat.id)} alt="" draggable={false} className="w-11 h-11 object-contain" />
            <div className="min-w-0">
              <div className="text-[19px] text-white leading-tight truncate">{seat.id}</div>
              <div className="text-[13px] text-white/45 truncate">{subtitle}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto h-10 px-6 rounded-full bg-white text-black text-[15px] active:scale-[0.98] transition-transform cursor-pointer"
            >
              {t.seat.done}
            </button>
          </header>

          <div className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1.1fr)_minmax(0,1fr)]">
            {/* The player */}
            <aside className="min-h-0 overflow-y-auto no-scrollbar px-6 py-6 space-y-7 border-r border-white/[0.06]">
              {modelSection}
              {styleSection}
            </aside>

            {/* The prompt, and the fields it can point at */}
            <main className="min-h-0 overflow-y-auto no-scrollbar px-6 py-6 space-y-5">
              {promptSection}
              {variables}
            </main>

            {/* What the model reads */}
            <section className="min-h-0 overflow-y-auto no-scrollbar px-6 py-6 bg-black/20 border-l border-white/[0.06]">
              <h3 className="text-[15px] text-white">{t.seat.previewTitle}</h3>
              <p className="mt-1 mb-5 text-[13px] leading-snug text-white/45">{t.seat.previewNote}</p>
              {preview}
            </section>
          </div>
        </div>
      </div>,
      document.body
    );

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
              {subtitle}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 space-y-7 pb-2">
          {modelSection}
          {styleSection}
          {promptSection}
          {variables}

          {/* The same preview as on a desktop, folded away until asked for */}
          <section>
            <button
              type="button"
              aria-expanded={previewOpen}
              onClick={() => setPreviewOpen((v) => !v)}
              className="w-full flex items-center justify-between h-[52px] px-4 rounded-[20px] bg-black/35 border border-white/10 text-[15px] text-white cursor-pointer"
            >
              {t.seat.previewToggle}
              <span className={`text-white/50 transition-transform ${previewOpen ? "rotate-180" : ""}`}>
                <Chevron />
              </span>
            </button>
            {previewOpen && <div className="pt-4">{preview}</div>}
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
