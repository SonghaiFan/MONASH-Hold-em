import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AIStratum } from './AIStratum';
import { TableStratum } from './TableStratum';
import { PlayerStratum } from './PlayerStratum';
import { generateDeck, initializeGame } from '../constants';
import { GamePhase, GameState, PlayerAction, GameConfig } from '../types';
import { getAIDecision } from '../services/pokerAi';
import { determineWinner } from '../services/pokerEvaluator';
import { resolvePots } from '../services/potManager';
import { ActionButton } from './ActionButton';

interface PokerGameProps {
    config: GameConfig;
    onExit: () => void;
}

export const PokerGame: React.FC<PokerGameProps> = ({ config, onExit }) => {
    // Centralized Game State
    const [gameState, setGameState] = useState<GameState>(() => initializeGame(config));

    // Transient state to show AI decision immediately before the delay/action execution
    const [aiIntent, setAiIntent] = useState<{ playerId: string; action: string; amount?: number } | null>(null);

    // Ready State
    const [hasStarted, setHasStarted] = useState(false);

    // Ref to prevent multiple AI calls for the same turn
    const aiProcessingRef = useRef(false);

    // --- LOGIC HELPERS ---

    // Calculate the highest bet currently on the table for this street
    const getCurrentHighBet = useCallback(() => {
        return Math.max(...gameState.players.map(p => p.currentBet));
    }, [gameState.players]);

    const getAmountToCall = useCallback((playerId: string) => {
        const player = gameState.players.find(p => p.id === playerId);
        if (!player) return 0;
        const highBet = getCurrentHighBet();
        return highBet - player.currentBet;
    }, [gameState.players, getCurrentHighBet]);

    // Helper to determine position label based on offset from dealer
    const getPositionLabel = (indexFromDealer: number, playerCount: number): string => {
        if (playerCount === 2) {
            // Heads Up: Dealer is SB, other is BB
            return indexFromDealer === 0 ? 'SB' : 'BB';
        }

        if (indexFromDealer === 0) return 'BTN';
        if (indexFromDealer === 1) return 'SB';
        if (indexFromDealer === 2) return 'BB';

        // Positions going backwards from Dealer
        const distFromButton = playerCount - indexFromDealer;
        if (distFromButton === 1) return 'CO'; // Cutoff is always before Button
        if (distFromButton === 2 && playerCount >= 5) return 'HJ'; // Hijack is before Cutoff (if enough players)

        // Positions going forwards from BB
        const distFromBB = indexFromDealer - 2;
        if (distFromBB === 1) return 'UTG';
        return `UTG+${distFromBB - 1}`;
    };

    // --- GAME LOOP ACTIONS ---

    // Initialize/Reset Hand
    const startNewHand = useCallback(() => {
        setAiIntent(null);
        setGameState(prevState => {
            const newDeck = generateDeck();

            // 1. Identify Valid Players (Chips > 0)
            // originalIndex is preserved to map back to the main players array
            const activePlayerIndices = prevState.players
                .map((p, index) => ({ ...p, originalIndex: index }))
                .filter(p => p.chips > 0)
                .map(p => p.originalIndex);

            // Check Game Over (Winner)
            const humanIndex = prevState.players.findIndex(p => p.isHuman);
            if (activePlayerIndices.length === 1 && activePlayerIndices[0] === humanIndex) {
                return prevState;
            }

            // 2. Rotate Dealer *among active players*
            let currentActiveDealerIndex = activePlayerIndices.findIndex(idx => idx === prevState.dealerIndex);

            if (currentActiveDealerIndex === -1) {
                // Previous dealer busted, find next available
                const nextValid = activePlayerIndices.find(idx => idx > prevState.dealerIndex);
                const nextValidIndex = nextValid !== undefined ? activePlayerIndices.indexOf(nextValid) : 0;
                currentActiveDealerIndex = nextValidIndex;
            } else {
                currentActiveDealerIndex = (currentActiveDealerIndex + 1) % activePlayerIndices.length;
            }

            const newDealerRealIndex = activePlayerIndices[currentActiveDealerIndex];
            const activeCount = activePlayerIndices.length;

            // 3. Assign Roles & Positions
            const updatedPlayers = prevState.players.map((p, i) => {
                const isEliminated = p.chips <= 0;

                if (isEliminated) {
                    return {
                        ...p,
                        hand: [],
                        isActive: false,
                        status: 'ELIMINATED' as PlayerAction,
                        position: '',
                        isDealer: false,
                        currentBet: 0
                    };
                }

                // Determine position in the active ring relative to dealer
                const activeIdx = activePlayerIndices.indexOf(i);

                // Calculate clockwise distance from dealer (0 = Dealer, 1 = Left of Dealer, etc)
                const offsetFromDealer = (activeIdx - currentActiveDealerIndex + activeCount) % activeCount;

                const positionLabel = getPositionLabel(offsetFromDealer, activeCount);
                const isDealer = (offsetFromDealer === 0);

                const hand = [newDeck.pop()!, newDeck.pop()!];

                return {
                    ...p,
                    hand,
                    isActive: true,
                    status: 'WAITING' as PlayerAction,
                    position: positionLabel,
                    isDealer: isDealer,
                    currentBet: 0,
                    reasoningHistory: []
                };
            });

            // 4. Post Blinds
            // Find SB and BB indices based on relative offset
            const sbOffset = activeCount === 2 ? 0 : 1; // HU: Dealer is SB
            const bbOffset = activeCount === 2 ? 1 : 2; // HU: Non-Dealer is BB

            const sbRealIndex = activePlayerIndices[(currentActiveDealerIndex + sbOffset) % activeCount];
            const bbRealIndex = activePlayerIndices[(currentActiveDealerIndex + bbOffset) % activeCount];

            const sbPlayer = updatedPlayers[sbRealIndex];
            const sbVal = Math.floor(config.blindBig / 2);
            const sbAmount = Math.min(sbVal, sbPlayer.chips);
            sbPlayer.chips -= sbAmount;
            sbPlayer.currentBet = sbAmount;
            if (sbPlayer.chips === 0) sbPlayer.status = 'ALL-IN';

            const bbPlayer = updatedPlayers[bbRealIndex];
            const bbAmount = Math.min(config.blindBig, bbPlayer.chips);
            bbPlayer.chips -= bbAmount;
            bbPlayer.currentBet = bbAmount;
            if (bbPlayer.chips === 0) bbPlayer.status = 'ALL-IN';

            const pot = sbAmount + bbAmount;

            const initialBoard = [
                newDeck.pop()!, newDeck.pop()!, newDeck.pop()!,
                newDeck.pop()!,
                newDeck.pop()!
            ];

            // 5. Determine First Actor
            const firstActorOffset = (bbOffset + 1) % activeCount;
            const firstActorIndex = activePlayerIndices[(currentActiveDealerIndex + firstActorOffset) % activeCount];
            const activePlayerId = updatedPlayers[firstActorIndex].id;

            // --- History Init ---
            const history = [`--- NEW HAND (Dealer: ${updatedPlayers[newDealerRealIndex].name}) ---`];
            // history.push(`${sbPlayer.name} posts SB $${sbAmount}`);
            // history.push(`${bbPlayer.name} posts BB $${bbAmount}`);

            return {
                ...prevState,
                deck: newDeck,
                board: initialBoard,
                phase: GamePhase.PRE_FLOP,
                pot,
                pots: [], // Reset pots
                players: updatedPlayers,
                dealerIndex: newDealerRealIndex,
                activePlayerId,
                minRaise: config.blindBig,
                winningHand: null,
                isRunningOut: false,
                handHistory: history
            };
        });
    }, [config]);

    // Handle Start
    const handleStartGame = () => {
        setHasStarted(true);
        startNewHand();
    };

    // Handle Rebuy
    const handleRebuy = useCallback(() => {
        setGameState(prev => ({
            ...prev,
            players: prev.players.map(p =>
                p.isHuman ? { ...p, chips: config.startingStackHuman, status: 'WAITING' as PlayerAction, isDealer: false } : p
            )
        }));
        setTimeout(() => startNewHand(), 100);
    }, [startNewHand, config.startingStackHuman]);

    // Handle Restart (Victory)
    const handleRestartGame = useCallback(() => {
        setGameState(initializeGame(config));
        setTimeout(() => startNewHand(), 100);
    }, [startNewHand, config]);


    // --- GAME EFFECTS for SUSPENSE (Runout & Showdown) ---

    // 1. ALL-IN RUNOUT EFFECT
    useEffect(() => {
        if (gameState.isRunningOut) {
            const timer = setTimeout(() => {
                setGameState(prev => {
                    let nextPhase = prev.phase;
                    let stopRunout = false;

                    if (prev.phase === GamePhase.PRE_FLOP) nextPhase = GamePhase.FLOP;
                    else if (prev.phase === GamePhase.FLOP) nextPhase = GamePhase.TURN;
                    else if (prev.phase === GamePhase.TURN) nextPhase = GamePhase.RIVER;
                    else if (prev.phase === GamePhase.RIVER) {
                        nextPhase = GamePhase.SHOWDOWN;
                        stopRunout = true;
                    }

                    return {
                        ...prev,
                        phase: nextPhase,
                        isRunningOut: !stopRunout
                    };
                });
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [gameState.isRunningOut, gameState.phase]);

    // 2. SHOWDOWN CALCULATION EFFECT
    useEffect(() => {
        if (gameState.phase === GamePhase.SHOWDOWN && !gameState.winningHand) {

            const result = determineWinner(gameState.players, gameState.board, gameState.pots);

            const payoutFn = (prev: GameState) => {
                const players = [...prev.players];

                result.payouts.forEach(payout => {
                    const winnerPlayer = players.find(p => p.id === payout.playerId);
                    if (winnerPlayer) {
                        winnerPlayer.chips += payout.amount;
                    }
                });

                let focalId = result.primaryWinnerId;
                const isHumanWinner = result.primaryWinnerId === prev.players.find(p => p.isHuman)?.id;

                if (isHumanWinner && result.payouts.length > 0) {
                    const runnerUp = players.find(p => !p.isHuman && p.isActive && p.id !== result.primaryWinnerId);
                    if (runnerUp) focalId = runnerUp.id;
                }

                let desc = result.primaryHand.name;

                if (result.isSplit) {
                    desc = `Split Pot (${result.primaryHand.name})`;
                }

                return {
                    ...prev,
                    players,
                    pot: 0,
                    winningHand: {
                        playerId: result.primaryWinnerId,
                        cardIds: result.primaryHand.winningCardIds,
                        description: desc,
                        focalPlayerId: focalId
                    }
                };
            };

            const activePlayers = gameState.players.filter(p => p.status !== 'FOLDED' && p.status !== 'ELIMINATED');
            const playerCount = activePlayers.length;
            const totalRevealTime = (playerCount * 1500) + 1000;

            const timer = setTimeout(() => {
                setGameState(p => payoutFn(p));
            }, totalRevealTime);

            return () => clearTimeout(timer);
        }
    }, [gameState.phase, gameState.winningHand, gameState.players, gameState.board, gameState.pots]);


    // Handle Player Action (Human or AI)
    const handlePlayerAction = useCallback((playerId: string, action: 'fold' | 'call' | 'raise', amount?: number, reasoning?: string) => {
        setAiIntent(null);

        setGameState(prev => {
            const players = [...prev.players];
            const playerIndex = players.findIndex(p => p.id === playerId);

            if (playerIndex === -1) return prev;

            // Clone the player object to avoid mutating previous state (fixes duplicate reasoning in StrictMode)
            const player = { ...players[playerIndex] };
            players[playerIndex] = player;

            // Update Reasoning History if provided
            if (reasoning) {
                const history = player.reasoningHistory || [];
                const newEntry = `[${prev.phase}] ${reasoning}`;

                // Check for duplicate to prevent spam (compare with last entry)
                const lastEntry = history.length > 0 ? history[history.length - 1] : null;

                if (lastEntry !== newEntry) {
                    const newHistory = [...history, newEntry].slice(-10);
                    player.reasoningHistory = newHistory;
                }
            }

            let newPotDisplay = prev.pot;
            const currentHighBet = Math.max(...players.map(p => p.currentBet));
            const toCall = currentHighBet - player.currentBet;

            // --- Log Building ---
            let logEntry = `${prev.phase}: ${player.name} (${player.position}) `;

            // Helper to count raises in current phase
            const countRaisesInPhase = (history: string[], currentPhase: string) => {
                let raises = 0;
                for (let i = history.length - 1; i >= 0; i--) {
                    if (history[i].includes(`--- ${currentPhase} ---`)) break;
                    if (history[i].includes('RAISES') || history[i].includes('-BETS')) {
                        raises++;
                    }
                }
                return raises;
            };

            // --- 1. EXECUTE ACTION ---
            if (action === 'fold') {
                player.status = 'FOLDED';
                player.isActive = false;
                logEntry += `FOLDS`;
            }
            else if (action === 'call') {
                const actualCallAmount = Math.min(toCall, player.chips);

                player.chips -= actualCallAmount;
                player.currentBet += actualCallAmount;
                newPotDisplay += actualCallAmount;

                if (player.chips === 0) {
                    player.status = 'ALL-IN';
                    logEntry += `CALLS ALL-IN $${actualCallAmount}`;
                } else if (actualCallAmount === 0 && toCall === 0) {
                    player.status = 'CHECKED';
                    logEntry += `CHECKS`;
                } else {
                    player.status = 'CALLED';
                    logEntry += `CALLS $${actualCallAmount}`;
                }
            }
            else if (action === 'raise') {
                let totalBetAmount = amount || (currentHighBet + prev.minRaise);

                const maxTotalBet = player.chips + player.currentBet;
                if (totalBetAmount >= maxTotalBet) {
                    totalBetAmount = maxTotalBet;
                }

                if (totalBetAmount < currentHighBet + prev.minRaise && totalBetAmount < maxTotalBet) {
                    totalBetAmount = currentHighBet + prev.minRaise;
                }

                const addedChips = totalBetAmount - player.currentBet;
                player.chips -= addedChips;
                player.currentBet = totalBetAmount;
                newPotDisplay += addedChips;

                const raiseCount = countRaisesInPhase(prev.handHistory, prev.phase);
                let raiseLabel = "RAISES";
                if (raiseCount === 1) raiseLabel = "3-BETS";
                else if (raiseCount === 2) raiseLabel = "4-BETS";
                else if (raiseCount >= 3) raiseLabel = `${raiseCount + 2}-BETS`;

                if (player.chips === 0) {
                    player.status = 'ALL-IN';
                    logEntry += `${raiseLabel} ALL-IN to $${totalBetAmount}`;
                } else {
                    player.status = 'RAISED';
                    logEntry += `${raiseLabel} to $${totalBetAmount}`;
                }
            }

            const updatedHistory = [...prev.handHistory, logEntry];

            // --- 2. CHECK FOR WINNER (Folded out) ---
            const activePlayers = players.filter(p => p.status !== 'FOLDED' && p.status !== 'ELIMINATED');
            if (activePlayers.length === 1) {
                const winnerId = activePlayers[0].id;
                const focalId = activePlayers[0].isHuman ? null : winnerId;

                // Reset bets for all players AND award pot to winner (Immutable update)
                const playersReset = players.map(p => {
                    const isWinner = p.id === winnerId;
                    return {
                        ...p,
                        currentBet: 0,
                        chips: isWinner ? p.chips + newPotDisplay : p.chips
                    };
                });

                return {
                    ...prev,
                    players: playersReset,
                    pot: 0,
                    pots: [],
                    activePlayerId: null,
                    winningHand: {
                        playerId: winnerId,
                        cardIds: [],
                        description: 'Opponents Folded',
                        focalPlayerId: focalId || undefined
                    },
                    handHistory: updatedHistory
                };
            }            // --- 3. CHECK ROUND COMPLETION & AUTO-RUNOUT ---
            const nextHighBet = Math.max(...players.map(p => p.currentBet));

            const isRoundComplete = activePlayers.every(p => {
                if (p.status === 'FOLDED' || p.status === 'ALL-IN' || p.status === 'ELIMINATED') return true;
                if (p.status === 'WAITING' || p.status === 'THINKING') return false;
                return p.currentBet === nextHighBet;
            });

            const playersWithChips = activePlayers.filter(p => p.status !== 'ALL-IN' && p.chips > 0);
            const isAllInScenario = playersWithChips.length <= 1 && activePlayers.length >= 2;

            if (isRoundComplete) {
                const resolvedPots = resolvePots(players, prev.pots);

                const nextPhase =
                    prev.phase === GamePhase.PRE_FLOP ? GamePhase.FLOP :
                        prev.phase === GamePhase.FLOP ? GamePhase.TURN :
                            prev.phase === GamePhase.TURN ? GamePhase.RIVER : GamePhase.SHOWDOWN;

                let startRunout = false;
                if (isAllInScenario && nextPhase !== GamePhase.SHOWDOWN) {
                    startRunout = true;
                }

                // Reset bets
                const playersReset = players.map(p => ({
                    ...p,
                    currentBet: 0,
                    status: (p.status === 'FOLDED' || p.status === 'ALL-IN' || p.status === 'ELIMINATED') ? p.status : 'WAITING' as PlayerAction
                }));

                // Determine first actor
                let firstActorIndex = (prev.dealerIndex + 1) % players.length;
                let loops = 0;
                while (
                    (playersReset[firstActorIndex].status === 'FOLDED' || playersReset[firstActorIndex].status === 'ALL-IN' || playersReset[firstActorIndex].status === 'ELIMINATED')
                    && loops < players.length
                ) {
                    firstActorIndex = (firstActorIndex + 1) % players.length;
                    loops++;
                }

                const nextActiveId = (nextPhase === GamePhase.SHOWDOWN || startRunout) ? null : playersReset[firstActorIndex].id;

                // Add Phase change to Log
                if (nextPhase !== GamePhase.SHOWDOWN) {
                    updatedHistory.push(`--- ${nextPhase} ---`);
                }

                return {
                    ...prev,
                    players: playersReset,
                    pot: newPotDisplay,
                    pots: resolvedPots,
                    phase: nextPhase,
                    activePlayerId: nextActiveId,
                    isRunningOut: startRunout,
                    handHistory: updatedHistory
                };
            }

            // --- 4. NEXT TURN (Same Street) ---
            let nextIndex = (playerIndex + 1) % players.length;
            let loops = 0;
            while (
                (players[nextIndex].status === 'FOLDED' || players[nextIndex].status === 'ALL-IN' || players[nextIndex].status === 'ELIMINATED')
                && loops < players.length
            ) {
                nextIndex = (nextIndex + 1) % players.length;
                loops++;
            }

            return {
                ...prev,
                players,
                pot: newPotDisplay,
                activePlayerId: players[nextIndex].id,
                handHistory: updatedHistory
            };
        });
    }, []);

    // AI Turn Logic
    useEffect(() => {
        if (!gameState.activePlayerId || gameState.isRunningOut) return;
        const activePlayer = gameState.players.find(p => p.id === gameState.activePlayerId);

        if (activePlayer?.isHuman) {
            aiProcessingRef.current = false;
        }

        if (activePlayer && !activePlayer.isHuman && activePlayer.isActive && activePlayer.status !== 'ALL-IN' && activePlayer.status !== 'ELIMINATED') {
            if (aiProcessingRef.current) return;
            aiProcessingRef.current = true;

            const makeAIMove = async () => {
                const highBet = Math.max(...gameState.players.map(p => p.currentBet));
                const toCall = highBet - activePlayer.currentBet;

                const decision = await getAIDecision(
                    activePlayer,
                    gameState.players,
                    gameState.board,
                    gameState.pot,
                    gameState.phase,
                    highBet,
                    config.blindBig,
                    gameState.handHistory,
                    activePlayer.reasoningHistory
                );

                console.group(`🤖 AI Decision: ${activePlayer.name}`);
                if (decision.reasoning) {
                    console.log(`%cReasoning: ${decision.reasoning}`, 'color: #d4af37; font-weight: bold;');
                }
                console.log(`Action: ${decision.action.toUpperCase()} ${decision.amount ? `($${decision.amount})` : ''}`);
                console.groupEnd();

                // Logic to visually distinguish Check vs Call in intent UI
                let visualAction: string = decision.action;
                if (decision.action === 'call' && toCall === 0) {
                    visualAction = 'check';
                }

                setAiIntent({
                    playerId: activePlayer.id,
                    action: visualAction,
                    amount: decision.amount
                });

                setTimeout(() => {
                    handlePlayerAction(activePlayer.id, decision.action, decision.amount, decision.reasoning);
                    aiProcessingRef.current = false;
                }, 1000);
            };

            makeAIMove();
        }
    }, [gameState.activePlayerId, gameState.players, gameState.phase, gameState.pot, gameState.board, handlePlayerAction, gameState.isRunningOut, config.blindBig, gameState.handHistory]);

    // Derived State
    const humanPlayer = gameState.players.find(p => p.isHuman);
    const aiPlayers = gameState.players.filter(p => !p.isHuman);

    const isHumanTurn = gameState.activePlayerId === humanPlayer?.id;
    const humanToCall = humanPlayer ? getAmountToCall(humanPlayer.id) : 0;
    const humanHasFolded = humanPlayer?.status === 'FOLDED' || !humanPlayer?.isActive;

    const isHandComplete = gameState.activePlayerId === null && !gameState.isRunningOut && gameState.winningHand !== null;
    const isHumanBusted = humanPlayer && humanPlayer.chips <= 0 && isHandComplete;

    const activeAiCount = aiPlayers.filter(p => p.chips > 0).length;
    const isTournamentWon = activeAiCount === 0 && (humanPlayer && humanPlayer.chips > 0) && isHandComplete;

    let gameStatus: 'active' | 'complete' | 'won' | 'busted' = 'active';
    if (isHandComplete) {
        if (isTournamentWon) gameStatus = 'won';
        else if (isHumanBusted) gameStatus = 'busted';
        else gameStatus = 'complete';
    }

    if (!humanPlayer) return <div>Loading System...</div>;

    return (
        <div className="flex flex-col h-full w-full z-10 overflow-hidden relative">
            <button
                onClick={onExit}
                className="absolute top-4 left-4 z-50 p-2 rounded-full bg-black/40 text-white/30 hover:text-white hover:bg-white/10 transition-all backdrop-blur-md"
                title="Exit Game"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>

            {/* READY OVERLAY */}
            {!hasStarted && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-500">
                    <div className="flex flex-col items-center gap-4 md:gap-6 p-4 md:p-8 relative">
                        <div className="absolute inset-0 bg-[#d4af37]/5 blur-3xl rounded-full" />
                        <div className="text-base md:text-2xl font-light tracking-widest text-white font-sans uppercase relative z-10 text-center">
                            Table Initialized
                        </div>
                        <ActionButton
                            onClick={handleStartGame}
                            variant="gold"
                            className="px-8 py-4 md:px-12 md:py-6 text-xs md:text-lg tracking-[0.2em] md:tracking-[0.3em] relative z-10 shadow-[0_0_30px_rgba(212,175,55,0.2)] md:shadow-[0_0_50px_rgba(212,175,55,0.3)] hover:shadow-[0_0_70px_rgba(212,175,55,0.5)]"
                        >
                            I'M READY
                        </ActionButton>
                    </div>
                </div>
            )}

            {/* AI Stratum: Flies in from TOP */}
            <div className="w-full shrink-0 animate-slide-in-top z-30">
                <AIStratum
                    players={aiPlayers}
                    activePlayerId={gameState.activePlayerId}
                    phase={gameState.phase}
                    humanHasFolded={humanHasFolded}
                    winningHand={gameState.winningHand}
                    aiIntent={aiIntent}
                />
            </div>

            {/* Table Stratum: Zooms/Fades in with Delay */}
            <div className="w-full grow flex flex-col justify-center animate-zoom-fade-in z-10" style={{ animationDelay: '0.3s' }}>
                <TableStratum
                    pot={gameState.pot}
                    board={gameState.board}
                    phase={gameState.phase}
                    winningHand={gameState.winningHand}
                />
            </div>

            {/* Player Stratum: Flies in from BOTTOM */}
            <div className="w-full shrink-0 animate-slide-in-bottom z-30">
                <PlayerStratum
                    player={humanPlayer}
                    potSize={gameState.pot}
                    onAction={(a, amt) => handlePlayerAction(humanPlayer.id, a, amt)}
                    canAct={isHumanTurn}
                    toCall={humanToCall}
                    gameStatus={gameStatus}
                    onNextHand={startNewHand}
                    onRebuy={handleRebuy}
                    onRestart={handleRestartGame}
                    winningHand={gameState.winningHand}
                    bigBlind={config.blindBig}
                    phase={gameState.phase}
                />
            </div>
        </div>
    );
};