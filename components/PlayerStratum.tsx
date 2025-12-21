import React, { useState, useEffect } from "react";
import { Player, WinningHand, GamePhase } from "../types";
import { PlayingCard } from "./PlayingCard";
import { ChipStack } from "./ChipStack";
import { ActionButton } from "./ActionButton";
import { Slider } from "./Slider";
import { AnimatedCounter } from "./AnimatedCounter";
import { formatChips } from "../utils";

interface PlayerStratumProps {
  player: Player;
  potSize: number;
  onAction: (action: "fold" | "call" | "raise", amount?: number) => void;
  canAct: boolean;
  toCall: number;
  gameStatus: "active" | "complete" | "won" | "busted";
  onNextHand: () => void;
  onRebuy: () => void;
  onRestart: () => void;
  winningHand: WinningHand | null;
  bigBlind: number;
  phase: GamePhase;
}

export const PlayerStratum: React.FC<PlayerStratumProps> = ({
  player,
  potSize,
  onAction,
  canAct,
  toCall,
  gameStatus,
  onNextHand,
  onRebuy,
  onRestart,
  winningHand,
  bigBlind,
  phase,
}) => {
  const [isRaising, setIsRaising] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(0);

  // --- Standard Poker Raise Logic ---

  // 1. Current "Level" to match (The high bet on the table)
  const currentHighBet = player.currentBet + toCall;

  // 2. Minimum Raise:
  // In No-Limit, min raise is usually (HighBet + PreviousRaiseDelta).
  // Without full history, a safe standard floor is (HighBet + BigBlind).
  const minRaiseTotal =
    currentHighBet > 0 ? currentHighBet + bigBlind : bigBlind;

  // 3. Max Raise (All-In)
  const maxRaiseTotal = player.chips + player.currentBet;

  // Clamp Min
  const safeMin = Math.min(minRaiseTotal, maxRaiseTotal);

  // 4. Pot Size Calculation (Standard Texas Hold'em)
  // Formula: Total Bet = 2 * HighBet + Pot - PlayerCurrentBet
  // Derivation: Call (High - Current) + [Pot + (High - Current)] = 2*High + Pot - Current
  const potRaiseTotal = 2 * currentHighBet + potSize - player.currentBet;

  // 5. Half Pot Calculation
  // Formula: HighBet + 0.5 * (Pot + CallAmount)
  // This adds half the theoretical pot on top of the call
  const theoreticalPot = potSize + (currentHighBet - player.currentBet);
  const halfPotTotal = currentHighBet + Math.floor(theoreticalPot * 0.5);

  // Clamp Pot Marker
  const safePotMarker = Math.max(
    safeMin,
    Math.min(maxRaiseTotal, potRaiseTotal)
  );

  const isWinner = winningHand?.winnerIds
    ? winningHand.winnerIds.includes(player.id)
    : winningHand?.playerId === player.id;

  useEffect(() => {
    if (!canAct) setIsRaising(false);
  }, [canAct]);

  useEffect(() => {
    if (isRaising) {
      setRaiseAmount(safeMin);
    }
  }, [isRaising, safeMin]);

  const handleConfirmRaise = () => {
    onAction("raise", raiseAmount);
    setIsRaising(false);
  };

  const handleQuickBet = (type: "min" | "1/2" | "pot" | "all") => {
    let amount = 0;

    switch (type) {
      case "min":
        amount = safeMin;
        break;
      case "1/2":
        amount = halfPotTotal;
        break;
      case "pot":
        amount = potRaiseTotal;
        break;
      case "all":
        amount = maxRaiseTotal;
        break;
    }

    if (type !== "all") {
      // Snap to BB (Standard online poker UX to avoid messy numbers)
      amount = Math.round(amount / bigBlind) * bigBlind;
    }

    amount = Math.max(safeMin, Math.min(maxRaiseTotal, amount));
    setRaiseAmount(amount);
  };

  if (!player) return null;

  const showControls = canAct || gameStatus !== "active";

  // Determine label for the bet
  let betLabel = "Current Bet";
  if (
    phase === GamePhase.PRE_FLOP &&
    player.status === "WAITING" &&
    player.currentBet > 0
  ) {
    betLabel = "Blind Posted";
  }

  const renderControls = () => {
    if (gameStatus === "complete") {
      return (
        <div className="w-full max-w-[600px] mx-auto animate-in slide-in-from-bottom-4 duration-300">
          <ActionButton
            onClick={onNextHand}
            variant="neutral"
            className="w-full"
          >
            Next Hand
          </ActionButton>
        </div>
      );
    }

    if (gameStatus === "busted") {
      return (
        <div className="w-full max-w-[600px] mx-auto animate-in slide-in-from-bottom-4 duration-300">
          <ActionButton onClick={onRebuy} variant="red" className="w-full">
            Rebuy Stack
          </ActionButton>
        </div>
      );
    }

    if (gameStatus === "won") {
      return (
        <div className="w-full max-w-[600px] mx-auto animate-in slide-in-from-bottom-4 duration-300">
          <ActionButton onClick={onRestart} variant="gold" className="w-full">
            Victory - Play Again
          </ActionButton>
        </div>
      );
    }

    return (
      <div className="relative w-full max-w-[600px] mx-auto animate-in slide-in-from-bottom-4 duration-300">
        {isRaising && (
          <div className="absolute bottom-[calc(100%+10px)] md:bottom-[calc(100%+20px)] left-0 w-full bg-black/90 backdrop-blur-xl border border-white/10 p-4 md:p-6 rounded-2xl md:rounded-[2rem] shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-200 z-30 flex flex-col gap-3 md:gap-6">
            <div className="flex justify-between items-end border-b border-white/10 pb-2 md:pb-4">
              <span className="font-sans text-[#a3a3a3] text-xs md:text-sm uppercase tracking-wide">
                Raise Amount
              </span>
              <div className="flex flex-col items-end">
                <span className="font-mono text-2xl md:text-3xl text-[#d4af37] tracking-tight leading-none">
                  ${formatChips(raiseAmount)}
                </span>
                {raiseAmount >= maxRaiseTotal && (
                  <span className="text-[0.6rem] text-[#d9534f] font-bold uppercase tracking-widest mt-1">
                    ALL-IN
                  </span>
                )}
              </div>
            </div>

            <div className="w-full px-1">
              <Slider
                min={safeMin}
                max={maxRaiseTotal}
                step={bigBlind}
                value={raiseAmount}
                onChange={setRaiseAmount}
                markerValue={safePotMarker}
              />
              <div className="flex justify-between text-[0.6rem] md:text-[0.65rem] font-mono text-[#777] mt-3">
                <span>Min: ${formatChips(safeMin)}</span>
                <span>Max: ${formatChips(maxRaiseTotal)}</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 md:gap-3">
              {["min", "1/2", "pot", "all"].map((type) => (
                <button
                  key={type}
                  onClick={() => handleQuickBet(type as any)}
                  className={`
                                        py-2 md:py-3 rounded-full text-[0.6rem] md:text-[0.7rem] font-medium uppercase tracking-wider transition-all backdrop-blur-md
                                        ${
                                          type === "all"
                                            ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                                            : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
                                        }
                                    `}
                >
                  {type === "all"
                    ? "All-In"
                    : type === "1/2"
                    ? "1/2 Pot"
                    : type}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 pointer-events-auto">
          {isRaising ? (
            <>
              <ActionButton
                onClick={() => setIsRaising(false)}
                variant="neutral"
                className="col-span-1"
              >
                Cancel
              </ActionButton>
              <ActionButton
                onClick={handleConfirmRaise}
                variant="gold"
                className="col-span-2"
              >
                Confirm Raise
              </ActionButton>
            </>
          ) : (
            <>
              <ActionButton onClick={() => onAction("fold")} variant="red">
                Fold
              </ActionButton>

              <ActionButton onClick={() => onAction("call")} variant="green">
                {toCall > 0 ? (
                  "CALL"
                ) : (
                  "CHECK"
                )}
              </ActionButton>

              <ActionButton onClick={() => setIsRaising(true)} variant="gold">
                Raise
              </ActionButton>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <section
      className={`
            relative w-full h-[34svh] shrink-0 bg-black/20 backdrop-blur-2xl border-t border-white/5
            transition-all duration-500 z-20
            ${
              canAct && gameStatus === "active"
                ? "shadow-[0_-5px_30px_rgba(255,255,255,0.05)] bg-black/30"
                : ""
            }
            ${
              isWinner
                ? "bg-[#d4af37]/10 border-[#d4af37] shadow-[0_-5px_30px_rgba(212,175,55,0.15)]"
                : ""
            }
        `}
    >
      <div className="absolute inset-0 z-0 pointer-events-auto">
        <ChipStack amount={player.chips} />
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
      </div>

      {/* --- Player & Bet Info --- */}
      <div className="absolute top-0 left-0 w-full z-20 px-4 pt-3 md:pt-4 flex justify-between items-start pointer-events-none">
        <div className="w-full max-w-[900px] mx-auto flex justify-between items-start">
          {/* Left: Identity & Stack */}
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-2">
              <span className="font-sans font-bold text-sm md:text-base tracking-wider text-white/90 uppercase shadow-black drop-shadow-md">
                {player.name}
              </span>
              {player.isDealer && (
                <span className="text-[0.6rem] bg-white text-black px-1.5 py-0.5 rounded-full font-bold shadow-sm">
                  D
                </span>
              )}
              {player.position && (
                <span className="text-[0.6rem] text-[#d4af37] border border-[#d4af37]/30 bg-[#d4af37]/10 px-1.5 py-0.5 rounded font-mono shadow-sm">
                  {player.position}
                </span>
              )}
            </div>
            {/* Stack: Primary Animated */}
            <div className="font-mono text-lg md:text-2xl text-white/80 tracking-tighter drop-shadow-lg">
              <AnimatedCounter value={player.chips} prefix="$" />
            </div>
          </div>

          {/* Right: Current Bet if any */}
          {player.currentBet > 0 && (
            <div className="flex flex-col items-end animate-in fade-in slide-in-from-right-4 duration-300">
              <span className="text-[0.6rem] text-[#d4af37] uppercase tracking-widest mb-0.5 font-bold shadow-black drop-shadow-sm">
                {betLabel}
              </span>
              {/* Bet: Animated */}
              <span className="font-mono text-3xl md:text-5xl text-white tracking-tight leading-none drop-shadow-md">
                <AnimatedCounter value={player.currentBet} prefix="$" />
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Cards: Positioned cleanly in the remaining space */}
      <div
        className={`
                absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 
                flex gap-2 pointer-events-none
                transition-all duration-300
                ${
                  !player.isActive && gameStatus === "active"
                    ? "opacity-30 grayscale scale-95 z-0"
                    : canAct || winningHand
                    ? "z-30 scale-100"
                    : "z-10 scale-100"
                }
                group hover:z-30
            `}
      >
        {player.hand.map((card, idx) => (
          <PlayingCard
            key={card.id}
            card={card}
            delay={0.6 + idx * 0.1}
            isWinning={
              winningHand ? winningHand.cardIds.includes(card.id) : false
            }
            size="inherit"
            // ADJUST CARD SIZE HERE: mobile -> text-[11px] (110px width), desktop -> md:text-[15px] (150px width)
            className="shadow-2xl pointer-events-auto text-[7px] md:text-[14px]"
            style={{
              transform:
                idx === 0
                  ? "rotate(-3deg) translateY(0.5em)"
                  : "rotate(3deg) translateY(0.5em) translateX(-2em)",
            }}
          />
        ))}
      </div>

      {/* Controls Area (Bottom) */}
      {showControls && (
        <div
          className="absolute bottom-0 left-0 w-full z-40 px-5 pb-4 md:pb-6 pt-6 bg-gradient-to-t from-black/40 to-transparent"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {renderControls()}
        </div>
      )}
    </section>
  );
};
