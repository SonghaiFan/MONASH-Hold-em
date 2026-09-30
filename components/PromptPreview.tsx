import React, { useMemo, useState } from "react";
import { Card, GamePhase, Suit } from "../types";
import { useLanguage } from "../services/i18n";
import {
  PreviewStreet,
  costPerDecision,
  sampleSituation,
  promptParts,
  rawRequestBody,
  sampleBoard,
  sampleHole,
} from "../services/promptPreview";

interface PromptPreviewProps {
  name: string; // the seat's name, which the sample hand is played under
  street: PreviewStreet;
  modelId: string;
  prompt: string; // what the seat will send ("" = the default)
  chartPreflop: boolean; // a styled seat plays preflop from the chart, without asking the model
  children?: React.ReactNode; // the editable template sits between the summary and supporting details
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

// What one opponent reads on each street of a sample hand: the prompt with
// every field it names filled in from this spot, what the game adds to it,
// and the `state` it all refers to.
export const PromptPreview: React.FC<PromptPreviewProps> = ({
  name,
  street,
  modelId,
  prompt,
  chartPreflop,
  children,
}) => {
  const { t } = useLanguage();
  const [raw, setRaw] = useState(false);
  const situation = sampleSituation(name, street);
  const parts = useMemo(() => promptParts(situation, modelId, prompt), [situation, modelId, prompt]);
  const rawBody = useMemo(() => rawRequestBody(situation, modelId, prompt), [situation, modelId, prompt]);
  const skipped = chartPreflop && street === GamePhase.PRE_FLOP;

  const cost = costPerDecision(modelId, parts.tokens.total) * 100;
  const costText = cost === 0 ? "$0" : cost < 0.1 ? `$${cost.toFixed(3)}` : `$${cost.toFixed(2)}`;
  const share = (n: number) => `${(n / parts.tokens.total) * 100}%`;
  const board = sampleBoard(street);

  return (
    <div className="space-y-5">
      {!!situation.variableDiagnostics?.length && <div role="status" className="rounded-xl bg-red-500/10 p-3 text-[13px] text-red-200">
        {situation.variableDiagnostics.map(d => <p key={d.pluginId}>{d.pluginId}: {d.message}</p>)}
      </div>}
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
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#f5e35b]" />{parts.kind === "chat" ? t.seat.prompt : t.seat.tokenParts.yours} {parts.tokens.yours}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white/35" />{t.seat.tokenParts.rules} {parts.tokens.rules}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white/15" />{t.seat.tokenParts.table} {parts.tokens.table}</span>
          <span className="ml-auto text-white/70">{t.seat.tokens(parts.tokens.total)} · {t.seat.costPer100(costText)}</span>
          <button type="button" aria-pressed={raw} onClick={() => setRaw(v => !v)}
            className={`h-7 px-2.5 rounded-full font-sans text-[12px] cursor-pointer ${raw ? "bg-white text-black" : "bg-white/[0.07] text-white/60"}`}>
            Raw
          </button>
        </div>
      </div>

      {skipped && <p className="text-[13px] leading-snug text-white/55">{t.seat.chartPreflop}</p>}

      {raw ? (
        <pre className="max-h-[520px] overflow-auto rounded-[18px] bg-black/35 border border-white/10 p-4 font-mono text-[11.5px] leading-[1.65] text-white/65 whitespace-pre-wrap break-words">
          {rawBody}
        </pre>
      ) : children}
    </div>
  );
};
