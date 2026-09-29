import React, { useEffect, useRef, useState, useMemo } from "react";
import { GamePhase, Player, PlayerAction, WinningHand } from "../types";
import { PlayingCard } from "./PlayingCard";
import { AnimatedCounter } from "./AnimatedCounter";
import { useLanguage } from "../services/i18n";
import { Avatar } from "./Avatar";
import { SeatStatsSheet } from "./SeatStatsSheet";

interface AIStratumProps {
    players: Player[];
    activePlayerId: string | null;
    phase: GamePhase;
    humanHasFolded: boolean;
    winningHand: WinningHand | null;
    aiIntent?: { playerId: string; action: string; amount?: number } | null;
}

// How long an action word stays over a face after the action lands.
const ACTION_FLASH_MS = 1600;
const HOLD_MS = 450; // press this long on a seat for its stats

type ActionWord = "check" | "call" | "raise" | "fold" | "allIn";

const WORD_FOR_STATUS: Partial<Record<PlayerAction, ActionWord>> = {
    CHECKED: "check",
    CALLED: "call",
    RAISED: "raise",
    FOLDED: "fold",
    "ALL-IN": "allIn",
};

export const AIStratum: React.FC<AIStratumProps> = ({
    players,
    activePlayerId,
    phase,
    humanHasFolded,
    winningHand,
    aiIntent,
}) => {
    const { t, lang } = useLanguage();
    const visiblePlayers = useMemo(
        () => players.filter((p) => p.status !== "ELIMINATED"),
        [players]
    );

    // Showdown reveals players one at a time, skipping the folded
    const activeVisiblePlayers = useMemo(
        () => visiblePlayers.filter((p) => p.status !== "FOLDED"),
        [visiblePlayers]
    );

    const focalSeatRef = useRef<HTMLDivElement>(null);
    const [revealFocusId, setRevealFocusId] = useState<string | null>(null);
    const [peekedPlayers, setPeekedPlayers] = useState<Set<string>>(new Set());

    // The word for what a player just did, shown over their faded face for a moment
    const [flashes, setFlashes] = useState<Record<string, ActionWord>>({});
    const lastStatus = useRef<Record<string, PlayerAction>>({});

    const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    useEffect(() => {
        players.forEach((p) => {
            const before = lastStatus.current[p.id];
            lastStatus.current[p.id] = p.status;
            const word = WORD_FOR_STATUS[p.status];
            if (!word || before === p.status) return;
            setFlashes((f) => ({ ...f, [p.id]: word }));
            clearTimeout(flashTimers.current[p.id]);
            flashTimers.current[p.id] = setTimeout(() => {
                setFlashes(({ [p.id]: _, ...rest }) => rest);
            }, ACTION_FLASH_MS);
        });
    }, [players]);

    useEffect(() => () => Object.values(flashTimers.current).forEach(clearTimeout), []);

    useEffect(() => {
        if (phase === GamePhase.SHOWDOWN && !winningHand) {
            const timeouts = activeVisiblePlayers.map((p, i) =>
                setTimeout(() => setRevealFocusId(p.id), i * 1500)
            );
            return () => timeouts.forEach(clearTimeout);
        } else {
            setRevealFocusId(null);
        }
    }, [phase, winningHand, activeVisiblePlayers]);

    useEffect(() => {
        if (phase === GamePhase.PRE_FLOP) setPeekedPlayers(new Set());
    }, [phase]);

    // With more seats than fit, keep whoever matters in view
    useEffect(() => {
        focalSeatRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }, [activePlayerId, winningHand, revealFocusId]);

    const togglePeek = (playerId: string) => {
        setPeekedPlayers((prev) => {
            const next = new Set(prev);
            if (next.has(playerId)) next.delete(playerId);
            else next.add(playerId);
            return next;
        });
    };

    // Press and hold a seat for its stats; the click that ends a hold must not also peek
    const [statsFor, setStatsFor] = useState<string | null>(null);
    const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const holdOrigin = useRef<{ x: number; y: number } | null>(null);
    const justHeld = useRef(false);
    const cancelHold = () => {
        clearTimeout(holdTimer.current);
        holdOrigin.current = null;
    };
    const openStats = (id: string) => {
        cancelHold();
        justHeld.current = true;
        navigator.vibrate?.(10);
        setStatsFor(id);
    };
    const holdHandlers = (id: string) => ({
        onPointerDown: (e: React.PointerEvent) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            holdOrigin.current = { x: e.clientX, y: e.clientY };
            clearTimeout(holdTimer.current);
            holdTimer.current = setTimeout(() => openStats(id), HOLD_MS);
        },
        onPointerMove: (e: React.PointerEvent) => {
            const o = holdOrigin.current;
            if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 8) cancelHold();
        },
        onPointerUp: cancelHold,
        onPointerLeave: cancelHold,
        onPointerCancel: cancelHold,
        onContextMenu: (e: React.MouseEvent) => {
            e.preventDefault();
            openStats(id);
        },
    });
    useEffect(() => () => clearTimeout(holdTimer.current), []);
    const statsPlayer = players.find((p) => p.id === statsFor);

    const wordFromIntent = (action: string): ActionWord => {
        const act = action.toLowerCase();
        return act === "check" || act === "call" || act === "raise" || act === "fold" ? act : "allIn";
    };

    return (
        <section className="w-full overflow-x-auto no-scrollbar">
            <div
                className="grid min-w-full w-max px-3"
                style={{ gridTemplateColumns: `repeat(${visiblePlayers.length}, minmax(68px, 1fr))` }}
            >
                {visiblePlayers.map((p) => {
                    const isThinking = activePlayerId === p.id && !aiIntent;
                    const isFolded = p.status === "FOLDED";
                    const isWinner = winningHand?.playerId === p.id;
                    const isPeeked = peekedPlayers.has(p.id);
                    // Showdown turns over everyone still in; after the hand, anyone can be peeked at
                    const shouldReveal =
                        isPeeked || (!isFolded && phase === GamePhase.SHOWDOWN && p.isActive && !humanHasFolded);

                    const isFocal = winningHand
                        ? winningHand.focalPlayerId === p.id
                        : revealFocusId === p.id || (!revealFocusId && activePlayerId === p.id);

                    const activeIndex = activeVisiblePlayers.findIndex((avp) => avp.id === p.id);
                    const revealDelay =
                        phase === GamePhase.SHOWDOWN && !isPeeked && activeIndex !== -1 ? activeIndex * 1.5 : 0;

                    const word: ActionWord | undefined =
                        aiIntent?.playerId === p.id ? wordFromIntent(aiIntent.action) : flashes[p.id];
                    // Out of the hand, or out of the running once it is decided: the face goes dark
                    const isDark = isFolded || (!!winningHand && !isWinner);
                    const isQuiet = isDark || !!word; // face and numbers step back

                    const decided = !!winningHand && winningHand.cardIds.length > 0;
                    const canPeek = !!winningHand && p.hand.length === 2;
                    const personaLabel = p.persona ? t.personas[p.persona.id]?.label || p.persona.label : "";
                    const isTilted = (p.tilt ?? 1) > 1.05;

                    return (
                        <div
                            key={p.id}
                            ref={isFocal ? focalSeatRef : null}
                            role={canPeek ? "button" : undefined}
                            tabIndex={canPeek ? 0 : undefined}
                            {...holdHandlers(p.id)}
                            onClick={() => {
                                if (justHeld.current) {
                                    justHeld.current = false;
                                    return;
                                }
                                if (canPeek) togglePeek(p.id);
                            }}
                            title={[p.name, personaLabel, isTilted ? (lang === "zh" ? "情绪上头" : "on tilt") : "", canPeek ? (isPeeked ? t.game.hideCards : t.game.peekCards) : ""].filter(Boolean).join(" · ")}
                            className={`flex flex-col items-center select-none [-webkit-touch-callout:none] ${canPeek ? "cursor-pointer" : ""}`}
                        >
                            {/* A caret over whoever is to act */}
                            <div className="h-6 flex items-center justify-center">
                                {isThinking && (
                                    <svg width="12" height="8" viewBox="0 0 12 8" className="text-white animate-in fade-in duration-200">
                                        <path d="M1.5 1h9L6 7z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </div>

                            <div className="relative w-14 h-14 mt-1 flex items-center justify-center">
                                <Avatar
                                    name={p.name}
                                    alt=""
                                    className={`w-full h-full object-contain transition-[opacity,filter] duration-300 ${
                                        isDark ? "opacity-25 brightness-50" : word ? "opacity-30" : "opacity-100"
                                    }`}
                                />
                                {p.isDealer && (
                                    <span className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white text-black text-[11px] font-semibold flex items-center justify-center transition-opacity ${isQuiet ? "opacity-30" : ""}`}>
                                        D
                                    </span>
                                )}
                                {isTilted && !isDark && (
                                    <span className="absolute -top-1 -left-1 text-sm leading-none">🔥</span>
                                )}
                                {word && (
                                    <span className="absolute inset-0 flex items-center justify-center text-[15px] text-white animate-in fade-in zoom-in-90 duration-200">
                                        {t.game.actions[word]}
                                    </span>
                                )}
                            </div>

                            <span className={`mt-3 max-w-full px-1 truncate text-[13px] leading-tight transition-colors ${isQuiet ? "text-white/25" : "text-white/55"}`}>
                                {p.name}
                            </span>
                            <span className={`text-[17px] leading-tight tabular-nums transition-colors ${isQuiet ? "text-white/25" : "text-white"}`}>
                                <AnimatedCounter value={p.chips} />
                            </span>

                            {/* Under the stack: chips bet this street, or the hand once shown, or an eye to show it */}
                            <div className="h-11 mt-2 flex items-center justify-center">
                                {shouldReveal && p.hand.length === 2 ? (
                                    <div className="flex gap-0.5">
                                        {p.hand.map((card, i) => (
                                            <PlayingCard
                                                key={card.id}
                                                card={card}
                                                delay={revealDelay + i * 0.1}
                                                size={2.6}
                                                dimmed={decided && !winningHand!.cardIds.includes(card.id)}
                                            />
                                        ))}
                                    </div>
                                ) : canPeek ? (
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/25">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                ) : p.currentBet > 0 ? (
                                    <span className="min-w-7 h-7 px-2 rounded-full bg-[#1c1c1e] text-[#f5e35b] text-[13px] tabular-nums flex items-center justify-center animate-in zoom-in-75 duration-200">
                                        {p.currentBet.toLocaleString()}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>
            {statsPlayer && <SeatStatsSheet player={statsPlayer} onClose={() => setStatsFor(null)} />}
        </section>
    );
};
