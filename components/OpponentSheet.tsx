import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AI_MODELS, modelCostPerM } from "../constants";
import { AIModelOption, GamePhase, PlayerStats } from "../types";
import { useLanguage } from "../services/i18n";
import { Avatar } from "./Avatar";
import { NATURAL, SeatSettings, promptForModel, withPromptForModel } from "../services/seats";
import { ACTION_INSTRUCTIONS } from "../services/pokerSituation";
import { DEFAULT_CHAT_PROMPT_TEMPLATE, modelKindFor } from "../services/aiProviders";
import { isKnownField, referencesIn, PROMPT_FIELDS, fieldLabel } from "../services/promptFields";
import { PREVIEW_STREETS, PreviewStreet, sampleSituation, valueAt, formatValue } from "../services/promptPreview";
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
const PROMPT_LIMIT = 12000;

const Chevron = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const OpponentSheet: React.FC<OpponentSheetProps> = ({ seat, menu, model, onChange, onClose, record = {} }) => {
  const { t, lang } = useLanguage();

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

  const currentModel = AI_MODELS.find((m) => m.id === model);
  // The box holds its own draft, so clearing it to start over doesn't snap the default back in.
  // What is saved: "" (the default) unless the text says something else.
  const defaultPrompt = modelKindFor(model) === "decisions" ? ACTION_INSTRUCTIONS : DEFAULT_CHAT_PROMPT_TEMPLATE;
  const promptLabel = modelKindFor(model) === "decisions" ? t.seat.decisionsInstructions : t.seat.prompt;
  const savedPrompt = promptForModel(seat, model);
  const [promptText, setPromptText] = useState(savedPrompt.trim() ? savedPrompt : defaultPrompt);
  const edited = savedPrompt.trim() !== "";
  useEffect(() => {
    const next = promptForModel(seat, model);
    setPromptText(next.trim() ? next : modelKindFor(model) === "decisions" ? ACTION_INSTRUCTIONS : DEFAULT_CHAT_PROMPT_TEMPLATE);
  }, [model]);
  const editPrompt = (text: string) => {
    setPromptText(text);
    const trimmed = text.trim();
    onChange(withPromptForModel(seat, model, trimmed === "" || trimmed === defaultPrompt ? "" : text));
  };

  // A field from the list goes in where the caret is, as a pill — or at the
  // end, until you have put the caret somewhere yourself
  const editor = useRef<PromptEditorHandle>(null);
  const refs = referencesIn(promptText);
  const insertField = (path: string) => editor.current?.insert(path);

  // The same sample hand for every street, played through the real builders
  const [street, setStreet] = useState<PreviewStreet>(GamePhase.FLOP);
  const [picked, setPicked] = useState<string | null>(null);
  const [panel, setPanel] = useState<"information" | "settings" | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const closePanel = () => { setPanel(null); setPicked(null); lastTrigger.current?.focus(); };
  const openPanel = (next: "information" | "settings") => {
    lastTrigger.current = document.activeElement as HTMLElement;
    setPicked(null);
    setPanel(next);
  };
  const inspectField = (name: string | null) => {
    // In hand preview mode the sample value already lives inside the pill.
    // Opening the field tray here would repeat the same information.
    if (showPreview) return;
    lastTrigger.current = document.activeElement as HTMLElement;
    setPicked(name);
    setPanel(name ? "information" : null);
    // Inspecting information should not leave the phone keyboard over the tray.
    (document.activeElement as HTMLElement)?.blur();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (panel) { setPanel(null); setPicked(null); lastTrigger.current?.focus(); }
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, onClose]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      if (!sheet.current) return;
      sheet.current.style.height = `${Math.min(860, (viewport?.height ?? window.innerHeight) * 0.94)}px`;
      sheet.current.style.bottom = `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`;
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); };
  }, []);
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
    <section className="max-w-[760px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2 min-h-7">
        <h3 className="text-[14px] text-white/45 flex items-center gap-2">
          {promptLabel}
          <span className={`h-5 px-2 rounded-full text-[12px] leading-5 ${edited ? "bg-[#f5e35b] text-black" : "bg-white/[0.08] text-white/55"}`}>
            {edited ? t.seat.editedTag : t.seat.defaultTag}
          </span>
        </h3>
        <div className="flex items-center gap-1.5">
          {edited && (
            <button
              type="button"
              onClick={() => editPrompt(defaultPrompt)}
              className="h-7 px-3 rounded-full bg-white/[0.08] text-[13px] text-white hover:bg-white/[0.14] transition-colors cursor-pointer"
            >
              {t.seat.restoreDefault}
            </button>
          )}
        </div>
      </div>
      <p className="mb-3 text-[13px] leading-snug text-white/50">
        {t.seat.editorHint} {modelKindFor(model) === "decisions" ? t.seat.editorPlacementDecisions : t.seat.editorPlacementChat}
      </p>
      {showPreview ? (
        <PromptPreview name={seat.id} street={street} modelId={model} prompt={promptText}
          chartPreflop={!natural}>
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-1" aria-label={t.seat.sampleValue}>
              {PREVIEW_STREETS.map(s => <button key={s} type="button" aria-pressed={s === street} onClick={() => setStreet(s)} className={`px-3 min-h-11 rounded-full text-[13px] ${s === street ? "bg-white text-black" : "bg-white/5 text-white/60"}`}>{t.desk.phases[s]}</button>)}
            </div>
            <PromptEditor ref={editor} value={promptText} onChange={editPrompt} limit={PROMPT_LIMIT} label={promptLabel}
              stateOf={stateOf} valueOf={valueOf} showValues selected={picked} onSelect={inspectField}
              edited={edited} className="min-h-[180px]" />
            <div className="mt-2 text-right text-[12px] text-white/35 tabular-nums">{promptText.length}/{PROMPT_LIMIT}</div>
            {refs.unknown.length > 0 && <p className="mt-2 text-[13px] leading-snug text-[#ff8a8a]">
              {t.seat.unknownVariables}{" "}{refs.unknown.map(name => <code key={name} className="font-mono mr-1.5">`{name}`</code>)}
            </p>}
          </div>
        </PromptPreview>
      ) : <>
        <PromptEditor ref={editor} value={promptText} onChange={editPrompt} limit={PROMPT_LIMIT} label={promptLabel}
          stateOf={stateOf} valueOf={valueOf} showValues={false} selected={picked} onSelect={inspectField}
          edited={edited} className="min-h-[180px]" />
        <div className="mt-2 text-right text-[12px] text-white/35 tabular-nums">{promptText.length}/{PROMPT_LIMIT}</div>
        {refs.unknown.length > 0 && <p className="mt-2 text-[13px] leading-snug text-[#ff8a8a]">
          {t.seat.unknownVariables}{" "}{refs.unknown.map(name => <code key={name} className="font-mono mr-1.5">`{name}`</code>)}
        </p>}
      </>}
    </section>
  );

  const information = picked ? (
    <div className="space-y-4" aria-live="polite">
      <p className="text-[13px] leading-snug text-white/50">
        {PROMPT_FIELDS.find(f => f.path === picked.replace(/^state\./, ""))?.desc[lang] ?? t.seat.childField}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PREVIEW_STREETS.map(s => {
          const sample = valueAt(sampleSituation(seat.id, s).state as Record<string, unknown>, picked);
          return <div key={s} className="min-w-0 rounded-xl bg-white/[0.05] px-3 py-2.5">
            <div className="text-[11px] text-white/35">{t.desk.phases[s]}</div>
            <div className={`mt-1 text-[13px] break-words ${sample === undefined ? "text-white/35" : "text-[#f5e35b]"}`}>
              {sample === undefined ? t.seat.notThisStreet : formatValue(sample, 160)}
            </div>
          </div>;
        })}
      </div>
    </div>
  ) : <PromptVariables used={refs.used} onInsert={(path) => { insertField(path); setPanel(null); }} valueOf={valueOf} />;

  const panelTitle = panel === "settings" ? t.seat.settings : picked ? fieldLabel(picked, lang) : t.seat.addInformation;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={seat.id}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div ref={sheet} className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[680px] lg:max-w-[1100px] h-[94dvh] flex flex-col rounded-t-[28px] bg-[#1c1c1e] overflow-hidden shadow-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <header className="shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <Avatar name={seat.id} alt="" className="w-10 h-10 object-contain" />
            <div className="text-[18px] text-white flex-1 truncate">{seat.id}</div>
            <button type="button" onClick={onClose} className="min-h-11 px-5 rounded-full bg-white text-black text-[14px] cursor-pointer">{t.seat.done}</button>
          </div>
          <button type="button" onClick={() => openPanel("settings")} aria-expanded={panel === "settings"} className="mt-1 min-h-11 flex items-center gap-2 max-w-full text-[13px] text-white/60 cursor-pointer">
            <span className="w-2 h-2 rounded-full shrink-0" style={{background: currentModel?.color ?? "white"}} />
            <span className="truncate">{currentModel?.label ?? model} · {styleName}</span><Chevron />
          </button>
        </header>
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">{promptSection}</div>
        {panel && (
          <section aria-label={panelTitle} className="shrink-0 max-h-[48%] lg:max-h-none lg:w-[420px] min-h-0 flex flex-col lg:border-l border-t border-white/15 bg-[#252527]">
            <div className="shrink-0 flex items-center gap-2 px-4 min-h-12">
              {picked && <button type="button" onClick={() => setPicked(null)} className="min-h-11 px-2 text-white/70 cursor-pointer" aria-label={t.seat.addInformation}>←</button>}
              <h3 className="flex-1 truncate text-[14px] text-white">{panelTitle}</h3>
              <button type="button" onClick={closePanel} aria-label={t.seat.closeInformation} className="w-11 h-11 text-white/60 cursor-pointer text-xl">×</button>
            </div>
            <div className="min-h-0 overflow-y-auto px-4 pb-4">
              {panel === "information" ? information : <div className="space-y-5">{modelSection}{styleSection}</div>}
            </div>
          </section>
        )}
        </div>
        <nav aria-label={promptLabel} className="shrink-0 grid grid-cols-2 gap-2 p-3 border-t border-white/[0.08] bg-[#1c1c1e]">
          <button type="button" aria-expanded={panel === "information"} onClick={() => panel === "information" ? closePanel() : openPanel("information")} className={`min-h-11 rounded-full text-[14px] cursor-pointer ${panel === "information" ? "bg-[#f5e35b] text-black" : "bg-white/[0.08] text-white"}`}>+ {t.seat.addInformation}</button>
          <button type="button" aria-pressed={showPreview} onClick={() => { setShowPreview(v => !v); setPanel(null); setPicked(null); }} className={`min-h-11 rounded-full text-[14px] cursor-pointer ${showPreview ? "bg-white text-black" : "bg-white/[0.04] text-white/65"}`}>{t.seat.previewShort}</button>
        </nav>
      </div>
    </div>, document.body
  );
};
