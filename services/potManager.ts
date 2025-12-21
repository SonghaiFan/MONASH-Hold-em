import { Player, Pot } from "../types";

/**
 * Takes the current list of players (with their currentBets) and the existing pots,
 * and calculates the new pot structure.
 *
 * Logic Guarantee:
 * - "All-In" players only contribute up to their stack.
 * - Any betting in excess of an All-In player's stack creates a NEW Side Pot.
 * - The All-In player will NOT be in the 'eligiblePlayerIds' of that new Side Pot.
 */
export const resolvePots = (players: Player[], currentPots: Pot[]): Pot[] => {
  // Deep copy pots to avoid mutating the previous state (Critical for React StrictMode)
  let newPots = currentPots.map((pot) => ({ ...pot }));

  // Calculate total bets from this round
  const roundBets = players.reduce((sum, p) => sum + p.currentBet, 0);

  if (roundBets === 0) return newPots;

  // Find or create the Main Pot
  let mainPot = newPots.find((p) => p.kind === "MAIN");
  if (!mainPot) {
    mainPot = {
      id: "main-pot",
      amount: 0,
      eligiblePlayerIds: [],
      kind: "MAIN",
    };
    newPots = [mainPot];
  }

  // Add all bets to the main pot
  mainPot.amount += roundBets;

  // Update eligible players: Anyone who is active (not folded/eliminated) is eligible
  // This effectively ignores side-pot logic for All-In scenarios
  mainPot.eligiblePlayerIds = players
    .filter((p) => p.status !== "FOLDED" && p.status !== "ELIMINATED")
    .map((p) => p.id);

  return newPots;
};

// Helper to compare arrays ignoring order
const areArraysEqualUnordered = (arr1: string[], arr2: string[]) => {
  if (arr1.length !== arr2.length) return false;
  const s1 = new Set(arr1);
  for (const item of arr2) {
    if (!s1.has(item)) return false;
  }
  return true;
};
