import React, { useState } from "react";
import { useLanguage } from "../services/i18n";
import { PROMPT_FIELDS, fieldLabel } from "../services/promptFields";

interface PromptVariablesProps {
  used: Set<string>; // names the prompt already refers to
  onInsert: (path: string) => void;
  valueOf?: (path: string) => unknown; // what each field holds in the previewed spot
  className?: string;
}

// What a prompt can point at: the fields of the `state` every decision is sent
// with, a group at a time. Tapping one writes it into the prompt, in backticks.
export const PromptVariables: React.FC<PromptVariablesProps> = ({ used, onInsert, valueOf, className = "" }) => {
  const { t, lang } = useLanguage();
  const [query, setQuery] = useState("");
  const fields = PROMPT_FIELDS.filter(f => `${f.path} ${f.desc[lang]} ${fieldLabel(f.path, lang)}`.toLowerCase().includes(query.toLowerCase()));
  // A key inside list entries also counts written on its own: `reads` for `tableInActionOrder[].reads`
  const isUsed = (path: string) =>
    used.has(path) || used.has(path.replace("[]", "")) || (path.includes("[]") && used.has(path.split(".").pop()!));

  return (
    <div className={`rounded-[20px] bg-black/35 border border-white/10 overflow-hidden ${className}`}>
      <div className="p-3">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} aria-label={t.seat.searchInformation} placeholder={t.seat.searchInformation} className="w-full rounded-xl bg-white/5 px-3 py-2 text-[16px] text-white outline-none focus:ring-1 focus:ring-white/30" />
      </div>
      {fields.length === 0 && <p className="px-4 pb-4 text-[13px] text-white/50">{t.seat.noInformation}</p>}
      <ul className="pb-2">
        {fields.map((f) => {
          const on = isUsed(f.path);
          return (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => onInsert(f.path)}
                title={t.seat.insertVariable}
                className="group w-full text-left px-4 py-2.5 hover:bg-white/[0.04] active:bg-white/[0.07] transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <code className={`text-[14px] truncate ${on ? "text-[#f5e35b]" : "text-white"}`}>{fieldLabel(f.path, lang)}</code>
                  {f.sometimes && (
                    <span className="shrink-0 h-[18px] px-1.5 rounded-full bg-white/[0.08] text-[11px] leading-[18px] text-white/50">
                      {t.seat.sometimes}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[18px] leading-none text-white/25 group-hover:text-white/70 transition-colors">
                    {on ? "✓" : "+"}
                  </span>
                </span>
                <span className="block mt-0.5 text-[13px] leading-snug text-white/55">{f.desc[lang]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
