// Everything about a spot that can be worked out rather than guessed: what you
// hold, what it can become, what the board looks like, how deep the money is,
// and what each opponent's line says about their hand. All of it goes to the
// model as facts, so its judgement starts from arithmetic, not intuition.

import { Card, GamePhase, Player, PlayerStats } from "../types";
import { RANKS } from "../constants";
import { bestHandOf, cardKey, compareHands, rankValueOf } from "./pokerEvaluator";
import { combosInRange, handCode, handPercentile } from "./preflop";
import { MIN_HANDS_FOR_READS, summarise } from "./playerStats";

const pct = (v: number) => Math.round(v * 100);
const RANK_NAME: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T" };
const rankName = (v: number) => RANK_NAME[v] ?? String(v);

// ---------- Your hand ----------

export const startingHand = (hole: Card[]) =>
  `${handCode(hole)}, top ${Math.max(1, pct(handPercentile(hole)))}% of starting hands`;

// What the hand is, in the words a player would use: "top pair, good kicker",
// "overpair", "set", "the board plays"…
export const madeHand = (hole: Card[], board: Card[]): string => {
  if (board.length < 3) {
    const [a, b] = hole.map((c) => rankValueOf(c.rank));
    return a === b ? `pocket ${rankName(a)}s` : "unpaired";
  }

  const best = bestHandOf([...hole, ...board]);
  if (board.length === 5) {
    const boardOnly = bestHandOf(board);
    if (compareHands(best, boardOnly) === 0) return `the board plays (${boardOnly.name.toLowerCase()} on board)`;
  }

  const holeRanks = hole.map((c) => rankValueOf(c.rank));
  const boardRanks = Array.from(new Set(board.map((c) => rankValueOf(c.rank)))).sort((a, b) => b - a);
  const pocketPair = holeRanks[0] === holeRanks[1];

  switch (best.rankValue) {
    case 8:
      return "straight flush";
    case 7:
      return "four of a kind";
    case 6:
      return "full house";
    case 5: {
      // Nut flush: holding the highest card of the suit not already on the board
      const suit = best.winningCardIds.length ? [...hole, ...board].find((c) => c.id === best.winningCardIds[0])?.suit : undefined;
      const suitOnBoard = new Set(board.filter((c) => c.suit === suit).map((c) => rankValueOf(c.rank)));
      const top = [14, 13, 12, 11, 10].find((r) => !suitOnBoard.has(r));
      const nut = hole.some((c) => c.suit === suit && rankValueOf(c.rank) === top);
      return nut ? "nut flush" : "flush";
    }
    case 4:
      return "straight";
    case 3: {
      const trips = best.tieBreakers[0];
      if (pocketPair && holeRanks[0] === trips) return "set (pocket pair matched on the board)";
      return holeRanks.includes(trips) ? "trips (one card matching a paired board)" : "trips on the board";
    }
    case 2: {
      const [hi, lo] = best.tieBreakers;
      const mine = [hi, lo].filter((r) => holeRanks.includes(r)).length;
      if (pocketPair) return "pocket pair plus a pair on the board";
      if (mine === 2) return "two pair using both hole cards";
      if (mine === 1) return "two pair, one of them on the board";
      return "two pair on the board (your cards are kickers)";
    }
    case 1: {
      const pair = best.tieBreakers[0];
      if (pocketPair) {
        if (pair > boardRanks[0]) return "overpair";
        if (pair < boardRanks[boardRanks.length - 1]) return "underpair (below every board card)";
        return "pocket pair below the top board card";
      }
      if (!holeRanks.includes(pair)) {
        const high = Math.max(...holeRanks);
        return `no pair of your own (pair on the board), ${rankName(high)} high`;
      }
      const kicker = holeRanks.find((r) => r !== pair) ?? 0;
      const place = boardRanks.indexOf(pair);
      if (place === 0) {
        const topKicker = kicker === 14 || (pair === 14 && kicker === 13);
        return `top pair, ${topKicker ? "top" : kicker >= 11 ? "good" : "weak"} kicker (${rankName(kicker)})`;
      }
      if (place === boardRanks.length - 1) return "bottom pair";
      return place === 1 ? "second pair" : "middle pair";
    }
    default: {
      const overs = holeRanks.filter((r) => r > boardRanks[0]).length;
      const high = Math.max(...holeRanks);
      return overs === 2 ? `no pair, two overcards (${rankName(high)} high)` : overs === 1 ? `no pair, one overcard (${rankName(high)} high)` : `no pair, ${rankName(high)} high`;
    }
  }
};

export interface Draws {
  draws: string[]; // e.g. "nut flush draw", "open-ended straight draw", "backdoor flush draw"
  outs?: number; // cards that make a straight or flush using your hole cards (none for a backdoor draw alone)
  hitNextCardPercent?: number;
  hitByRiverPercent?: number; // on the flop only
}

const ALL_CARDS = (): Card[] =>
  ["♠", "♥", "♦", "♣"].flatMap((suit) => RANKS.map((rank) => ({ rank, suit, id: `${rank}${suit}` }) as Card));

// Straight and flush draws, counted exactly: every unseen card that would give
// you a straight or better you are part of (not one the board alone makes).
export const drawsOf = (hole: Card[], board: Card[]): Draws | null => {
  if (board.length < 3 || board.length > 4) return null;
  const current = bestHandOf([...hole, ...board]);
  if (current.rankValue >= 4) return null; // already made

  const seen = new Set([...hole, ...board].map(cardKey));
  const unseen = ALL_CARDS().filter((c) => !seen.has(cardKey(c)));
  let outs = 0;
  let flushOuts = 0;
  const straightRanks = new Set<number>();
  unseen.forEach((c) => {
    const next = bestHandOf([...hole, ...board, c]);
    // Only straights and flushes are draws here; filling up a set is its own thing
    if (next.rankValue !== 4 && next.rankValue !== 5 && next.rankValue !== 8) return;
    // The board by itself would make it too: not your out
    if (board.length + 1 >= 5 && compareHands(bestHandOf([...board, c]), next) >= 0) return;
    outs++;
    if (next.rankValue === 5 || next.rankValue === 8) flushOuts++;
    else if (next.rankValue === 4) straightRanks.add(rankValueOf(c.rank));
  });

  const draws: string[] = [];
  if (flushOuts > 0) {
    const suitCounts = new Map<string, number>();
    [...hole, ...board].forEach((c) => suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1));
    const drawSuit = [...suitCounts.entries()].find(([, n]) => n === 4)?.[0];
    const aceOfSuit = hole.some((c) => c.suit === drawSuit && rankValueOf(c.rank) === 14);
    draws.push(aceOfSuit ? "nut flush draw" : "flush draw");
  }
  if (straightRanks.size >= 2) draws.push("open-ended straight draw (or double gutshot)");
  else if (straightRanks.size === 1) draws.push("gutshot straight draw");
  if (board.length === 3 && flushOuts === 0) {
    const bySuit = new Map<string, number>();
    [...hole, ...board].forEach((c) => bySuit.set(c.suit, (bySuit.get(c.suit) ?? 0) + 1));
    const threeWithMine = [...bySuit.entries()].some(([s, n]) => n === 3 && hole.some((c) => c.suit === s));
    if (threeWithMine) draws.push("backdoor flush draw");
  }

  if (draws.length === 0 && outs === 0) return null;
  // A backdoor draw needs two running cards: no one-card outs to count
  if (outs === 0) return { draws };

  const left = unseen.length;
  const hitNext = outs / left;
  const hitByRiver = board.length === 3 ? 1 - ((left - outs) / left) * ((left - 1 - outs) / (left - 1)) : undefined;
  return {
    draws,
    outs,
    hitNextCardPercent: pct(hitNext),
    ...(hitByRiver !== undefined ? { hitByRiverPercent: pct(hitByRiver) } : {}),
  };
};

// ---------- The board ----------

// How many draws the board allows, in one line: "K♠ 9♠ 4♦: two-tone, disconnected — semi-wet"
export const boardTexture = (board: Card[]): string | null => {
  if (board.length < 3) return null;
  const notes: string[] = [];
  let wet = 0;

  const ranks = board.map((c) => rankValueOf(c.rank));
  if (new Set(ranks).size < ranks.length) notes.push("paired");

  const suitMax = Math.max(...["♠", "♥", "♦", "♣"].map((s) => board.filter((c) => c.suit === s).length));
  const note = (text: string, wetness: number) => {
    notes.push(text);
    wet += wetness;
  };
  if (board.length === 3) {
    if (suitMax === 3) note("monotone", 2);
    else if (suitMax === 2) note("two-tone (flush draws possible)", 1);
    else note("rainbow", 0);
  } else if (suitMax >= 3) note("flush possible", 2);
  else if (suitMax === 2 && board.length === 4) note("flush draw possible", 1);

  // Most distinct ranks inside any window of `size` ranks (ace counts low too)
  const distinct = new Set(ranks.flatMap((r) => (r === 14 ? [14, 1] : [r])));
  const densest = (size: number) => {
    let most = 0;
    for (let low = 1; low + size - 1 <= 14; low++) {
      let n = 0;
      for (let r = low; r < low + size; r++) if (distinct.has(r)) n++;
      most = Math.max(most, n);
    }
    return most;
  };
  // Three in five ranks: someone can already hold a straight. Two within four
  // (like 7-6 or 9-7): open-enders and gutshots are live. J-7-2 is neither.
  if (densest(5) >= 3) note("straight possible", 2);
  else if (densest(4) >= 2) note("connected", 1);
  else note("disconnected", 0);

  const high = Math.max(...ranks);
  if (high >= 12) notes.push(`${rankName(high)}-high`);
  const verdict = wet >= 3 ? "wet" : wet === 2 ? "semi-wet" : "dry";
  return `${notes.join(", ")} — ${verdict}`;
};

// ---------- Opponents' ranges ----------

export interface RangeRead {
  name: string;
  width: number; // share of starting hands, 0..1
  because: string;
}

const DEFAULT_OPEN = 0.17;
const DEFAULT_VPIP = 0.45;

// Their line this hand, read from the log: how they came in preflop, then how
// hard they pushed after. Their HUD numbers, once there are enough, size it.
export const estimateRange = (player: Player, handHistory: string[]): RangeRead => {
  const mine = handHistory.filter((h) => h.includes(`: ${player.name} (`));
  const preflop = mine.filter((h) => h.startsWith("PRE_FLOP:"));
  const later = mine.filter((h) => !h.startsWith("PRE_FLOP:"));

  const s = summarise(player.stats as PlayerStats | undefined);
  const reliable = s.hands >= MIN_HANDS_FOR_READS;
  const theirPfr = reliable ? Math.min(0.6, Math.max(0.04, s.pfr)) : DEFAULT_OPEN;
  const theirVpip = reliable ? Math.min(0.8, Math.max(0.08, s.vpip)) : DEFAULT_VPIP;

  const reraised = preflop.some((h) => /\d-BETS/.test(h));
  const raised = preflop.some((h) => h.includes("RAISES"));
  const called = preflop.some((h) => h.includes("CALLS"));

  let width: number;
  const why: string[] = [];
  if (reraised) {
    width = Math.max(0.03, theirPfr * 0.3);
    why.push("re-raised preflop");
  } else if (raised) {
    width = theirPfr;
    why.push("raised preflop");
  } else if (called) {
    width = theirVpip * 0.8;
    why.push("called preflop");
  } else {
    width = 1;
    why.push("no voluntary preflop action (any two cards)");
  }

  later.forEach((h) => {
    if (h.includes("RAISES") || /\d-BETS/.test(h)) {
      width *= 0.55;
      why.push(`${h.split(":")[0].toLowerCase()} raise`);
    } else if (h.includes("CALLS")) {
      width *= 0.85;
      why.push(`${h.split(":")[0].toLowerCase()} call`);
    }
  });

  if (reliable) why.push(`their VPIP ${pct(s.vpip)}% / PFR ${pct(s.pfr)}% over ${s.hands} hands`);
  return { name: player.name, width: Math.max(0.02, Math.min(1, width)), because: why.join("; ") };
};

export const rangeCombos = (read: RangeRead): Card[][] => (read.width >= 1 ? [] : combosInRange(read.width));

// ---------- Money ----------

export const stackDepth = (hero: Player, opponents: Player[], pot: number, bigBlind: number) => {
  const deepest = Math.max(0, ...opponents.map((p) => p.chips + p.currentBet));
  const effective = Math.min(hero.chips + hero.currentBet, deepest);
  return {
    effectiveStackBigBlinds: Number((effective / bigBlind).toFixed(1)),
    stackToPotRatio: pot > 0 ? Number((hero.chips / pot).toFixed(1)) : null,
  };
};

// Facing a bet: how often you must continue so a bluff of this size can't
// profit automatically. With `pot` counting the bet already.
export const minimumDefense = (pot: number, toCall: number) =>
  toCall > 0 && pot > toCall ? pct((pot - toCall) / pot) : null;

// A bet or raise risking `risk` to win `pot` must work this often as a pure bluff
export const bluffBreakEven = (pot: number, risk: number) => pct(risk / (risk + pot));

export const isPostflop = (phase: GamePhase) => phase !== GamePhase.PRE_FLOP;
