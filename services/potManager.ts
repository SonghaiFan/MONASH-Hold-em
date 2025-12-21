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
    let newPots = [...currentPots];
    
    // 1. Identify active contributors for this specific betting round.
    // Note: If a player is All-In from a PREVIOUS street, their currentBet is 0.
    // They are correctly excluded from 'activeBets', meaning they add $0 to new pots 
    // and are NOT eligible for any new betting slices created here.
    const activeBets = players
        .map(p => ({ 
            id: p.id, 
            bet: p.currentBet, 
            isActive: p.status !== 'FOLDED' && p.status !== 'ELIMINATED' 
        }))
        .filter(p => p.bet > 0); // Only process players who put money in THIS round

    if (activeBets.length === 0) return newPots;

    // We process bets from smallest to largest (Iterative Slicing)
    let processedBetAmount = 0;

    // Loop until all bets are fully allocated to pots
    while (activeBets.some(p => p.bet > processedBetAmount)) {
        
        // Find the smallest valid stack among those who still have money to allocate
        const remainingContributors = activeBets.filter(p => p.bet > processedBetAmount);
        
        if (remainingContributors.length === 0) break;

        const minStack = Math.min(...remainingContributors.map(p => p.bet));
        const contribution = minStack - processedBetAmount;
        
        // Who puts money into this slice?
        const contributors = remainingContributors;
        
        // Total money for this specific pot slice
        const potSliceAmount = contribution * contributors.length;

        // Who can win this slice?
        // Crucial: Only those who contributed to it (and are still active)
        const eligibleIds = contributors
            .filter(c => c.isActive)
            .map(c => c.id);

        // Check if we can merge this slice into the latest open pot
        const lastPot = newPots.length > 0 ? newPots[newPots.length - 1] : null;

        // We merge if the set of eligible players is IDENTICAL.
        // If Player A is All-In and stops contributing, 'eligibleIds' will shrink for the next slice.
        // This mismatch forces the creation of a new Side Pot excluding Player A.
        if (lastPot && areArraysEqualUnordered(lastPot.eligiblePlayerIds, eligibleIds)) {
            lastPot.amount += potSliceAmount;
        } else {
             newPots.push({
                id: `pot-${Date.now()}-${newPots.length}`,
                amount: potSliceAmount,
                eligiblePlayerIds: eligibleIds,
                // Strict Naming: First pot is MAIN, anything else is SIDE
                kind: newPots.length === 0 ? 'MAIN' : 'SIDE'
            });
        }

        processedBetAmount = minStack;
    }

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