// The player's wealth across sessions. Buy-ins come out of it, whatever is
// left on the table goes back into it, and venues whose buy-in it cannot
// cover stay locked. Stored per player name in localStorage.

export const STARTING_WEALTH = 500;

const keyFor = (name: string) => `franks-holdem:bankroll:${name.trim().toLowerCase()}`;

export const loadWealth = (name: string): number => {
  try {
    const raw = localStorage.getItem(keyFor(name));
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : STARTING_WEALTH;
  } catch {
    return STARTING_WEALTH;
  }
};

export const saveWealth = (name: string, amount: number) => {
  try {
    localStorage.setItem(keyFor(name), String(Math.max(0, Math.round(amount))));
  } catch {
    // Private mode or blocked storage: the session still works, it just won't persist
  }
};
