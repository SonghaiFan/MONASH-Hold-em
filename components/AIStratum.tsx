import React, { useEffect, useRef, useState, useMemo } from 'react';
import { GamePhase, Player, WinningHand } from '../types';
import { PlayingCard } from './PlayingCard';
import { AnimatedCounter } from './AnimatedCounter';

interface AIStratumProps {
    players: Player[];
    activePlayerId: string | null;
    phase: GamePhase;
    humanHasFolded: boolean;
    winningHand: WinningHand | null;
    aiIntent?: { playerId: string; action: string; amount?: number } | null;
}

export const AIStratum: React.FC<AIStratumProps> = ({ players, activePlayerId, phase, humanHasFolded, winningHand, aiIntent }) => {
    // 1. Filter out eliminated players (Hide them)
    const visiblePlayers = useMemo(() => 
        players.filter(p => p.status !== 'ELIMINATED'), 
    [players]);

    // 2. Identify active (non-folded) visible players for sequential timing logic
    const activeVisiblePlayers = useMemo(() => 
        visiblePlayers.filter(p => p.status !== 'FOLDED'), 
    [visiblePlayers]);

    const focalCardRef = useRef<HTMLDivElement>(null);
    const [revealFocusId, setRevealFocusId] = useState<string | null>(null);
    const [peekedPlayers, setPeekedPlayers] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (phase === GamePhase.SHOWDOWN && !winningHand) {
            const timeouts: ReturnType<typeof setTimeout>[] = [];
            
            // Schedule focus updates based on sequential active index
            activeVisiblePlayers.forEach((p, i) => {
                const delay = i * 1500;
                const t = setTimeout(() => {
                    setRevealFocusId(p.id);
                }, delay);
                timeouts.push(t);
            });

            return () => timeouts.forEach(clearTimeout);
        } else {
            setRevealFocusId(null);
        }
    }, [phase, winningHand, activeVisiblePlayers]);

    useEffect(() => {
        if (phase === GamePhase.PRE_FLOP) {
            setPeekedPlayers(new Set());
        }
    }, [phase]);

    useEffect(() => {
        if (focalCardRef.current) {
            focalCardRef.current.scrollIntoView({
                behavior: 'smooth',
                inline: 'center',
                block: 'nearest'
            });
        }
    }, [activePlayerId, winningHand, revealFocusId]);

    const togglePeek = (playerId: string) => {
        setPeekedPlayers(prev => {
            const next = new Set(prev);
            if (next.has(playerId)) {
                next.delete(playerId);
            } else {
                next.add(playerId);
            }
            return next;
        });
    };

    return (
        <section className="relative w-full border-b border-white/5 rounded-b-3xl bg-black/10 backdrop-blur-lg h-[25vh] shrink-0 z-20 shadow-sm transition-all duration-500 overflow-hidden mx-auto max-w-[1920px]">
            <div className="w-full h-full overflow-x-auto no-scrollbar flex">
                {/* Enforcing mobile spacing and padding everywhere */}
                <div className="flex h-full items-center gap-2 px-6 py-3 m-auto min-w-max">
                    {visiblePlayers.map((p, i) => {
                        const isThinking = activePlayerId === p.id;
                        const isFolded = p.status === 'FOLDED';
                        const isEliminated = p.status === 'ELIMINATED'; // Should effectively be false here
                        const hasBet = p.currentBet > 0;
                        
                        const isPeeked = peekedPlayers.has(p.id);
                        const shouldReveal = (phase === GamePhase.SHOWDOWN && p.isActive && !humanHasFolded) || isPeeked;
                        const isWinner = winningHand?.playerId === p.id;

                        const isFocal = winningHand 
                            ? (winningHand.focalPlayerId === p.id) 
                            : (revealFocusId === p.id || (!revealFocusId && activePlayerId === p.id));

                        // Calculate reveal delay based on sequential active index (skips gaps from folded/eliminated)
                        const activeIndex = activeVisiblePlayers.findIndex(avp => avp.id === p.id);
                        const revealDelay = (phase === GamePhase.SHOWDOWN && !isPeeked && activeIndex !== -1) 
                            ? (activeIndex * 1.5) 
                            : 0;

                        let statusText: string = p.status;
                        let statusClass = '';
                        
                        if (aiIntent?.playerId === p.id) {
                            statusText = aiIntent.action.toUpperCase();
                            if (statusText === 'CALL') statusText = 'CALLED';
                            if (statusText === 'CHECK') statusText = 'CHECKED';
                            if (statusText === 'RAISE') statusText = 'RAISED';
                            if (statusText === 'FOLD') statusText = 'FOLDED';

                            // Intent colors for immediate feedback
                            if (statusText === 'CHECKED') statusClass = 'text-[#a3a3a3] animate-pulse font-bold';
                            else if (statusText === 'RAISED') statusClass = 'text-[#d4af37] animate-pulse font-bold';
                            else if (statusText === 'FOLDED') statusClass = 'text-red-400 animate-pulse font-bold';
                            else statusClass = 'text-white animate-pulse font-bold';
                        } else if (isThinking && p.status === 'WAITING') {
                            statusText = 'Thinking...';
                            statusClass = 'text-[#d4af37] animate-pulse';
                        } else {
                            if (p.status === 'CHECKED') statusClass = 'text-[#a3a3a3]';
                            else if (p.status === 'RAISED') statusClass = 'text-[#d4af37]';
                            else if (p.status === 'CALLED') statusClass = 'text-white';
                            else if (isEliminated) statusClass = 'text-red-800';
                            else if (isWinner) statusClass = 'text-[#d4af37]';
                        }

                        return (
                            <div 
                                key={p.id}
                                ref={isFocal ? focalCardRef : null}
                                className={`
                                    h-full relative flex flex-col justify-between rounded-3xl
                                    transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] snap-center
                                    border group
                                    ${isFolded 
                                        ? 'border-transparent opacity-0 -translate-y-16 scale-90 pointer-events-none w-0 min-w-0 m-0'
                                        : 'min-w-[130px]'
                                    }
                                    ${!isFolded && isEliminated
                                        ? 'bg-red-900/10 border-red-900/10 opacity-40 grayscale'
                                        : ''}
                                    ${!isFolded && !isEliminated && isWinner
                                        ? 'bg-[#d4af37]/10 border-[#d4af37] shadow-[0_0_20px_rgba(212,175,55,0.15)] scale-105 z-20'
                                        : ''}
                                    ${!isFolded && !isEliminated && !isWinner && isThinking
                                        ? 'bg-white/10 border-white/20 shadow-xl scale-100 z-10 ring-1 ring-white/10'
                                        : ''}
                                    ${!isFolded && !isEliminated && !isWinner && !isThinking
                                        ? 'bg-black/20 border-white/5 hover:bg-black/30'
                                        : ''}
                                `}
                                style={{ 
                                    animation: !isFolded ? `cardReveal 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards ${i * 0.1}s` : 'none'
                                }}
                            >
                                {!isFolded && !isEliminated && winningHand && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            togglePeek(p.id);
                                        }}
                                        className={`
                                            absolute top-2 right-2 z-50 p-1.5 rounded-full backdrop-blur-md transition-all duration-200
                                            ${isPeeked ? 'bg-[#d4af37]/20 text-[#d4af37] opacity-100' : 'bg-black/40 text-white/40 opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-white'}
                                        `}
                                        title={isPeeked ? "Hide Cards" : "Peek Cards"}
                                    >
                                        {isPeeked ? (
                                             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                        )}
                                    </button>
                                )}

                                <div className={`w-[130px] p-3 h-full flex flex-col justify-between transition-opacity duration-300 ${isFolded ? 'opacity-0' : 'opacity-100'}`}>
                                    
                                    <div className={`relative h-[50px] w-full flex justify-center items-start -mt-2 pt-0 md:mt-0 md:pt-2 ${shouldReveal ? 'z-20' : 'z-1'}`}>
                                        {!isEliminated && (
                                            <div className={`flex -space-x-4 origin-top`}>
                                                {p.hand.map((card, cardIndex) => (
                                                    <PlayingCard
                                                        key={card.id}
                                                        card={card}
                                                        hidden={!shouldReveal}
                                                        delay={0}
                                                        flipDelay={revealDelay + (cardIndex * 0.2)}
                                                        size="inherit"
                                                        isWinning={winningHand ? winningHand.cardIds.includes(card.id) : false}
                                                        className="shadow-xl text-[5px] md:text-[7px]"
                                                        style={{
                                                            transform: cardIndex === 1 ? 'rotate(8deg) translateY(4px)' : 'rotate(-4deg)',
                                                            zIndex: cardIndex
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="relative z-10 flex-grow flex items-end justify-center pb-2 min-h-0">
                                         {isEliminated && (
                                             <span className="text-sm font-bold text-red-500/50 uppercase tracking-widest -rotate-12 border-2 border-red-500/30 px-2 py-1">
                                                 BUSTED
                                             </span>
                                         )}
                                         {hasBet && !isFolded && !isEliminated && (
                                            <div className="flex flex-col items-center animate-in zoom-in duration-300">
                                                <span className="text-[0.55rem] text-[#d4af37] font-sans uppercase tracking-widest mb-0.5">Bet</span>
                                                <span className="font-mono text-xl text-white tracking-tighter leading-none">
                                                    <AnimatedCounter value={p.currentBet} prefix="$" />
                                                </span>
                                            </div>
                                         )}
                                    </div>

                                    <div className="mt-1 border-t border-white/5 pt-2 w-full">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className={`font-medium text-xs truncate max-w-[70px] ${isFolded ? 'text-[#777]' : 'text-white'}`}>
                                                {p.name}
                                            </span>
                                            <span className={`font-mono text-xs ${isEliminated ? 'text-red-800' : 'text-[#a3a3a3]'}`}>
                                                <AnimatedCounter value={p.chips} prefix="$" />
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center justify-between gap-1 h-[14px] z-2">
                                            <span className={`
                                                text-[0.6rem] tracking-wide font-medium uppercase truncate
                                                ${statusClass}
                                            `}>
                                                {statusText}
                                            </span>

                                            <div className="flex items-center gap-1 ml-auto">
                                                {!isEliminated && p.isDealer && (
                                                    <span className="text-[0.55rem] bg-white text-black font-bold px-1.5 rounded-full shadow-sm">
                                                        D
                                                    </span>
                                                )}

                                                {!isEliminated && p.position && (
                                                    <span className={`
                                                        font-mono font-bold text-[0.55rem] px-1.5 rounded
                                                        ${isThinking ? 'text-[#d4af37] bg-[#d4af37]/10' : 'text-[#555]'}
                                                    `}>
                                                        {p.position}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {isThinking && (
                                    <div className="absolute inset-0 border border-white/10 rounded-3xl pointer-events-none" />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};