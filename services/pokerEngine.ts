import { Card, GamePhase, Player, PlayerAction, Pot } from "../types";
import { generateDeck } from "../constants";
import { PayoutResult, determineWinner } from "./pokerEvaluator";

// A headless, pure-function No-Limit Hold'em engine. It mirrors the rules in
// components/PokerGame.tsx (blinds, action order, round completion, runouts)
// but keeps proper side pots via per-player committed totals, and has no
// timers or UI state, so it can drive simulations and model tournaments.

export type EngineAction = "fold" | "check" | "call" | "raise";

export interface HandResult {
  handNumber: number;
  board: Card[];
  showdown: boolean;
  pots: Pot[];
  payouts: PayoutResult[];
  potTotal: number;
}

export interface EngineState {
  players: Player[];
  dealerIndex: number;
  board: Card[]; // all five dealt up front; visible portion depends on phase
  phase: GamePhase;
  activePlayerId: string | null;
  handHistory: string[];
  committed: Record<string, number>; // chips each player has put into this hand
  handNumber: number;
  bigBlind: number;
  handOver: boolean;
  result: HandResult | null;
}

const inHand = (p: Player) => p.status !== "FOLDED" && p.status !== "ELIMINATED";
const canAct = (p: Player) => inHand(p) && p.status !== "ALL-IN";

// Helper to determine position label based on offset from dealer (same as PokerGame)
const getPositionLabel = (indexFromDealer: number, playerCount: number): string => {
  if (playerCount === 2) return indexFromDealer === 0 ? "SB" : "BB";
  if (indexFromDealer === 0) return "BTN";
  if (indexFromDealer === 1) return "SB";
  if (indexFromDealer === 2) return "BB";
  const distFromButton = playerCount - indexFromDealer;
  if (distFromButton === 1) return "CO";
  if (distFromButton === 2 && playerCount >= 5) return "HJ";
  const distFromBB = indexFromDealer - 2;
  if (distFromBB === 1) return "UTG";
  return `UTG+${distFromBB - 1}`;
};

const nextPhase = (phase: GamePhase): GamePhase =>
  phase === GamePhase.PRE_FLOP
    ? GamePhase.FLOP
    : phase === GamePhase.FLOP
      ? GamePhase.TURN
      : phase === GamePhase.TURN
        ? GamePhase.RIVER
        : GamePhase.SHOWDOWN;

export const visibleBoard = (state: EngineState): Card[] => {
  if (state.phase === GamePhase.FLOP) return state.board.slice(0, 3);
  if (state.phase === GamePhase.TURN) return state.board.slice(0, 4);
  if (state.phase === GamePhase.RIVER || state.phase === GamePhase.SHOWDOWN)
    return state.board.slice(0, 5);
  return [];
};

export const currentHighBet = (state: EngineState) =>
  Math.max(0, ...state.players.map((p) => p.currentBet));

export const potTotal = (state: EngineState) =>
  Object.values(state.committed).reduce((a, b) => a + b, 0);

export const createEngine = (players: Player[], bigBlind: number): EngineState => ({
  players: players.map((p) => ({ ...p, hand: [], currentBet: 0, status: "WAITING" as PlayerAction })),
  dealerIndex: players.length - 1, // so the first rotation lands on seat 0
  board: [],
  phase: GamePhase.PRE_FLOP,
  activePlayerId: null,
  handHistory: [],
  committed: {},
  handNumber: 0,
  bigBlind,
  handOver: true,
  result: null,
});

export const playersWithChips = (state: EngineState) =>
  state.players.filter((p) => p.chips > 0);

export const startHand = (prev: EngineState): EngineState => {
  const deck = generateDeck();
  const live = prev.players
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p.chips > 0)
    .map(({ index }) => index);
  if (live.length < 2) return { ...prev, handOver: true };

  // Rotate the button among players who still have chips
  let dealerPos = live.findIndex((i) => i === prev.dealerIndex);
  if (dealerPos === -1) {
    const next = live.find((i) => i > prev.dealerIndex);
    dealerPos = next !== undefined ? live.indexOf(next) : 0;
  } else {
    dealerPos = (dealerPos + 1) % live.length;
  }
  const count = live.length;

  const players: Player[] = prev.players.map((p, i) => {
    if (p.chips <= 0) {
      return { ...p, hand: [], isActive: false, status: "ELIMINATED" as PlayerAction, position: "", isDealer: false, currentBet: 0 };
    }
    const offset = (live.indexOf(i) - dealerPos + count) % count;
    return {
      ...p,
      hand: [deck.pop()!, deck.pop()!],
      isActive: true,
      status: "WAITING" as PlayerAction,
      position: getPositionLabel(offset, count),
      isDealer: offset === 0,
      currentBet: 0,
      reasoningHistory: [],
    };
  });

  const committed: Record<string, number> = {};
  const sbOffset = count === 2 ? 0 : 1;
  const bbOffset = count === 2 ? 1 : 2;
  const post = (seatOffset: number, amount: number) => {
    const p = players[live[(dealerPos + seatOffset) % count]];
    const paid = Math.min(amount, p.chips);
    p.chips -= paid;
    p.currentBet = paid;
    committed[p.id] = paid;
    if (p.chips === 0) p.status = "ALL-IN";
  };
  post(sbOffset, Math.floor(prev.bigBlind / 2));
  post(bbOffset, prev.bigBlind);

  const board = [deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!];
  const dealerIndex = live[dealerPos];
  // First to act is left of the BB, skipping anyone the blinds already put all-in
  let firstActor: Player | undefined;
  for (let k = 0; k < count; k++) {
    const candidate = players[live[(dealerPos + bbOffset + 1 + k) % count]];
    if (canAct(candidate)) {
      firstActor = candidate;
      break;
    }
  }

  const state: EngineState = {
    players,
    dealerIndex,
    board,
    phase: GamePhase.PRE_FLOP,
    activePlayerId: firstActor?.id ?? null,
    handHistory: [`--- NEW HAND #${prev.handNumber + 1} (Dealer: ${players[dealerIndex].name}) ---`],
    committed,
    handNumber: prev.handNumber + 1,
    bigBlind: prev.bigBlind,
    handOver: false,
    result: null,
  };
  // Blinds may already leave nobody able to act (everyone all-in on the blinds)
  return settleIfNeeded(state);
};

// Build main + side pots from what each player has committed this hand.
const buildPots = (state: EngineState): Pot[] => {
  const contenders = state.players.filter(inHand);
  const levels = Array.from(
    new Set(contenders.map((p) => state.committed[p.id] ?? 0).filter((v) => v > 0))
  ).sort((a, b) => a - b);

  const pots: Pot[] = [];
  let prevLevel = 0;
  levels.forEach((level, i) => {
    let amount = 0;
    state.players.forEach((p) => {
      const c = state.committed[p.id] ?? 0;
      amount += Math.max(0, Math.min(c, level) - Math.min(c, prevLevel));
    });
    if (amount > 0) {
      pots.push({
        id: i === 0 ? "main-pot" : `side-pot-${i}`,
        amount,
        eligiblePlayerIds: contenders
          .filter((p) => (state.committed[p.id] ?? 0) >= level)
          .map((p) => p.id),
        kind: i === 0 ? "MAIN" : "SIDE",
      });
    }
    prevLevel = level;
  });
  // Chips committed above the highest contender level (a fold after over-betting) go to the last pot
  const covered = pots.reduce((a, p) => a + p.amount, 0);
  const excess = potTotal(state) - covered;
  if (excess > 0 && pots.length > 0) pots[pots.length - 1].amount += excess;
  return pots;
};

const finishHand = (state: EngineState, showdown: boolean): EngineState => {
  const pots = buildPots(state);
  const total = potTotal(state);
  const alive = state.players.filter(inHand);
  let payouts: PayoutResult[];

  if (alive.length === 1) {
    payouts = [
      {
        playerId: alive[0].id,
        amount: total,
        winningHandName: "Opponents folded",
        winningCardIds: [],
        potDescription: "Pot",
        potKind: "MAIN",
      },
    ];
  } else {
    const fullBoard: EngineState = { ...state, phase: GamePhase.SHOWDOWN };
    payouts = determineWinner(state.players, visibleBoard(fullBoard), pots).payouts;
  }

  const won = new Map<string, number>();
  payouts.forEach((p) => won.set(p.playerId, (won.get(p.playerId) ?? 0) + p.amount));
  const players = state.players.map((p) => ({
    ...p,
    chips: p.chips + (won.get(p.id) ?? 0),
    currentBet: 0,
  }));

  const history = [...state.handHistory];
  payouts.forEach((p) => {
    const name = players.find((x) => x.id === p.playerId)?.name;
    history.push(`RESULT: ${name} wins $${p.amount} (${p.winningHandName})`);
  });

  return {
    ...state,
    players,
    phase: showdown ? GamePhase.SHOWDOWN : state.phase,
    activePlayerId: null,
    handHistory: history,
    handOver: true,
    result: {
      handNumber: state.handNumber,
      board: showdown ? state.board.slice(0, 5) : visibleBoard(state),
      showdown,
      pots,
      payouts,
      potTotal: total,
    },
  };
};

// After blinds or an action: if only one player is left, or nobody can act
// any more (all-in), resolve the hand immediately.
const settleIfNeeded = (state: EngineState): EngineState => {
  const alive = state.players.filter(inHand);
  if (alive.length === 1) return finishHand(state, false);
  const actors = state.players.filter(canAct);
  const high = currentHighBet(state);
  // A lone remaining actor who already covers the high bet has nothing to decide
  const unmatched = actors.some((p) => p.currentBet < high);
  if (actors.length === 0 || (actors.length === 1 && !unmatched)) {
    return finishHand(state, true);
  }
  return state;
};

const firstToActAfterDealer = (state: EngineState): string | null => {
  const n = state.players.length;
  for (let k = 1; k <= n; k++) {
    const p = state.players[(state.dealerIndex + k) % n];
    if (canAct(p)) return p.id;
  }
  return null;
};

const nextActor = (state: EngineState, fromIndex: number): string | null => {
  const n = state.players.length;
  for (let k = 1; k <= n; k++) {
    const p = state.players[(fromIndex + k) % n];
    if (canAct(p)) return p.id;
  }
  return null;
};

export const applyAction = (
  prev: EngineState,
  action: EngineAction,
  amount?: number
): EngineState => {
  if (prev.handOver || !prev.activePlayerId) return prev;
  const players = prev.players.map((p) => ({ ...p }));
  const idx = players.findIndex((p) => p.id === prev.activePlayerId);
  const player = players[idx];
  const committed = { ...prev.committed };
  const high = currentHighBet(prev);
  const toCall = high - player.currentBet;
  const label = `${prev.phase}: ${player.name} (${player.position}) `;
  let log = label;

  const put = (chips: number) => {
    player.chips -= chips;
    player.currentBet += chips;
    committed[player.id] = (committed[player.id] ?? 0) + chips;
  };

  if (action === "fold") {
    player.status = "FOLDED";
    player.isActive = false;
    log += "FOLDS";
  } else if (action === "check" || (action === "call" && toCall <= 0)) {
    if (toCall > 0) {
      player.status = "FOLDED";
      player.isActive = false;
      log += "FOLDS (invalid check)";
    } else {
      player.status = "CHECKED";
      log += "CHECKS";
    }
  } else if (action === "call") {
    const paid = Math.min(toCall, player.chips);
    put(paid);
    if (player.chips === 0) {
      player.status = "ALL-IN";
      log += `CALLS ALL-IN $${paid}`;
    } else {
      player.status = "CALLED";
      log += `CALLS $${paid}`;
    }
  } else {
    const maxTotal = player.chips + player.currentBet;
    let total = amount ?? high + prev.bigBlind;
    if (total >= maxTotal) total = maxTotal;
    else if (total < high + prev.bigBlind) total = Math.min(high + prev.bigBlind, maxTotal);
    put(total - player.currentBet);
    const raises = prev.handHistory.filter(
      (h) => h.startsWith(`${prev.phase}:`) && (h.includes("RAISES") || h.includes("-BETS"))
    ).length;
    const verb = raises === 0 ? "RAISES" : raises === 1 ? "3-BETS" : raises === 2 ? "4-BETS" : `${raises + 2}-BETS`;
    if (player.chips === 0) {
      player.status = "ALL-IN";
      log += `${verb} ALL-IN to $${total}`;
    } else {
      player.status = "RAISED";
      log += `${verb} to $${total}`;
    }
  }

  let state: EngineState = {
    ...prev,
    players,
    committed,
    handHistory: [...prev.handHistory, log],
  };

  // Hand over by folds?
  if (players.filter(inHand).length === 1) return finishHand(state, false);

  // Round complete?
  const newHigh = currentHighBet(state);
  const roundComplete = players
    .filter(inHand)
    .every((p) => p.status === "ALL-IN" || (p.status !== "WAITING" && p.currentBet === newHigh));

  if (!roundComplete) {
    return { ...state, activePlayerId: nextActor(state, idx) };
  }

  // Advance street (or run out if nobody can act any more)
  const advance = (s: EngineState): EngineState => {
    const phase = nextPhase(s.phase);
    const reset = s.players.map((p) => ({
      ...p,
      currentBet: 0,
      status: (p.status === "FOLDED" || p.status === "ALL-IN" || p.status === "ELIMINATED"
        ? p.status
        : "WAITING") as PlayerAction,
    }));
    return {
      ...s,
      players: reset,
      phase,
      handHistory: phase === GamePhase.SHOWDOWN ? s.handHistory : [...s.handHistory, `--- ${phase} ---`],
    };
  };

  state = advance(state);
  const actors = state.players.filter(canAct);
  if (state.phase === GamePhase.SHOWDOWN) return finishHand(state, true);
  if (actors.length <= 1) {
    // Run out the board
    while (state.phase !== GamePhase.SHOWDOWN) state = advance(state);
    return finishHand(state, true);
  }
  return { ...state, activePlayerId: firstToActAfterDealer(state) };
};
