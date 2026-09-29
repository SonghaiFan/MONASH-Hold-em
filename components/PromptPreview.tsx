import React, { useMemo, useState } from "react";
import { useLanguage } from "../services/i18n";
import { Situation } from "../services/pokerSituation";
import {
  PREVIEW_STREETS,
  PreviewStreet,
  costPerDecision,
  promptParts,
  referencedFields,
  sampleBoard,
  sampleHole,
} from "../services/promptPreview";
import { Card, Suit } from "../types";

interface PromptPreviewProps {
  name: string;
  modelId: string;
  prompt: string; // the seat's saved prompt; "" means the default
  situations: Record<PreviewStreet, Situation>;
  street: PreviewStreet;
  onStreet: (street: PreviewStreet) => void;
}

// The three parts of every request, drawn in the same colours in the bars and the blocks
const YOURS = "#f5e35b";
const RULES = "rgba(255,255,255,0.18)";
const TABLE = "rgba(255,255,255,0.5)";

const isRed = (s: Suit) => s === Suit.Hearts || s === Suit.Diamonds;
const Cards: React.FC<{ cards: Card[] }> = ({ cards }) => (
  <span className="inline-flex gap-1">
    {cards.map((c) => (
      <span
        key={c.id}
        className={`h-6 min-w-[30px] px-1.5 rounded-md bg-white/[0.92] text-[13px] leading-6 text-center font-medium tabular-nums ${isRed(c.suit) ? "text-[#d8262d]" : "text-black"}`}
      >
        {c.rank}
        {c.suit}
      </span>
    ))}
  </span>
);

// Backtick references become small pills, so you can see what your words point at
const Words: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(`[\w.]+`)/g).map((part, i) =>
      /^`[\w.]+`$/.test(part) ? (
        <code key={i} className="px-1.5 py-px rounded-md bg-white/[0.1] text-white font-mono text-[12.5px]">
          {part.slice(1, -1)}
        </code>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    )}
  </>
);

const Block: React.FC<{
  swatch: string;
  title: string;
  tag: string;
  tokens: number;
  note?: string;
  open: boolean;
  onToggle?: () => void;
  summary?: React.ReactNode;
  children: React.ReactNode;
}> = ({ swatch, title, tag, tokens, note, open, onToggle, summary, children }) => {
  const { t } = useLanguage();
  const Head = onToggle ? "button" : "div";
  return (
    <section className="rounded-[20px] bg-black/30 border border-white/[0.06]">
      <Head
        {...(onToggle ? { type: "button", onClick: onToggle, "aria-expanded": open } : {})}
        className={`w-full flex items-center gap-3 px-4 h-12 text-left ${onToggle ? "cursor-pointer hover:bg-white/[0.03] rounded-[20px] transition-colors" : ""}`}
      >
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: swatch }} />
        <span className="text-[14px] text-white">{title}</span>
        <span className="h-5 px-2 rounded-full bg-white/[0.06] text-[11px] leading-5 text-white/45 font-mono">{tag}</span>
        <span className="ml-auto text-[12px] text-white/35 tabular-nums">{t.seat.tokens(tokens)}</span>
        {onToggle && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-white/40 transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </Head>
      {!open && summary && <div className="px-4 pb-3 -mt-1 text-[13px] text-white/40">{summary}</div>}
      {open && (
        <div className="px-4 pb-4">
          {note && <p className="mb-2 text-[12.5px] text-white/35">{note}</p>}
          {children}
        </div>
      )}
    </section>
  );
};

// What one opponent reads before a decision, street by street of a sample hand.
// Three parts: your words, the rules the game adds, and the table as it stands.
export const PromptPreview: React.FC<PromptPreviewProps> = ({ name, modelId, prompt, situations, street, onStreet }) => {
  const { t } = useLanguage();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(true);

  const all = useMemo(
    () => Object.fromEntries(PREVIEW_STREETS.map((s) => [s, promptParts(situations[s], modelId, prompt)])) as Record<PreviewStreet, ReturnType<typeof promptParts>>,
    [situations, modelId, prompt]
  );
  const parts = all[street];
  const maxTotal = Math.max(...PREVIEW_STREETS.map((s) => all[s].tokens.total));
  const refs = useMemo(() => new Set(referencedFields(parts.yours).map((f) => f.split(".").pop()!)), [parts.yours]);
  const share = Math.round((parts.tokens.yours / parts.tokens.total) * 100);
  const cost100 = costPerDecision(modelId, parts.tokens.total) * 100;
  const edited = prompt.trim() !== "";
  const chat = parts.kind === "chat";

  return (
    <div className="flex flex-col gap-4">
      {/* Streets: each tab is also a bar of how much is read there, split into the three parts */}
      <div className="grid grid-cols-4 gap-2" role="tablist">
        {PREVIEW_STREETS.map((s) => {
          const p = all[s].tokens;
          const on = s === street;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onStreet(s)}
              className={`group rounded-[16px] px-3 pt-2.5 pb-3 text-left transition-colors cursor-pointer ${on ? "bg-white/[0.09]" : "hover:bg-white/[0.04]"}`}
            >
              <div className={`text-[13px] ${on ? "text-white" : "text-white/50 group-hover:text-white/75"}`}>{t.seat.streets[s]}</div>
              <div className="mt-2 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div className="h-full flex" style={{ width: `${(p.total / maxTotal) * 100}%` }}>
                  <span style={{ width: `${(p.yours / p.total) * 100}%`, background: edited ? YOURS : "rgba(245,227,91,0.45)" }} />
                  <span style={{ width: `${(p.rules / p.total) * 100}%`, background: RULES }} />
                  <span style={{ width: `${(p.table / p.total) * 100}%`, background: TABLE }} />
                </div>
              </div>
              <div className="mt-1.5 text-[11px] text-white/30 tabular-nums">{t.seat.tokens(p.total)}</div>
            </button>
          );
        })}
      </div>

      {/* Less is more: how much of the read is yours, and what a decision costs */}
      <div className="px-1 flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[14px] text-white/80">{t.seat.shareOfRead(share)}</span>
          <span className="text-[12px] text-white/35 tabular-nums shrink-0">{t.seat.costPer100(cost100)}</span>
        </div>
        <p className="text-[13px] leading-snug text-white/40">{t.seat.lessIsMore(name)}</p>
      </div>

      {/* The spot being decided */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-white/45">
        <Cards cards={sampleHole} />
        <span className="text-white/20">/</span>
        {sampleBoard(street).length ? <Cards cards={sampleBoard(street)} /> : <span>{t.seat.noBoard}</span>}
        <span className="ml-auto flex gap-1.5">
          {parts.legal.map((a) => (
            <span key={a} className="h-6 px-2.5 rounded-full border border-white/10 text-[12px] leading-[22px] text-white/60">
              {a}
            </span>
          ))}
        </span>
      </div>

      <Block swatch={edited ? YOURS : "rgba(245,227,91,0.45)"} title={t.seat.yourWords} tag={chat ? "system" : "action.instructions"} tokens={parts.tokens.yours} open>
        <p className={`text-[14px] leading-relaxed whitespace-pre-wrap ${edited ? "text-white" : "text-white/65"}`}>
          <Words text={parts.yours} />
        </p>
      </Block>

      <Block
        swatch={RULES}
        title={t.seat.rules}
        tag={chat ? "system" : "questions"}
        tokens={parts.tokens.rules}
        note={t.seat.rulesNote}
        open={rulesOpen}
        onToggle={() => setRulesOpen((o) => !o)}
        summary={t.seat.rulesSummary(parts.legal.length, parts.sizes.length)}
      >
        <pre className="max-h-[320px] overflow-auto no-scrollbar text-[12px] leading-relaxed text-white/45 font-mono whitespace-pre-wrap break-words">{parts.rules}</pre>
      </Block>

      <Block
        swatch={TABLE}
        title={t.seat.table}
        tag={chat ? "user" : "state"}
        tokens={parts.tokens.table}
        note={refs.size ? t.seat.tableNoteRefs : t.seat.tableNote}
        open={tableOpen}
        onToggle={() => setTableOpen((o) => !o)}
        summary={t.seat.tableSummary}
      >
        <pre className="max-h-[360px] overflow-auto no-scrollbar text-[12px] leading-relaxed font-mono">
          {parts.table.split("\n").map((line, i) => {
            const key = line.match(/^\s*"(\w+)":/)?.[1];
            const hit = key !== undefined && refs.has(key);
            return (
              <div key={i} className={`-mx-2 px-2 rounded ${hit ? "bg-[#f5e35b]/[0.1] text-white" : "text-white/40"}`}>
                {line}
              </div>
            );
          })}
        </pre>
      </Block>

    </div>
  );
};
