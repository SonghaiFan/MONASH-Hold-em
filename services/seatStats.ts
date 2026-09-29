// How each opponent has played across all of a player's sessions, filed per
// style: retune a seat and its numbers start again, because they describe a
// different player. Stored per player name next to the bankroll and seats.
//
// A session adds to what was there when it started, so it can be written
// after every hand without counting anything twice.

import { PlayerStats } from "../types";
import { emptyStats } from "./playerStats";

type Book = Record<string, PlayerStats>; // "seat name|style key" → totals

const keyFor = (user: string) => `franks-holdem:seat-stats:${user.trim().toLowerCase()}`;
export const entryKey = (seatName: string, styleKey: string) => `${seatName}|${styleKey}`;

export const loadSeatStats = (user: string | null | undefined): Book => {
  if (!user) return {};
  try {
    const raw = localStorage.getItem(keyFor(user));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const add = (a: PlayerStats = emptyStats(), b: PlayerStats = emptyStats()): PlayerStats => ({
  hands: a.hands + b.hands,
  vpipHands: a.vpipHands + b.vpipHands,
  pfrHands: a.pfrHands + b.pfrHands,
  aggressive: a.aggressive + b.aggressive,
  passive: a.passive + b.passive,
  vpipThisHand: false,
  pfrThisHand: false,
});

// Writes base + this session for every seat in `session`
export const saveSessionStats = (user: string | null | undefined, base: Book, session: Record<string, PlayerStats>) => {
  if (!user) return;
  const book: Book = { ...loadSeatStats(user) };
  Object.entries(session).forEach(([key, stats]) => {
    book[key] = add(base[key], stats);
  });
  try {
    localStorage.setItem(keyFor(user), JSON.stringify(book));
  } catch {
    // Blocked storage: the table still works, the history just isn't kept
  }
};
