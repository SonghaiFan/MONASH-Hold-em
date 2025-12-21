import React from 'react';
import { Card, GamePhase, WinningHand } from '../types';
import { PlayingCard } from './PlayingCard';
import { ChipStack } from './ChipStack';

interface TableStratumProps {
    pot: number;
    board: Card[];
    phase: GamePhase;
    winningHand: WinningHand | null;
}

export const TableStratum: React.FC<TableStratumProps> = ({ pot, board, phase, winningHand }) => {
    const visibleCardsCount = 
        phase === GamePhase.PRE_FLOP ? 0 :
        phase === GamePhase.FLOP ? 3 :
        phase === GamePhase.TURN ? 4 : 5;

    const renderLayout = () => {
        return [0, 1, 2, 3, 4].map((index) => {
            const isVisible = index < visibleCardsCount;
            const card = board[index];
            const isWinningCard = winningHand ? (card && winningHand.cardIds.includes(card.id)) : false;

            // Adjust Z-Index so hover works, but naturally they layer L->R
            const zIndex = 10 + index;

            return (
                <div 
                    key={index} 
                    className={`
                        relative transition-all duration-500 ease-out hover:!z-50 hover:-translate-y-6
                        /* Mobile: Negative margin for overlap */
                        ${index === 0 ? 'ml-0' : '-ml-[1em] md:ml-3'}
                    `}
                    style={{ 
                        zIndex: zIndex,
                    }}
                >
                    {/* Size Context: Mobile 9px, Desktop 13px */}
                    <div className="relative w-[10em] h-[14em] text-[8px] md:text-[13px]">
                        
                        {/* Placeholder Slot (Empty) */}
                        <div className="absolute inset-0 rounded-[1em] border-white/10 bg-white/5 z-0 shadow-inner" />

                        {/* Active Card */}
                        {isVisible && (
                            <div className="absolute inset-0 z-10">
                                <PlayingCard
                                    card={card}
                                    hidden={false}
                                    delay={0.1 * (index + 1)}
                                    isWinning={isWinningCard}
                                    size="inherit"
                                    className="shadow-2xl !w-full !h-full"
                                />
                            </div>
                        )}
                    </div>
                </div>
            );
        });
    };

    return (
        <section className="relative w-full h-[43vh] flex flex-col items-center justify-center bg-transparent z-10 py-2 md:py-6 shrink-0">
            
            {/* Background Pot Chips */}
            <div className="absolute inset-0 z-0 overflow-hidden opacity-60 pointer-events-none">
                 <div className="absolute inset-x-0 bottom-0 top-0 mx-auto max-w-5xl">
                    <ChipStack amount={pot} />
                 </div>
            </div>

            {/* Pot Value Display */}
            <div className="absolute top-[10%] flex flex-col items-center mb-2 md:mb-6 transform transition-transform duration-500 z-10">
                <span className="font-sans text-[0.6rem] md:text-[1rem] tracking-[0.2em] text-[#888] uppercase mb-1">
                    Total Pot
                </span>
                <span className="font-mono text-3xl md:text-6xl text-white tracking-tight leading-none drop-shadow-xl">
                    ${pot.toLocaleString()}
                </span>
            </div>

            {/* Unified Card Container */}
            <div className="flex items-center justify-center z-10 h-[16em] w-full max-w-7xl px-4 mt-8">
                 {renderLayout()}
            </div>

            {/* Winning Hand Text */}
            {winningHand && (
                <div className="absolute bottom-4 md:bottom-10 left-0 right-0 text-center z-10">
                    <span className="text-[#d4af37] font-medium text-lg uppercase tracking-widest animate-in fade-in zoom-in duration-300 drop-shadow-lg bg-black/40 px-4 py-1 rounded-full backdrop-blur-md border border-[#d4af37]/20">
                        {winningHand.description}
                    </span>
                </div>
            )}
        </section>
    );
};