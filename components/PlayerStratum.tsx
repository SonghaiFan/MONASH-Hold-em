import React, { useState, useEffect, useRef } from "react";
import { Card, Player, WinningHand, GamePhase } from "../types";
import { PlayingCard } from "./PlayingCard";
import { Slider } from "./Slider";
import { AnimatedCounter } from "./AnimatedCounter";
import { useLanguage } from "../services/i18n";
import { describeHand } from "../services/pokerEvaluator";
import { Avatar } from "./Avatar";

interface PlayerStratumProps {
  player: Player;
  potSize: number;
  board: Card[];
  onAction: (action: "fold" | "call" | "raise", amount?: number) => void;
  canAct: boolean;
  toCall: number;
  gameStatus: "active" | "complete" | "won" | "busted";
  onNextHand: () => void;
  onSkipHand: () => void;
  skipping?: boolean;
  onRebuy: () => void;
  canRebuy?: boolean;
  onRestart: () => void;
  winningHand: WinningHand | null;
  bigBlind: number;
  phase: GamePhase;
}

// Buttons carry numbers; past five digits they go short so the row still fits a phone.
const short = (n: number) =>
  n >= 10000 ? `${+(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString();

const ArrowUp = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

// How far the cards must travel up before letting go folds them.
const FOLD_DISTANCE = 90;

// Nothing on screen says the cards can be swiped, so the first time you face a
// bet they say it once. Remembered per browser; without storage, per visit.
const SWIPE_HINT_KEY = "franks-holdem:swipe-hint-seen";
const swipeHintSeen = () => {
  try {
    return localStorage.getItem(SWIPE_HINT_KEY) === "1";
  } catch {
    return false;
  }
};
const markSwipeHintSeen = () => {
  try {
    localStorage.setItem(SWIPE_HINT_KEY, "1");
  } catch {
    // the in-memory flag still keeps it from coming back this visit
  }
};

// The outline a card leaves behind: its shape and glyphs, barely there.
const GhostCard: React.FC<{ card: Card }> = ({ card }) => (
  <div className="w-[10em] h-[14em] text-[10cqw] rounded-[1.8em] border border-white/15 bg-black flex flex-col justify-between px-[1.3em] pt-[1em] pb-[1.3em] text-white/15">
    <span className="text-[4.4em] leading-none tracking-tight">{card.rank}</span>
    <span className="text-[3.4em] leading-none">{card.suit}</span>
  </div>
);

const Cross = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

// One pill for every action: filled when it is yours to press, an outline when it is not.
const Pill: React.FC<{
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  label?: string;
}> = ({ onClick, disabled, className = "", children, label }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className={`
      h-[52px] rounded-full flex items-center justify-center whitespace-nowrap
      text-[16px] tabular-nums transition-all duration-200
      ${disabled
        ? "border border-white/15 text-white/35 cursor-default"
        : "bg-[#1c1c1e] text-white hover:bg-[#2a2a2d] active:scale-[0.97] cursor-pointer"}
      ${className}
    `}
  >
    {children}
  </button>
);

export const PlayerStratum: React.FC<PlayerStratumProps> = ({
  player,
  potSize,
  board,
  onAction,
  canAct,
  toCall,
  gameStatus,
  onNextHand,
  onSkipHand,
  skipping = false,
  onRebuy,
  canRebuy = true,
  onRestart,
  winningHand,
  bigBlind,
  phase,
}) => {
  const { t, translateHand } = useLanguage();
  const [isRaising, setIsRaising] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(0);

  // Swipe the cards up to fold
  // Where the finger went down lives in a ref, so a fast flick never reads a stale start
  const dragStart = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [flung, setFlung] = useState(false);

  // --- Standard No-Limit raise sizing ---
  const currentHighBet = player.currentBet + toCall;
  const minRaiseTotal = currentHighBet > 0 ? currentHighBet + bigBlind : bigBlind;
  const maxRaiseTotal = player.chips + player.currentBet; // all-in
  const safeMin = Math.min(minRaiseTotal, maxRaiseTotal);
  // Pot-sized raise: call, then raise by the pot as it would stand after the call
  const potRaiseTotal = 2 * currentHighBet + potSize - player.currentBet;
  const theoreticalPot = potSize + (currentHighBet - player.currentBet);
  const halfPotTotal = currentHighBet + Math.floor(theoreticalPot * 0.5);
  const safePotMarker = Math.max(safeMin, Math.min(maxRaiseTotal, potRaiseTotal));

  const canRaise = maxRaiseTotal > currentHighBet;
  const callAmount = Math.min(toCall, player.chips);
  const callIsAllIn = toCall > 0 && callAmount >= player.chips;

  useEffect(() => {
    if (!canAct) setIsRaising(false);
  }, [canAct]);

  useEffect(() => {
    if (isRaising) setRaiseAmount(safeMin);
  }, [isRaising, safeMin]);

  const confirmRaise = () => {
    onAction("raise", raiseAmount);
    setIsRaising(false);
  };

  const quickBet = (type: "1/2" | "pot" | "all") => {
    let amount = type === "1/2" ? halfPotTotal : type === "pot" ? potRaiseTotal : maxRaiseTotal;
    // Snap to the big blind, as online rooms do, so the numbers stay round
    if (type !== "all") amount = Math.round(amount / bigBlind) * bigBlind;
    setRaiseAmount(Math.max(safeMin, Math.min(maxRaiseTotal, amount)));
  };

  if (!player) return null;

  const decided = !!winningHand && winningHand.cardIds.length > 0;
  const visibleBoard = board.slice(
    0,
    phase === GamePhase.PRE_FLOP ? 0 : phase === GamePhase.FLOP ? 3 : phase === GamePhase.TURN ? 4 : 5
  );
  const handName = player.hand.length === 2 ? translateHand(describeHand([...player.hand, ...visibleBoard])) : "";
  const isOut = !player.isActive && gameStatus === "active";
  const canFold = canAct && gameStatus === "active" && player.isActive && !flung;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canFold) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // keep the drag when the finger leaves the cards
    } catch {
      // a pointer that cannot be captured still drags while it stays over them
    }
    dragStart.current = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    setDrag({ dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragStart.current;
    if (!start) return;
    const dy = e.clientY - start.y;
    // Free upward, stiff downward: the gesture only goes one way
    start.dx = (e.clientX - start.x) * 0.4;
    start.dy = dy < 0 ? dy : dy * 0.15;
    setDrag({ dx: start.dx, dy: start.dy });
  };
  const onPointerUp = () => {
    const start = dragStart.current;
    if (!start) return;
    dragStart.current = null;
    if (start.dy < -FOLD_DISTANCE) {
      setFlung(true);
      setTimeout(() => {
        onAction("fold");
        setFlung(false);
        setDrag(null);
      }, 220);
    } else {
      setDrag(null);
    }
  };
  const lift = drag ? Math.min(1, -drag.dy / 250) : 0;

  // The hint shows for one decision: gone for good once you drag, or once that turn is over
  const [hintDone, setHintDone] = useState(swipeHintSeen);
  const showHint = !hintDone && canFold && toCall > 0 && !drag;
  const hintShown = useRef(false);
  useEffect(() => {
    if (showHint) hintShown.current = true;
    else if (hintShown.current && !hintDone) {
      markSwipeHintSeen();
      setHintDone(true);
    }
  }, [showHint, hintDone]);

  // --- The line above the buttons: your chips in, or the raise sizer ---
  const renderSizer = () => {
    if (isRaising) {
      return (
        <div className="flex items-center gap-4 w-full">
          <span className="flex items-center gap-1 min-w-16 text-[17px] text-white tabular-nums">
            <ArrowUp className="w-4 h-4" />
            {raiseAmount >= maxRaiseTotal ? t.game.allIn : short(raiseAmount)}
          </span>
          <Slider
            min={safeMin}
            max={maxRaiseTotal}
            step={bigBlind}
            value={raiseAmount}
            onChange={setRaiseAmount}
            markerValue={safePotMarker}
            className="flex-1"
          />
          <button
            type="button"
            onClick={confirmRaise}
            aria-label={t.game.confirmRaise}
            className="w-12 h-12 shrink-0 rounded-full bg-white text-black flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
          >
            <ArrowUp />
          </button>
        </div>
      );
    }
    if (player.currentBet > 0) {
      return (
        <span className="min-w-8 h-8 px-2.5 rounded-full bg-[#1c1c1e] text-[#f5e35b] text-[14px] tabular-nums flex items-center justify-center">
          {player.currentBet.toLocaleString()}
        </span>
      );
    }
    return null;
  };

  const renderButtons = () => {
    if (gameStatus === "complete") {
      return <Pill onClick={onNextHand} className="w-full">{t.game.nextHand}</Pill>;
    }
    if (gameStatus === "busted") {
      return canRebuy ? (
        <Pill onClick={onRebuy} className="w-full">{t.game.rebuyStack}</Pill>
      ) : (
        <Pill disabled className="w-full">{t.game.brokeLeave}</Pill>
      );
    }
    if (gameStatus === "won") {
      return <Pill onClick={onRestart} className="w-full">{t.game.victoryPlayAgain}</Pill>;
    }
    // Folded: nothing left to do here but hurry the hand along
    if (isOut) {
      return (
        <Pill onClick={onSkipHand} disabled={skipping} className="w-full">
          {t.game.skipHand}
        </Pill>
      );
    }
    // Cards are being turned over and the pot is not yet awarded: the next hand is coming, not here
    if (phase === GamePhase.SHOWDOWN) {
      return <Pill disabled className="w-full">{t.game.nextHand}</Pill>;
    }

    if (isRaising) {
      return (
        <div className="flex gap-2.5">
          <Pill onClick={() => quickBet("1/2")} className="flex-1">{t.game.quickHalfPot}</Pill>
          <Pill onClick={() => quickBet("pot")} className="flex-1">{t.game.quickPot}</Pill>
          <Pill onClick={() => quickBet("all")} className="flex-1">{t.game.quickAllIn}</Pill>
          <Pill onClick={() => setIsRaising(false)} className="w-[52px] shrink-0" label={t.game.cancel}>
            <Cross />
          </Pill>
        </div>
      );
    }

    // No fold button: folding is swiping your cards away
    const off = !canAct;
    return (
      <div className="flex gap-2.5">
        <Pill onClick={() => onAction("call")} disabled={off} className="flex-1 min-w-0">
          {toCall > 0
            ? callIsAllIn
              ? `${t.game.actions.allIn} ${short(callAmount)}`
              : `${t.game.call} ${short(callAmount)}`
            : t.game.check}
        </Pill>
        {canRaise && (
          <>
            <Pill onClick={() => onAction("raise", safeMin)} disabled={off} className="flex-1 min-w-0">
              {safeMin >= maxRaiseTotal ? `${t.game.actions.allIn} ${short(maxRaiseTotal)}` : `${t.game.raise} ${short(safeMin)}`}
            </Pill>
            {safeMin < maxRaiseTotal && (
              <Pill onClick={() => setIsRaising(true)} disabled={off} className="w-[52px] shrink-0" label={t.game.raiseAmount}>
                <ArrowUp />
              </Pill>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <section className="w-full px-5">
      <div className="h-14 flex items-center">{renderSizer()}</div>

      {renderButtons()}

      {/* Your cards, and you */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div
          className={`relative aspect-[125/112] touch-none select-none ${canFold ? "cursor-grab active:cursor-grabbing" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragStart.current = null;
            setDrag(null);
          }}
          title={canFold ? t.game.swipeToFold : undefined}
        >
          {/* What the cards leave behind once lifted, or once folded */}
          {(drag || flung || isOut || showHint) &&
            player.hand.map((card, idx) => (
              <div
                key={`ghost-${card.id}`}
                className={`absolute top-0 w-[64%] [container-type:inline-size] ${idx === 0 ? "left-0" : "right-0"}`}
              >
                <GhostCard card={card} />
              </div>
            ))}

          {!isOut && (
            <div
              className="absolute inset-0 z-10"
              style={{
                transform: `translate(${drag?.dx ?? 0}px, ${(drag?.dy ?? 0) - (flung ? 180 : 0)}px) rotate(${(drag?.dx ?? 0) * 0.04}deg)`,
                opacity: flung ? 0 : 1 - lift * 0.45,
                transition: drag && !flung ? "none" : "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease-out",
              }}
            >
              <div className={`absolute inset-0 ${showHint ? "swipe-nudge" : ""}`}>
              {player.hand.map((card, idx) => {
                const isWinningCard = !!winningHand?.cardIds.includes(card.id);
                return (
                  <div
                    key={card.id}
                    className={`absolute top-0 w-[64%] [container-type:inline-size] ${idx === 0 ? "left-0" : "right-0"}`}
                    style={{ zIndex: idx }}
                  >
                    <PlayingCard
                      card={card}
                      delay={0.4 + idx * 0.1}
                      isWinning={isWinningCard}
                      dimmed={decided && !isWinningCard}
                      size="inherit"
                      className="text-[10cqw]"
                    />
                  </div>
                );
              })}
              </div>
            </div>
          )}

          {showHint && (
            <span className="absolute left-1/2 -translate-x-1/2 bottom-3 z-20 pointer-events-none flex items-center gap-1 h-8 pl-2.5 pr-3 rounded-full bg-black/75 backdrop-blur-md text-white text-[13px] whitespace-nowrap animate-in fade-in duration-300">
              <ArrowUp className="w-3.5 h-3.5" />
              {t.game.swipeToFold}
            </span>
          )}
        </div>

        <div
          className={`
            rounded-[28px] flex flex-col items-center justify-between py-4 transition-colors duration-300
            ${canAct ? "bg-[#1c1c1e] border border-transparent" : "border border-white/15"}
          `}
        >
          <span className="text-[15px] text-white/55 truncate max-w-full px-3">{handName}</span>
          <div className="relative w-14 h-14">
            <Avatar isHuman alt="" className="w-full h-full object-contain" />
            {player.isDealer && (
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white text-black text-[11px] font-semibold flex items-center justify-center">
                D
              </span>
            )}
          </div>
          <span className="text-[26px] font-light leading-none text-white tabular-nums">
            <AnimatedCounter value={player.chips} />
          </span>
        </div>
      </div>
    </section>
  );
};
