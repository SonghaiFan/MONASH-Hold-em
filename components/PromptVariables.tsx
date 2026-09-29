import React, { useState } from "react";
import { useLanguage } from "../services/i18n";
import { FIELD_GROUPS, FieldGroup, PROMPT_FIELDS } from "../services/promptFields";

interface PromptVariablesProps {
  used: Set<string>; // names the prompt already refers to
  onInsert: (path: string) => void;
}

// What a prompt can point at: the fields of the `state` every decision is sent
// with, a group at a time. Tapping one writes it into the prompt, in backticks.
export const PromptVariables: React.FC<PromptVariablesProps> = ({ used, onInsert }) => {
  const { t, lang } = useLanguage();
  const [group, setGroup] = useState<FieldGroup>("you");
  // A key inside list entries also counts written on its own: `reads` for `tableInActionOrder[].reads`
  const isUsed = (path: string) =>
    used.has(path) || used.has(path.replace("[]", "")) || (path.includes("[]") && used.has(path.split(".").pop()!));

  return (
    <div className="rounded-[20px] bg-black/35 border border-white/10 overflow-hidden">
      <div className="px-4 pt-3.5">
        <div className="text-[15px] text-white">{t.seat.variables}</div>
        <p className="mt-1 text-[13px] leading-snug text-white/45">{t.seat.variablesNote}</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 pt-3 pb-2">
        {FIELD_GROUPS.map((g) => {
          const on = g === group;
          const any = PROMPT_FIELDS.some((f) => f.group === g && isUsed(f.path));
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={`relative shrink-0 h-8 px-3.5 rounded-full text-[13px] transition-colors cursor-pointer ${
                on ? "bg-white text-black" : "bg-white/[0.07] text-white/80 hover:bg-white/[0.12]"
              }`}
            >
              {t.seat.fieldGroups[g]}
              {any && <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${on ? "bg-black/60" : "bg-[#f5e35b]"}`} />}
            </button>
          );
        })}
      </div>

      <ul className="max-h-[280px] overflow-y-auto no-scrollbar pb-2">
        {PROMPT_FIELDS.filter((f) => f.group === group).map((f) => {
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
                  <code className={`font-mono text-[13px] truncate ${on ? "text-[#f5e35b]" : "text-white"}`}>{f.path}</code>
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
                <span className="block mt-0.5 font-mono text-[11px] text-white/30 truncate">{f.example}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
