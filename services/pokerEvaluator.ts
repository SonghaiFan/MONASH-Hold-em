import { Card, Player, Pot, Suit } from "../types";
import { RANKS } from "../constants";

// Helpers
const normalizeRank = (r: string) => {
  const x = r.trim().toUpperCase();
  return x === "T" ? "10" : x;
};

const getRankValue = (rank: string): number => {
  const r = normalizeRank(rank);
  const idx = RANKS.indexOf(r);
  if (idx === -1) {
    console.error(`Invalid rank encountered: "${rank}" (normalized "${r}")`);
    return -1;
  }
  return idx + 2;
};

const getSuitValue = (suit: Suit): string => suit;

interface HandRank {
  rankValue: number; // 0-8 (High Card to Straight Flush)
  tieBreakers: number[];
  name: string;
  winningCardIds: string[];
}

export interface EvaluatedHand {
  player: Player;
  handRank: HandRank;
}

export interface PayoutResult {
  playerId: string;
  amount: number;
  winningHandName: string;
  winningCardIds: string[];
  potDescription: string;
  potKind: "MAIN" | "SIDE";
  potId: string;
}

export interface WinnerResult {
  primaryWinnerId: string; // The person who won the main pot
  primaryHand: HandRank;
  payouts: PayoutResult[]; // List of all payouts (main + sides)
  isSplit: boolean; // True if any pot was split
}

const evaluateHand = (cards: Card[]): HandRank => {
  // Generate all combinations of 5 cards.
  function getCombinations(sourceArray: Card[], comboLength: number): Card[][] {
    const sourceLength = sourceArray.length;
    if (comboLength > sourceLength) return [];
    const combos: Card[][] = [];

    const makeNextCombo = (workingCombo: Card[], currentIndex: number) => {
      if (workingCombo.length === comboLength) {
        combos.push([...workingCombo]);
        return;
      }
      for (let i = currentIndex; i < sourceLength; i++) {
        makeNextCombo([...workingCombo, sourceArray[i]], i + 1);
      }
    };
    makeNextCombo([], 0);
    return combos;
  }

  const combos = getCombinations(cards, 5);
  let bestHand: HandRank = {
    rankValue: -1,
    tieBreakers: [],
    name: "",
    winningCardIds: [],
  };

  for (const hand of combos) {
    const currentRank = evaluate5CardHand(hand);
    if (isBetter(currentRank, bestHand)) {
      bestHand = currentRank;
    }
  }
  return bestHand;
};

const isBetter = (h1: HandRank, h2: HandRank): boolean => {
  if (h1.rankValue > h2.rankValue) return true;
  if (h1.rankValue < h2.rankValue) return false;
  for (let i = 0; i < h1.tieBreakers.length; i++) {
    if (h1.tieBreakers[i] > h2.tieBreakers[i]) return true;
    if (h1.tieBreakers[i] < h2.tieBreakers[i]) return false;
  }
  return false;
};

const compareHandRanks = (h1: HandRank, h2: HandRank): number => {
  if (isBetter(h1, h2)) return -1;
  if (isBetter(h2, h1)) return 1;
  return 0;
};

const evaluate5CardHand = (hand: Card[]): HandRank => {
  // Sort descending by rank
  const sorted = [...hand].sort(
    (a, b) => getRankValue(b.rank) - getRankValue(a.rank)
  );
  const ranks = sorted.map((c) => getRankValue(c.rank));
  const suits = sorted.map((c) => getSuitValue(c.suit));
  const cardIds = sorted.map((c) => c.id);
  const isFlush = suits.every((s) => s === suits[0]);

  let isStraight = true;
  for (let i = 0; i < 4; i++) {
    if (ranks[i] - ranks[i + 1] !== 1) {
      isStraight = false;
      break;
    }
  }
  // Wheel check A-5 (A=14, 5,4,3,2)
  if (
    !isStraight &&
    ranks[0] === 14 &&
    ranks[1] === 5 &&
    ranks[2] === 4 &&
    ranks[3] === 3 &&
    ranks[4] === 2
  ) {
    isStraight = true;
  }

  const counts: Record<number, number> = {};
  ranks.forEach((r) => (counts[r] = (counts[r] || 0) + 1));
  const countValues = Object.values(counts);
  const countKeys = Object.keys(counts)
    .map(Number)
    .sort((a, b) => b - a);

  if (countValues.includes(4)) {
    const quadRank = countKeys.find((k) => counts[k] === 4)!;
    const kicker = countKeys.find((k) => counts[k] === 1)!;
    return {
      rankValue: 7,
      tieBreakers: [quadRank, kicker],
      name: "Four of a Kind",
      winningCardIds: cardIds,
    };
  }
  if (countValues.includes(3) && countValues.includes(2)) {
    const trips = countKeys.find((k) => counts[k] === 3)!;
    const pair = countKeys.find((k) => counts[k] === 2)!;
    return {
      rankValue: 6,
      tieBreakers: [trips, pair],
      name: "Full House",
      winningCardIds: cardIds,
    };
  }
  if (isFlush) {
    if (isStraight) {
      const highCard = ranks[0] === 14 && ranks[1] === 5 ? 5 : ranks[0];
      return {
        rankValue: 8,
        tieBreakers: [highCard],
        name: "Straight Flush",
        winningCardIds: cardIds,
      };
    }
    return {
      rankValue: 5,
      tieBreakers: ranks,
      name: "Flush",
      winningCardIds: cardIds,
    };
  }
  if (isStraight) {
    const highCard = ranks[0] === 14 && ranks[1] === 5 ? 5 : ranks[0];
    return {
      rankValue: 4,
      tieBreakers: [highCard],
      name: "Straight",
      winningCardIds: cardIds,
    };
  }
  if (countValues.includes(3)) {
    const trips = countKeys.find((k) => counts[k] === 3)!;
    const kickers = countKeys.filter((k) => k !== trips).sort((a, b) => b - a);
    return {
      rankValue: 3,
      tieBreakers: [trips, ...kickers],
      name: "Three of a Kind",
      winningCardIds: cardIds,
    };
  }
  if (countValues.filter((c) => c === 2).length === 2) {
    const pairs = countKeys
      .filter((k) => counts[k] === 2)
      .sort((a, b) => b - a);
    const kicker = countKeys.find((k) => counts[k] === 1)!;
    return {
      rankValue: 2,
      tieBreakers: [...pairs, kicker],
      name: "Two Pair",
      winningCardIds: cardIds,
    };
  }
  if (countValues.includes(2)) {
    const pair = countKeys.find((k) => counts[k] === 2)!;
    const kickers = countKeys.filter((k) => k !== pair).sort((a, b) => b - a);
    return {
      rankValue: 1,
      tieBreakers: [pair, ...kickers],
      name: "Pair",
      winningCardIds: cardIds,
    };
  }
  return {
    rankValue: 0,
    tieBreakers: ranks,
    name: "High Card",
    winningCardIds: cardIds,
  };
};

/**
 * Calculates winners for ALL pots (Main + Sides).
 */
export const determineWinner = (
  players: Player[],
  board: Card[],
  pots: Pot[]
): WinnerResult => {
  // 1. Evaluate every active player's hand once
  const activePlayers = players.filter(
    (p) => p.status !== "FOLDED" && p.status !== "ELIMINATED"
  );
  const playerEvaluations = new Map<string, EvaluatedHand>();

  activePlayers.forEach((p) => {
    // Prioritize board cards in the pool so that if there's a tie (e.g. playing the board),
    // the evaluator picks the board cards first, avoiding confusing highlighting of hand cards.
    const pool = [...board, ...p.hand];
    playerEvaluations.set(p.id, {
      player: p,
      handRank: evaluateHand(pool),
    });
  });

  const payouts: PayoutResult[] = [];
  let isSplit = false;

  // 2. Iterate through pots
  pots.forEach((pot, index) => {
    if (pot.amount === 0) return;

    // Who can win this pot?
    const eligibleContenders = pot.eligiblePlayerIds
      .map((id) => playerEvaluations.get(id))
      .filter((evalResult) => evalResult !== undefined) as EvaluatedHand[];

    if (eligibleContenders.length === 0) return;

    // Sort contenders by hand strength
    eligibleContenders.sort((a, b) => compareHandRanks(a.handRank, b.handRank));

    // Check for ties
    const winner = eligibleContenders[0];
    const ties = eligibleContenders.filter(
      (c) => compareHandRanks(c.handRank, winner.handRank) === 0
    );

    if (ties.length > 1) {
      isSplit = true;
    }

    const splitAmount = Math.floor(pot.amount / ties.length);
    let remainder = pot.amount % ties.length;

    ties.forEach((t) => {
      let amount = splitAmount;
      if (remainder > 0) {
        amount += 1;
        remainder--;
      }

      // Determine pot description label
      let description = "Main Pot";
      if (pot.kind === "SIDE") {
        description = `Side Pot ${index}`;
      }

      payouts.push({
        playerId: t.player.id,
        amount: amount,
        winningHandName: t.handRank.name,
        winningCardIds: t.handRank.winningCardIds,
        potDescription: description,
        potKind: pot.kind,
        potId: pot.id,
      });
    });
  });

  // 3. Determine the "Primary" winner for UI focus.
  // We prioritize the winner of the MAIN POT to display the primary winning hand description.

  let primaryWinnerId = "";

  // Find who won the MAIN pot
  const mainPotPayout = payouts.find((p) => p.potKind === "MAIN");

  if (mainPotPayout) {
    primaryWinnerId = mainPotPayout.playerId;
  } else if (payouts.length > 0) {
    // Fallback: If no Main Pot winner (rare), find who won the most chips
    const winningsMap = new Map<string, number>();
    payouts.forEach((p) => {
      winningsMap.set(
        p.playerId,
        (winningsMap.get(p.playerId) || 0) + p.amount
      );
    });
    const sortedWinners = Array.from(winningsMap.entries()).sort(
      (a, b) => b[1] - a[1]
    );
    primaryWinnerId = sortedWinners[0][0];
  } else {
    return {
      primaryWinnerId: "",
      primaryHand: {
        rankValue: -1,
        tieBreakers: [],
        name: "Unknown",
        winningCardIds: [],
      },
      payouts: [],
      isSplit: false,
    };
  }

  const primaryHand = playerEvaluations.get(primaryWinnerId)?.handRank!;

  return {
    primaryWinnerId,
    primaryHand,
    payouts,
    isSplit,
  };
};
