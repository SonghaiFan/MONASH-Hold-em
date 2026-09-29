import React from "react";
import { Card, GamePhase, WinningHand } from "../types";
import { PlayingCard } from "./PlayingCard";
import { AnimatedCounter } from "./AnimatedCounter";
import { useLanguage } from "../services/i18n";

interface TableStratumProps {
  pot: number;
  board: Card[];
  phase: GamePhase;
  winningHand: WinningHand | null;
}

export const TableStratum: React.FC<TableStratumProps> = ({
  pot,
  board,
  phase,
  winningHand,
}) => {
  const { translateHand } = useLanguage();
  const visibleCardsCount =
    phase === GamePhase.PRE_FLOP ? 0 : phase === GamePhase.FLOP ? 3 : phase === GamePhase.TURN ? 4 : 5;

  const decided = !!winningHand && winningHand.cardIds.length > 0;

  return (
    <section className="w-full px-5">
      {/* The board: five cards edge to edge, face down until dealt. Each slot
          is a size container, so a card's em is a tenth of its slot's width. */}
      <div className="flex">
        {[0, 1, 2, 3, 4].map((index) => {
          const card = board[index];
          const isWinningCard = !!card && !!winningHand?.cardIds.includes(card.id);
          return (
            <div
              key={index}
              className={`flex-1 min-w-0 [container-type:inline-size] ${index > 0 ? "-ml-2" : ""}`}
              style={{ zIndex: index }}
            >
              <PlayingCard
                card={card}
                hidden={index >= visibleCardsCount}
                flipDelay={index < 3 ? 0.08 * index : 0}
                isWinning={isWinningCard}
                dimmed={decided && !isWinningCard}
                size="inherit"
                className="text-[10cqw]"
              />
            </div>
          );
        })}
      </div>

      {/* The winning hand on the left, the pot on the right */}
      <div className="flex items-center justify-between gap-4 mt-3 min-h-10">
        <div className="min-w-0">
          {winningHand && (
            <span className="inline-block max-w-full truncate h-7 leading-7 px-3 rounded-full bg-white text-black text-[14px] animate-in fade-in zoom-in-95 duration-300">
              {translateHand(winningHand.description)}
            </span>
          )}
        </div>
        <span className="text-[34px] font-light leading-none text-white tabular-nums">
          <AnimatedCounter value={pot} />
        </span>
      </div>
    </section>
  );
};
