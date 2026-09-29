import React, { useState } from "react";
import { useLanguage } from "../services/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { FrankSignature } from "./FrankSignature";
import { PlayingCard } from "./PlayingCard";
import { Suit } from "../types";

interface LoginPageProps {
  onLogin: (username: string) => void;
  isExiting?: boolean;
}

// The front door: the name of the game, your name, and a way in.
export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, isExiting }) => {
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const name = username.trim();

  const enter = (e: React.FormEvent) => {
    e.preventDefault();
    if (name) onLogin(name);
  };

  return (
    <div
      className={`
        relative w-full h-full bg-black overflow-hidden
        transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)]
        ${isExiting ? "-translate-y-4 opacity-0 blur-sm" : "translate-y-0 opacity-100"}
      `}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Two cards drifting in the dark behind everything */}
      <div aria-hidden className="absolute inset-0 pointer-events-none perspective-1000">
        <div className="absolute top-[3%] -right-[34%] md:right-[8%] opacity-[0.13] animate-[float-3d-reverse_18s_ease-in-out_infinite]">
          <div className="-rotate-[15deg] scale-90">
            <PlayingCard card={{ rank: "K", suit: Suit.Spades, id: "bg-king-s" }} size={26} />
          </div>
        </div>
        <div className="absolute -bottom-[16%] -left-[6%] md:left-[18%] opacity-[0.15] animate-[float-3d-slow_12s_ease-in-out_infinite_reverse]">
          <div className="rotate-[30deg] scale-110">
            <PlayingCard card={{ rank: "A", suit: Suit.Hearts, id: "bg-ace-h" }} size={32} />
          </div>
        </div>
      </div>

      <form
        onSubmit={enter}
        className="relative w-full max-w-[480px] h-full mx-auto flex flex-col"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="h-14 px-5 flex items-center justify-end shrink-0">
          <LanguageToggle />
        </div>

        <div className="flex-1 flex flex-col justify-center px-5">
          {/* The name of the game: the handwritten Frankie signature, Hold'em set beneath it */}
          <h1 aria-label={t.login.title} className="text-white">
            <FrankSignature title="Frankie" className="w-[260px] h-auto -ml-1" />
            <span aria-hidden className="block mt-3 text-[40px] font-extralight leading-none tracking-tight">
              Hold'em
            </span>
          </h1>
        </div>

        <div className="px-5 flex flex-col gap-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t.login.namePlaceholder}
            aria-label={t.login.namePlaceholder}
            autoFocus
            autoComplete="nickname"
            spellCheck={false}
            maxLength={12}
            className="w-full h-[52px] px-5 rounded-full bg-[#1c1c1e] text-[16px] text-white placeholder:text-white/35 outline-none border border-transparent focus:border-white/25 transition-colors"
          />
          <button
            type="submit"
            disabled={!name}
            className="w-full h-[52px] rounded-full bg-white text-black text-[16px] active:scale-[0.98] transition-all cursor-pointer disabled:bg-transparent disabled:border disabled:border-white/15 disabled:text-white/35 disabled:cursor-default"
          >
            {t.login.play}
          </button>
        </div>
      </form>
    </div>
  );
};
