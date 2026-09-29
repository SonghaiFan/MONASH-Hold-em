// A HUD: how each player has actually played, counted hand by hand.
//
//   VPIP — hands where they put money in preflop by choice (a call or a raise;
//          posting a blind or checking the big blind doesn't count)
//   PFR  — hands where they raised preflop
//   AFq  — after the flop, how often an action was a bet or raise, out of
//          bets, raises, calls and folds (checks don't count either way)
//
// The model reads these about its opponents; the table shows them against a
// style's targets, so you can see whether a TAG is really playing like one.

import { GamePhase, PlayerStats } from "../types";

export const emptyStats = (): PlayerStats => ({
  hands: 0,
  vpipHands: 0,
  pfrHands: 0,
  aggressive: 0,
  passive: 0,
  vpipThisHand: false,
  pfrThisHand: false,
});

// A new hand dealt to this player
export const startHandStats = (s: PlayerStats = emptyStats()): PlayerStats => ({
  ...s,
  hands: s.hands + 1,
  vpipThisHand: false,
  pfrThisHand: false,
});

export type StatAction = "fold" | "check" | "call" | "raise";

// One action, as it landed. `paid` is whether a call actually put chips in
// (a "call" of nothing is a check).
export const recordAction = (
  s: PlayerStats = emptyStats(),
  phase: GamePhase,
  action: StatAction,
  paid: boolean
): PlayerStats => {
  const next = { ...s };
  const voluntary = action === "raise" || (action === "call" && paid);

  if (phase === GamePhase.PRE_FLOP) {
    if (voluntary && !next.vpipThisHand) {
      next.vpipThisHand = true;
      next.vpipHands += 1;
    }
    if (action === "raise" && !next.pfrThisHand) {
      next.pfrThisHand = true;
      next.pfrHands += 1;
    }
    return next;
  }

  if (action === "raise") next.aggressive += 1;
  else if (action === "fold" || (action === "call" && paid)) next.passive += 1;
  return next;
};

export interface StatsSummary {
  hands: number;
  vpip: number; // 0..1
  pfr: number; // 0..1
  afq: number | null; // 0..1, null before any postflop action
}

export const summarise = (s?: PlayerStats): StatsSummary => {
  const st = s ?? emptyStats();
  const post = st.aggressive + st.passive;
  return {
    hands: st.hands,
    vpip: st.hands ? st.vpipHands / st.hands : 0,
    pfr: st.hands ? st.pfrHands / st.hands : 0,
    afq: post ? st.aggressive / post : null,
  };
};

// Below this, the numbers are noise; the model is told so, the table says so
export const MIN_HANDS_FOR_READS = 20;
