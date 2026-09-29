import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, GamePhase, Suit } from "../types";
import { useLanguage } from "../services/i18n";
import {
  PREVIEW_STREETS,
  PreviewStreet,
  costPerDecision,
  hasSampleSituation,
  sampleSituation,
  formatValue,
  promptParts,
  sampleBoard,
  sampleHole,
  valueAt,
} from "../services/promptPreview";
import { isKnownField } from "../services/promptFields";
import { segmentsOf } from "./PromptEditor";

interface PromptPreviewProps {
  name: string; // the seat's name, which the sample hand is played under
  street: PreviewStreet;
  onStreet: (s: PreviewStreet) => void;
  modelId: string;
  prompt: string; // what the seat will send ("" = the default)
  draft: string; // what the box holds, to show pills against
  selected: string | null;
  onSelect: (name: string | null) => void;
  chartPreflop: boolean; // a styled seat plays preflop from the chart, without asking the model
}

const RED = new Set<string>([Suit.Hearts, Suit.Diamonds]);

const MiniCard: React.FC<{ card?: Card }> = ({ card }) => (
  <span
    className={`inline-flex items-center justify-center w-[26px] h-[34px] rounded-[7px] text-[12px] font-medium tabular-nums ${
      card ? (RED.has(card.suit) ? "bg-white text-[#e0352b]" : "bg-white text-black") : "bg-white/[0.05] border border-dashed border-white/15"
    }`}
  >
    {card ? `${card.rank}${card.suit}` : ""}
  </span>
);

// Does this backtick name point at the node at `path` (list entries written as [])?
const points = (name: string, path: string, topKeys: Set<string>) => {
  const n = name.replace(/^state\./, "");
  if (n === "state" && path === "") return true;
  if (n === path || n === path.replace(/\[\]/g, "")) return true;
  // A key inside list entries, written on its own: `reads`, `estimatedRange`
  return !n.includes(".") && !topKeys.has(n) && path.includes("[]") && path.endsWith(`.${n}`);
};

// ---------- `state`, as the model gets it, with the fields a prompt names lit up ----------

interface JsonRowsProps {
  value: unknown;
  path: string;
  label?: string;
  depth: number;
  last: boolean;
  lit: (path: string) => "selected" | "used" | null;
  inherited: "selected" | "used" | null;
  selectedRef: React.MutableRefObject<HTMLDivElement | null>;
}

const Scalar: React.FC<{ v: unknown }> = ({ v }) =>
  typeof v === "string" ? <span className="text-white/85">"{v}"</span> : <span className="text-[#9ecbff]">{String(v)}</span>;

const JsonRows: React.FC<JsonRowsProps> = ({ value, path, label, depth, last, lit, inherited, selectedRef }) => {
  const own = lit(path);
  const mark = own === "selected" || inherited === "selected" ? "selected" : own ?? inherited;
  const rowClass = `pr-3 border-l-2 ${
    mark === "selected" ? "bg-[#f5e35b]/[0.16] border-[#f5e35b]" : mark === "used" ? "bg-[#f5e35b]/[0.06] border-[#f5e35b]/50" : "border-transparent"
  }`;
  const pad = { paddingLeft: 12 + depth * 14 };
  const key = label !== undefined ? <span className="text-white/45">{label}: </span> : null;
  const comma = last ? "" : ",";
  const refFor = own === "selected" ? (el: HTMLDivElement | null) => { if (el) selectedRef.current = el; } : undefined;

  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    const list = Array.isArray(value);
    const entries = list ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>);
    if (!entries.length)
      return (
        <div ref={refFor} className={rowClass} style={pad}>
          {key}
          <span className="text-white/45">{list ? "[]" : "{}"}{comma}</span>
        </div>
      );
    return (
      <>
        <div ref={refFor} className={rowClass} style={pad}>
          {key}
          <span className="text-white/45">{list ? "[" : "{"}</span>
        </div>
        {entries.map(([k, v], i) => (
          <JsonRows
            key={k}
            value={v}
            path={list ? `${path}[]` : path ? `${path}.${k}` : k}
            label={list ? undefined : k}
            depth={depth + 1}
            last={i === entries.length - 1}
            lit={lit}
            inherited={mark}
            selectedRef={selectedRef}
          />
        ))}
        <div className={rowClass} style={pad}>
          <span className="text-white/45">{list ? "]" : "}"}{comma}</span>
        </div>
      </>
    );
  }
  return (
    <div ref={refFor} className={rowClass} style={pad}>
      {key}
      <Scalar v={value} />
      <span className="text-white/45">{comma}</span>
    </div>
  );
};

// ---------- The pane ----------

// What one opponent reads on each street of a sample hand: the prompt with
// every field it names filled in from this spot, what the game adds to it,
// and the `state` it all refers to.
export const PromptPreview: React.FC<PromptPreviewProps> = ({
  name,
  street,
  onStreet,
  modelId,
  prompt,
  draft,
  selected,
  onSelect,
  chartPreflop,
}) => {
  const { t } = useLanguage();
  const [stateOpen, setStateOpen] = useState(false);
  const situation = sampleSituation(name, street);
  const state = situation.state as Record<string, unknown>;
  const topKeys = useMemo(() => new Set(Object.keys(state)), [state]);
  const parts = useMemo(() => promptParts(situation, modelId, prompt), [situation, modelId, prompt]);
  // Streets still being simulated show no count yet
  const perStreet = Object.fromEntries(
    PREVIEW_STREETS.map((s) => [s, hasSampleSituation(name, s) ? promptParts(sampleSituation(name, s), modelId, prompt).tokens.total : null])
  ) as Record<PreviewStreet, number | null>;
  const segments = useMemo(() => segmentsOf(draft.trim() ? draft : parts.yours), [draft, parts.yours]);
  const used = useMemo(() => segments.flatMap((s) => ("name" in s ? [s.name] : [])), [segments]);
  const skipped = chartPreflop && street === GamePhase.PRE_FLOP;

  const lit = (path: string): "selected" | "used" | null =>
    selected && points(selected, path, topKeys) ? "selected" : used.some((n) => points(n, path, topKeys)) ? "used" : null;

  // Bring the picked field into view in the state below
  const selectedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (selected) setStateOpen(true);
  }, [selected]);
  useEffect(() => {
    if (!stateOpen) return;
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    selectedRef.current = null;
  }, [selected, street, stateOpen]);

  const cost = costPerDecision(modelId, parts.tokens.total) * 100;
  const costText = cost === 0 ? "$0" : cost < 0.1 ? `$${cost.toFixed(3)}` : `$${cost.toFixed(2)}`;
  const share = (n: number) => `${(n / parts.tokens.total) * 100}%`;
  const board = sampleBoard(street);

  return (
    <div className="space-y-5">
      {/* The streets, each with what it costs to send */}
      <div className="grid grid-cols-4 gap-1 p-1 rounded-full bg-black/35 border border-white/10" role="tablist">
        {PREVIEW_STREETS.map((s) => {
          const on = s === street;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onStreet(s)}
              className={`h-10 rounded-full flex flex-col items-center justify-center leading-none transition-colors cursor-pointer ${
                on ? "bg-white text-black" : "text-white/70 hover:bg-white/[0.07]"
              }`}
            >
              <span className="text-[13px]">{t.desk.phases[s]}</span>
              <span className={`mt-0.5 text-[10px] tabular-nums ${on ? "text-black/50" : "text-white/35"}`}>
                {chartPreflop && s === GamePhase.PRE_FLOP ? t.seat.chartShort : perStreet[s] === null ? "…" : `~${perStreet[s]}`}
              </span>
            </button>
          );
        })}
      </div>

      {/* The sample hand at this point */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex gap-1">
          {sampleHole.map((c) => (
            <MiniCard key={c.id} card={c} />
          ))}
        </div>
        <span className="w-px h-6 bg-white/10" />
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <MiniCard key={i} card={board[i]} />
          ))}
        </div>
        <div className="ml-auto text-right min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-white/35">{t.seat.legalHere}</div>
          <div className="text-[13px] text-white/80 truncate">{parts.legal.join(" · ")}</div>
        </div>
      </div>

      {/* Where the tokens go */}
      <div>
        <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.06]">
          <span className="bg-[#f5e35b] transition-[width] duration-300" style={{ width: share(parts.tokens.yours) }} />
          <span className="bg-white/35 transition-[width] duration-300" style={{ width: share(parts.tokens.rules) }} />
          <span className="bg-white/15 transition-[width] duration-300" style={{ width: share(parts.tokens.table) }} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-white/50 tabular-nums">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#f5e35b]" />{t.seat.tokenParts.yours} {parts.tokens.yours}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white/35" />{t.seat.tokenParts.rules} {parts.tokens.rules}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white/15" />{t.seat.tokenParts.table} {parts.tokens.table}</span>
          <span className="ml-auto text-white/70">{t.seat.tokens(parts.tokens.total)} · {t.seat.costPer100(costText)}</span>
        </div>
      </div>

      {/* The prompt, with each field it names filled in from this spot */}
      <section>
        <h4 className="text-[13px] text-white/45 mb-2">{t.seat.renderedTitle}</h4>
        {skipped && <p className="mb-2 text-[13px] leading-snug text-white/55">{t.seat.chartPreflop}</p>}
        <div className={`rounded-[18px] bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-[14px] leading-[1.9] text-white/80 whitespace-pre-wrap break-words ${skipped ? "opacity-40" : ""}`}>
          {segments.map((s, i) => {
            if (!("name" in s)) return <React.Fragment key={i}>{s.text}</React.Fragment>;
            const v = valueAt(state, s.name);
            const known = isKnownField(s.name);
            const on = selected === s.name;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(on ? null : s.name)}
                title={s.name}
                className={`inline-flex items-baseline gap-1.5 mx-px px-1.5 rounded-[7px] align-baseline cursor-pointer transition-colors ${
                  on ? "bg-[#f5e35b]/25 ring-1 ring-[#f5e35b]" : v !== undefined ? "bg-[#f5e35b]/[0.12] hover:bg-[#f5e35b]/20" : known ? "outline-1 outline-dashed outline-white/25" : "bg-[#ff5a5a]/15"
                }`}
              >
                <span className={`font-mono text-[12.5px] ${v !== undefined ? "text-[#f5e35b]" : known ? "text-white/40" : "text-[#ff8a8a]"}`}>
                  {v !== undefined ? formatValue(v, 60) : known ? t.seat.notThisStreet : t.seat.unknownVariable}
                </span>
                <span className="font-mono text-[10px] text-white/35">{s.name.replace(/^state\./, "")}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[12px] leading-snug text-white/35">{t.seat.renderedNote}</p>
      </section>

      {/* What the game puts after it */}
      <details className="group rounded-[18px] bg-white/[0.04] border border-white/[0.08]">
        <summary className="list-none flex items-center justify-between px-4 h-11 cursor-pointer text-[13px] text-white/70">
          <span>{parts.kind === "decisions" ? t.seat.gameAddsDecisions : t.seat.gameAdds}</span>
          <span className="flex items-center gap-2 text-white/35 tabular-nums">
            ~{parts.tokens.rules}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-open:rotate-180">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </summary>
        <pre className="px-4 pb-4 font-mono text-[11.5px] leading-[1.7] text-white/55 whitespace-pre-wrap break-words max-h-[320px] overflow-y-auto no-scrollbar">
          {parts.rules}
        </pre>
      </details>

      {/* The state itself */}
      <details open={stateOpen} onToggle={(event) => setStateOpen(event.currentTarget.open)} className="group rounded-[18px] bg-black/35 border border-white/10">
        <summary className="flex items-center justify-between gap-2 px-4 min-h-11 cursor-pointer text-[13px] text-white/70">
          <h4 className="text-[13px] text-white/45">
            {t.seat.stateTitle}
          </h4>
          <span className="text-[12px] text-white/35 tabular-nums">~{parts.tokens.table}</span>
        </summary>
        <div className="max-h-[360px] py-3 font-mono text-[12px] leading-[1.75] overflow-x-auto">
          <JsonRows value={state} path="" depth={0} last lit={lit} inherited={null} selectedRef={selectedRef} />
        </div>
      </details>
    </div>
  );
};
