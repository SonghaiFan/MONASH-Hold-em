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
    const pool = [...p.hand, ...board];
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

const ALL_SUITS = [Suit.Hearts, Suit.Diamonds, Suit.Clubs, Suit.Spades];

/**
 * Monte Carlo estimate of a hand's chance to win at showdown against
 * `opponentCount` random hands, given the currently visible board.
 * Returns a percentage (0-100). Ties are credited as a fractional win.
 */
export const estimateEquity = (
  hand: Card[],
  board: Card[],
  opponentCount: number,
  iterations = 250
): number => {
  if (hand.length !== 2 || opponentCount < 1) return 0;

  const known = new Set([...hand, ...board].map((c) => `${normalizeRank(c.rank)}${c.suit}`));
  const remaining: Card[] = [];
  ALL_SUITS.forEach((suit) => {
    RANKS.forEach((rank) => {
      const key = `${rank}${suit}`;
      if (!known.has(key)) remaining.push({ rank, suit, id: key });
    });
  });

  const boardNeeded = 5 - board.length;
  const cardsNeeded = boardNeeded + opponentCount * 2;
  if (cardsNeeded > remaining.length) return 0;

  let equity = 0;
  for (let iter = 0; iter < iterations; iter++) {
    // Partial Fisher-Yates: only shuffle as many cards as we need to deal
    for (let i = 0; i < cardsNeeded; i++) {
      const j = i + Math.floor(Math.random() * (remaining.length - i));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }

    const fullBoard = [...board, ...remaining.slice(0, boardNeeded)];
    const heroRank = evaluateHand([...hand, ...fullBoard]);

    let heroBeaten = false;
    let tiedWith = 0;
    for (let o = 0; o < opponentCount; o++) {
      const offset = boardNeeded + o * 2;
      const oppHand = [remaining[offset], remaining[offset + 1]];
      const cmp = compareHandRanks(heroRank, evaluateHand([...oppHand, ...fullBoard]));
      if (cmp > 0) {
        heroBeaten = true;
        break;
      }
      if (cmp === 0) tiedWith++;
    }

    if (!heroBeaten) equity += 1 / (tiedWith + 1);
  }

  return (equity / iterations) * 100;
};

// --- For the hand analysis (services/handAnalysis.ts) ---

export type BestHand = HandRank;

// The best five-card hand in these cards (five to seven of them)
export const bestHandOf = (cards: Card[]): BestHand => evaluateHand(cards);

// 2..14, ace high
export const rankValueOf = (rank: string): number => getRankValue(rank);

// Positive when a beats b, negative when b beats a, 0 for a tie
export const compareHands = (a: BestHand, b: BestHand): number => -compareHandRanks(a, b);

export const cardKey = (c: Card) => `${normalizeRank(c.rank)}${c.suit}`;

/**
 * Like estimateEquity, but each opponent holds a hand drawn from their own
 * estimated range (a list of two-card combos) rather than any two cards.
 * An empty list means "any two cards".
 */
export const estimateEquityVsRanges = (
  hand: Card[],
  board: Card[],
  ranges: Card[][][],
  iterations = 250
): number => {
  if (hand.length !== 2 || ranges.length === 0) return 0;

  const known = new Set([...hand, ...board].map(cardKey));
  const deck: Card[] = [];
  ALL_SUITS.forEach((suit) => {
    RANKS.forEach((rank) => {
      const key = `${rank}${suit}`;
      if (!known.has(key)) deck.push({ rank, suit, id: key });
    });
  });
  // A range can only hold combos that avoid the cards we can see
  const live = ranges.map((combos) => combos.filter((c) => !known.has(cardKey(c[0])) && !known.has(cardKey(c[1]))));
  const boardNeeded = 5 - board.length;

  let equity = 0;
  let dealt = 0;
  for (let iter = 0; iter < iterations; iter++) {
    const used = new Set<string>();
    const opponents: Card[][] = [];
    let ok = true;
    for (const combos of live) {
      let pick: Card[] | undefined;
      for (let tries = 0; tries < 30 && !pick; tries++) {
        const candidate =
          combos.length > 0
            ? combos[Math.floor(Math.random() * combos.length)]
            : [deck[Math.floor(Math.random() * deck.length)], deck[Math.floor(Math.random() * deck.length)]];
        const [a, b] = candidate.map(cardKey);
        if (a !== b && !used.has(a) && !used.has(b)) pick = candidate;
      }
      if (!pick) {
        ok = false;
        break;
      }
      pick.forEach((c) => used.add(cardKey(c)));
      opponents.push(pick);
    }
    if (!ok) continue;

    const rest = deck.filter((c) => !used.has(cardKey(c)));
    for (let i = 0; i < boardNeeded; i++) {
      const j = i + Math.floor(Math.random() * (rest.length - i));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const fullBoard = [...board, ...rest.slice(0, boardNeeded)];
    const heroRank = evaluateHand([...hand, ...fullBoard]);

    let beaten = false;
    let tiedWith = 0;
    for (const opp of opponents) {
      const cmp = compareHandRanks(heroRank, evaluateHand([...opp, ...fullBoard]));
      if (cmp > 0) {
        beaten = true;
        break;
      }
      if (cmp === 0) tiedWith++;
    }
    dealt++;
    if (!beaten) equity += 1 / (tiedWith + 1);
  }

  return dealt ? (equity / dealt) * 100 : 0;
};

// The name of the best hand these cards make so far — hole cards alone before the flop.
export const describeHand = (cards: Card[]): string => {
  if (cards.length >= 5) return evaluateHand(cards).name;
  if (cards.length === 2 && normalizeRank(cards[0].rank) === normalizeRank(cards[1].rank)) return "Pair";
  return cards.length > 0 ? "High Card" : "";
};
