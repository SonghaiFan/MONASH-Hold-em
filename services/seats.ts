// The opponents a player has set up in the lobby — who sits down, on which
// model, with what strategy and prompt. Stored per player name next to the
// bankroll, so a table you have tuned is still there next visit.

import { AI_MODELS, AI_NAMES } from "../constants";
import { chatPromptTemplate, modelKindFor } from "./aiProviders";
import { StylePoint } from "./style";

export interface SeatSettings {
  id: string; // the opponent's name; also seeds their face
  model: string; // preferred model; a venue that doesn't serve it substitutes one it does
  strategy: string; // "RAW", a PERSONAS key, or "CUSTOM" (then `style` is its point)
  style?: StylePoint;
  prompt: string; // legacy strategy instructions; retained for saved-browser compatibility
  chatPrompt?: string; // complete editable system-prompt template
  decisionsPrompt?: string; // JEV action instructions
}

export const NATURAL = "RAW";

export const defaultSeat = (i: number, taken: string[] = []): SeatSettings => ({
  id: AI_NAMES.find((n) => !taken.includes(n)) ?? `AI ${i + 1}`,
  model: AI_MODELS[i % AI_MODELS.length].id,
  strategy: NATURAL,
  prompt: "",
});

export const defaultSeats = (count: number): SeatSettings[] =>
  Array.from({ length: count }).reduce<SeatSettings[]>(
    (seats, _, i) => [...seats, defaultSeat(i, seats.map((s) => s.id))],
    []
  );

const keyFor = (name: string) => `franks-holdem:seats:${name.trim().toLowerCase()}`;

export const loadSeats = (name: string | null): SeatSettings[] | null => {
  if (!name) return null;
  try {
    const raw = localStorage.getItem(keyFor(name));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed
      .filter((s) => s && typeof s.id === "string" && typeof s.model === "string")
      .map((s) => ({
        id: s.id,
        model: s.model,
        strategy: typeof s.strategy === "string" ? s.strategy : NATURAL,
        ...(s.style && typeof s.style.x === "number" && typeof s.style.y === "number" ? { style: { x: s.style.x, y: s.style.y } } : {}),
        prompt: typeof s.prompt === "string" ? s.prompt : "",
        ...(typeof s.chatPrompt === "string" ? { chatPrompt: s.chatPrompt } : {}),
        ...(typeof s.decisionsPrompt === "string" ? { decisionsPrompt: s.decisionsPrompt } : {}),
      }));
  } catch {
    return null;
  }
};

export const saveSeats = (name: string | null, seats: SeatSettings[]) => {
  if (!name) return;
  try {
    localStorage.setItem(keyFor(name), JSON.stringify(seats));
  } catch {
    // Blocked storage: the table still works this visit, it just won't be remembered
  }
};

export const promptForModel = (seat: SeatSettings, modelId: string): string => {
  if (modelKindFor(modelId) === "decisions") {
    return seat.decisionsPrompt !== undefined ? seat.decisionsPrompt : seat.prompt;
  }
  if (seat.chatPrompt !== undefined) return seat.chatPrompt;
  return seat.prompt.trim() ? chatPromptTemplate(seat.prompt) : "";
};

export const withPromptForModel = (seat: SeatSettings, modelId: string, prompt: string): SeatSettings =>
  modelKindFor(modelId) === "decisions"
    ? { ...seat, decisionsPrompt: prompt }
    : { ...seat, chatPrompt: prompt };
