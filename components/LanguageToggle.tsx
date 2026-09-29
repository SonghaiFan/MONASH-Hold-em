import React from "react";
import { useLanguage } from "../services/i18n";

export const LanguageToggle: React.FC<{ className?: string }> = ({ className = "" }) => {
  const { lang, setLang } = useLanguage();

  const option = (value: "en" | "zh", label: string) => (
    <button
      type="button"
      onClick={() => setLang(value)}
      aria-pressed={lang === value}
      className={`h-7 px-3 rounded-full transition-colors duration-200 cursor-pointer ${
        lang === value ? "bg-white text-black" : "text-white/50 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      role="group"
      aria-label="Language selection"
      className={`inline-flex items-center rounded-full bg-[#1c1c1e] p-1 text-[13px] ${className}`}
    >
      {option("en", "EN")}
      {option("zh", "中文")}
    </div>
  );
};
