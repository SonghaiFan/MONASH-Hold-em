import { defineVariablePlugin } from '../api';
import { builtinFields } from './fields';
import { Card, GamePhase, Player, PlayerStats } from '../../types';
import { estimateEquity, estimateEquityVsRanges } from '../../services/pokerEvaluator';
import { MIN_HANDS_FOR_READS, summarise } from '../../services/playerStats';
import { boardTexture, drawsOf, estimateRange, madeHand, rangeCombos, stackDepth, startingHand } from '../../services/handAnalysis';
export const EQUITY_ITERATIONS = 600;
const formatCards = (cards: Card[]) =>
  cards.map((c) => `${c.rank}${c.suit}`).join(" ");

// What an opponent has shown so far at this table: their HUD numbers, or a
// note that there isn't enough yet to go on.
const readsOf = (stats: PlayerStats) => {
  const s = summarise(stats);
  if (s.hands < MIN_HANDS_FOR_READS) return `only ${s.hands} hands seen; no reliable read yet`; // under MIN_HANDS_FOR_READS
  const pct = (v: number) => Math.round(v * 100);
  return {
    handsSeen: s.hands,
    vpipPercent: pct(s.vpip),
    pfrPercent: pct(s.pfr),
    ...(s.afq !== null ? { postflopAggressionPercent: pct(s.afq) } : {}),
  };
};

// Helper: Sort players by action order for the current street
const getSortedPlayersByActionOrder = (
  players: Player[],
  dealerIndex: number,
  phase: GamePhase
) => {
  const total = players.length;
  // Pre-flop starts after BB (Dealer + 3), Post-flop starts after Dealer (Dealer + 1)
  const offset = phase === GamePhase.PRE_FLOP ? 3 : 1;
  const startIndex = (dealerIndex + offset) % total;

  const sorted: Player[] = [];
  for (let i = 0; i < total; i++) {
    sorted.push(players[(startIndex + i) % total]);
  }
  return sorted;
};

const describeStatus = (p: Player): string => {
  if (p.status === "ELIMINATED") return "Eliminated";
  if (p.status === "ALL-IN") return `All-in for $${p.currentBet}`;
  if (p.status === "CHECKED") return "Checked";
  if (p.status === "CALLED") return `Called $${p.currentBet}`;
  if (p.status === "RAISED") return `Raised to $${p.currentBet}`;
  // WAITING / THINKING / ACTING
  return p.currentBet > 0
    ? `Posted $${p.currentBet}, yet to act`
    : "Yet to act";
};


export const pokerCore = defineVariablePlugin({
  apiVersion: 1,
  id: 'poker.core',
  version: '1.0.0',
  outputMode: 'fields',
  fields: [...builtinFields, {path:'game', group:'table' as const, example:"No-Limit Texas Hold'em", desc:{en:'Game being played', zh:'当前游戏'}}],
  compute({context}) {
    // Mutable local copies for the existing pure poker helpers.
    const c = structuredClone(context);
    const activePlayer = {...c.hero, hand: [...c.hero.hand]} as Player;
    const allPlayers = c.players.map(p => ({...p, hand: p.id === activePlayer.id ? activePlayer.hand : []})) as Player[];
    const board = [...c.board] as Card[];
    const {pot, currentHighBet, bigBlind, handHistory, reasoningHistory} = c;
    const phase = c.street;
  const toCall = Math.min(
    currentHighBet - activePlayer.currentBet,
    activePlayer.chips
  );
  const potOdds = toCall <= 0 ? 0 : (toCall / (pot + toCall)) * 100;
  const maxTotal = activePlayer.chips + activePlayer.currentBet;
  const minRaiseTotal = Math.min(currentHighBet + bigBlind, maxTotal);


  // Filter visible board
  let visibleBoard: Card[] = [];
  if (phase === GamePhase.FLOP) visibleBoard = board.slice(0, 3);
  else if (phase === GamePhase.TURN) visibleBoard = board.slice(0, 4);
  else if (phase === GamePhase.RIVER || phase === GamePhase.SHOWDOWN)
    visibleBoard = board.slice(0, 5);

  // --- Table snapshot in action order (folded players omitted) ---
  const dealerIndex = allPlayers.findIndex((p) => p.isDealer);
  const tablePlayers = getSortedPlayersByActionOrder(
    allPlayers,
    dealerIndex !== -1 ? dealerIndex : 0,
    phase
  )
    .filter((p) => p.status !== "FOLDED" && p.status !== "ELIMINATED")
    .map((p) => ({
      name: p.name,
      position: p.isDealer ? "BTN" : p.position,
      status: describeStatus(p),
      stack: p.chips,
      isYou: p.id === activePlayer.id,
      ...(p.id !== activePlayer.id && p.stats ? { reads: readsOf(p.stats) } : {}),
    }));

  const opponentsInHand = Math.max(
    1,
    tablePlayers.filter((p) => !p.isYou).length
  );

  // --- Local maths the model should not have to guess ---
  const opponents = allPlayers.filter(
    (p) => p.id !== activePlayer.id && p.status !== "FOLDED" && p.status !== "ELIMINATED"
  );
  // What each opponent's line says they hold, and equity against exactly that
  const ranges = opponents.map((p) => estimateRange(p, [...handHistory]));
  // Against random hands is only a reference point beside the real number, so a rougher estimate does
  const equityVsRandom = estimateEquity(activePlayer.hand, visibleBoard, opponentsInHand, EQUITY_ITERATIONS / 3);
  const equity = ranges.length
    ? estimateEquityVsRanges(activePlayer.hand, visibleBoard, ranges.map(rangeCombos), EQUITY_ITERATIONS)
    : equityVsRandom;

  const texture = boardTexture(visibleBoard);
  const draws = drawsOf(activePlayer.hand, visibleBoard);
  const {effectiveStackBigBlinds} = stackDepth(activePlayer, opponents, pot, bigBlind);

  const state = {
    game: "No-Limit Texas Hold'em, cash-style table",
    street: phase,
    you: {
      name: activePlayer.name,
      position: activePlayer.isDealer ? "BTN" : activePlayer.position,
      holeCards: formatCards(activePlayer.hand),
      stack: activePlayer.chips,
      alreadyBetThisStreet: activePlayer.currentBet,
      startingHand: startingHand(activePlayer.hand),
      ...(visibleBoard.length ? { madeHand: madeHand(activePlayer.hand, visibleBoard) } : {}),
      ...(draws ? { draws } : {}),
    },
    board: visibleBoard.length ? formatCards(visibleBoard) : "none (preflop)",
    pot,
    toCall,
    equityPercent: Number(equity.toFixed(1)),
    equityVsRandomPercent: Number(equityVsRandom.toFixed(1)),
    equityMinusPotOdds: Number((equity - potOdds).toFixed(1)),
    effectiveStackBigBlinds,
    ...(texture ? { boardTexture: texture } : {}),
    opponentRanges: ranges.map((r) => ({
      name: r.name,
      estimatedRange: r.width >= 1 ? "any two cards" : `top ${Math.max(1, Math.round(r.width * 100))}% of starting hands`,
      because: r.because,
    })),
    bigBlind,
    opponentsInHand,
    minRaiseTotal,
    maxBetTotal: maxTotal,
    tableInActionOrder: tablePlayers,
    handHistory: handHistory.length ? handHistory : ["No actions yet."],
    yourEarlierReads: reasoningHistory,
  };


    return state;
  },
});
