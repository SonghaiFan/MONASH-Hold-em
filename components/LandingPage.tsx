import React, { useState, useEffect } from "react";
import { DEFAULT_CONFIG } from "../constants";
import { GameConfig } from "../types";
import { ActionButton } from "./ActionButton";
import { useLanguage } from "../contexts/LanguageContext";

import { formatChips } from "../utils";

interface LandingPageProps {
  onStartGame: (config: GameConfig) => void;
  username: string | null;
  isExiting?: boolean;
}

interface GameLevel {
  id: string;
  name: string;
  sub: string;
  buyIn: number;
  blindBig: number;
  desc: string;
}

const LEVELS: GameLevel[] = [
  {
    id: "one",
    name: "level.name.one",
    sub: "level.sub.one",
    buyIn: 200,
    blindBig: 2,
    desc: "level.one",
  },
  {
    id: "two",
    name: "level.name.two",
    sub: "level.sub.two",
    buyIn: 1000,
    blindBig: 10,
    desc: "level.two",
  },
  {
    id: "three",
    name: "level.name.three",
    sub: "level.sub.three",
    buyIn: 10000,
    blindBig: 100,
    desc: "level.three",
  },
  {
    id: "four",
    name: "level.name.four",
    sub: "level.sub.four",
    buyIn: 100000,
    blindBig: 1000,
    desc: "level.four",
  },
  {
    id: "five",
    name: "level.name.five",
    sub: "level.sub.five",
    buyIn: 500000,
    blindBig: 5000,
    desc: "level.five",
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartGame,
  username,
  isExiting,
}) => {
  const { t } = useLanguage();
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);
  // Fixed: Initialize with a valid ID from the LEVELS array
  const [selectedLevelId, setSelectedLevelId] = useState<string>("one");

  // Sync config with selected level
  useEffect(() => {
    const level = LEVELS.find((l) => l.id === selectedLevelId);
    if (level) {
      setConfig((prev) => ({
        ...prev,
        blindBig: level.blindBig,
        startingStackHuman: level.buyIn,
        startingStackAI: level.buyIn,
      }));
    }
  }, [selectedLevelId]);

  // Handle initial username sync
  useEffect(() => {
    if (username) {
      setConfig((prev) => ({ ...prev, playerName: username }));
    }
  }, [username]);

  const handleOpponentChange = (val: number) => {
    setConfig((prev) => ({ ...prev, opponentCount: val }));
  };

  // Safe access with fallback (though fallback shouldn't be needed with correct initial state)
  const selectedLevel =
    LEVELS.find((l) => l.id === selectedLevelId) || LEVELS[0];

  return (
    <div
      className={`
            w-full h-full overflow-y-auto overflow-x-hidden relative z-20
            transition-all duration-700 ease-[cubic-bezier(0.64,0,0.78,0)]
            ${isExiting
          ? "-translate-y-8 opacity-0 blur-md"
          : "translate-y-0 opacity-100 blur-0"
        }
        `}
    >
      {/* Background elements */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-2/3 h-full bg-gradient-to-l from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      <div className="min-h-full flex flex-col items-center justify-center p-4 md:p-6 py-8 md:py-12">
        <div className="w-full max-w-4xl flex flex-col gap-6 md:gap-10 animate-in slide-in-from-bottom-12 fade-in duration-700">
          {/* Header */}
          <div className="flex flex-col border-b border-white/10 pb-4 md:pb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl md:text-3xl font-light text-white tracking-tight font-sans">
                {t('landing.table_setup')}
              </h2>
              <div className="flex items-center gap-3">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#d4af37] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-full w-full bg-[#d4af37]"></span>
                </span>
                <span className="text-[0.6rem] md:text-xs font-mono text-white/50 uppercase tracking-widest">
                  {t('landing.player')}:{" "}
                  <span className="text-white">{username || t('landing.unknown')}</span>
                </span>
              </div>
            </div>
          </div>

          {/* LEVEL SELECTION (Horizontal Cards) */}
          <div className="flex flex-col gap-4">
            <label className="text-[0.6rem] font-bold uppercase tracking-widest text-[#666] font-sans pl-1">
              {t('landing.select_stratum')}
            </label>

            <div className="w-full overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 no-scrollbar snap-x snap-mandatory">
              <div className="flex gap-4 min-w-max">
                {LEVELS.map((level) => {
                  const isActive = selectedLevelId === level.id;
                  return (
                    <button
                      key={level.id}
                      onClick={() => setSelectedLevelId(level.id)}
                      className={`
                                                relative w-[240px] md:w-[260px] p-6 rounded-2xl border text-left flex flex-col gap-4
                                                transition-all duration-300 snap-center group
                                                ${isActive
                          ? "bg-[#d4af37] border-[#d4af37] text-black shadow-[0_0_30px_rgba(212,175,55,0.2)] scale-100"
                          : "bg-black/40 border-white/10 text-gray-400 hover:bg-white/5 hover:border-white/30 scale-95 hover:scale-100"
                        }
                                            `}
                    >
                      <div className="flex justify-between items-start w-full">
                        <div className="flex flex-col">
                          <span
                            className={`text-[0.6rem] font-mono uppercase tracking-widest mb-1 ${isActive ? "text-black/60" : "text-gray-500"
                              }`}
                          >
                            {t(level.sub)}
                          </span>
                          <span
                            className={`text-lg font-bold font-sans tracking-tight leading-none ${isActive ? "text-black" : "text-white"
                              }`}
                          >
                            {t(level.name)}
                          </span>
                        </div>
                        {isActive && (
                          <div className="w-2 h-2 rounded-full bg-black animate-pulse" />
                        )}
                      </div>

                      <div className="mt-auto flex flex-col gap-1">
                        <div className="flex justify-between items-end border-b border-black/10 pb-2 mb-2">
                          <span className="text-[0.6rem] uppercase font-bold">
                            {t('landing.buy_in')}
                          </span>
                          <span className="font-mono text-xl font-bold tracking-tighter">
                            ${formatChips(level.buyIn)}
                          </span>
                        </div>
                        <div className="flex justify-between items-end">
                          <span className="text-[0.6rem] uppercase font-bold">
                            {t('landing.blinds')}
                          </span>
                          <span className="font-mono text-sm font-bold">
                            ${level.blindBig / 2}/${level.blindBig}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[0.5rem] uppercase tracking-widest font-bold shadow-sm ${isActive
                          ? "bg-black text-[#d4af37]"
                          : "bg-[#222] text-gray-500"
                          }`}
                      >
                        {t(level.desc)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* TACTICAL CONFIG (Table Size) */}
          <div className="bg-black/20 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex flex-col mb-4">
              <label className="text-[0.6rem] font-bold uppercase tracking-widest text-[#666] font-sans pl-1">
                {t('landing.tactical_config')}
              </label>
              <span className="text-xs text-white/40 mt-1 pl-1">
                {t('landing.total_players_note')}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 md:gap-4">
              {[
                { total: 2, opponents: 1, label: "landing.size.heads_up", desc: "landing.size.duel" },
                { total: 6, opponents: 5, label: "landing.size.6max", desc: "landing.size.short_handed" },
                {
                  total: 10,
                  opponents: 9,
                  label: "landing.size.full_ring",
                  desc: "landing.size.standard",
                },
              ].map((size) => {
                const isSelected = config.opponentCount === size.opponents;
                return (
                  <button
                    key={size.total}
                    onClick={() => handleOpponentChange(size.opponents)}
                    className={`
                                            relative flex flex-col items-center justify-center py-4 md:py-6 px-2 rounded-xl border transition-all duration-300 group
                                            ${isSelected
                        ? "bg-[#d4af37]/10 border-[#d4af37] shadow-[0_0_20px_rgba(212,175,55,0.15)]"
                        : "bg-black/40 border-white/5 hover:bg-white/5 hover:border-white/20"
                      }
                                        `}
                  >
                    <div className="flex items-baseline gap-1 mb-1">
                      <span
                        className={`text-2xl md:text-3xl font-mono font-bold tracking-tighter ${isSelected
                          ? "text-[#d4af37]"
                          : "text-white/40 group-hover:text-white/60"
                          }`}
                      >
                        {size.total}
                      </span>
                      <span
                        className={`text-[0.6rem] font-bold uppercase ${isSelected ? "text-[#d4af37]/80" : "text-white/20"
                          }`}
                      >
                        {t('landing.player')}
                      </span>
                    </div>

                    <span
                      className={`text-[0.55rem] uppercase tracking-[0.2em] font-bold mb-1 ${isSelected ? "text-white" : "text-white/30"
                        }`}
                    >
                      {t(size.label)}
                    </span>

                    <span
                      className={`text-[0.5rem] font-mono ${isSelected ? "text-[#d4af37]/60" : "text-white/20"
                        }`}
                    >
                      {t(size.desc)}
                    </span>

                    {isSelected && (
                      <div className="absolute inset-0 border border-[#d4af37] rounded-xl animate-pulse opacity-20" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* DEPLOY BUTTON */}
          <div className="pt-4 md:pt-8">
            <ActionButton
              onClick={() => onStartGame(config)}
              variant="gold"
              className="w-full text-xs md:text-sm tracking-[0.3em] py-5 md:py-6 shadow-[0_0_40px_rgba(212,175,55,0.15)] hover:shadow-[0_0_80px_rgba(212,175,55,0.3)] border-[#d4af37]/50"
            >
              {t('action.initiate')}: {t(selectedLevel.name)}
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
};
