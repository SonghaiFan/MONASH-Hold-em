import { GoogleGenAI, Type } from "@google/genai";
import { Card, GamePhase, Player } from "../types";
import { formatChips } from "../utils";
import { getPlayerStrategy } from "@/constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface AIDecision {
  action: "fold" | "check" | "call" | "raise";
  amount?: number;
  reasoning?: string;
}

const formatCards = (cards: Card[]) =>
  cards.map((c) => `${c.rank}${c.suit}`).join("");

// Helper: Calculate standard Pot Odds
const calculatePotOdds = (toCall: number, currentPot: number): string => {
  if (toCall <= 0) return "0% (Free Check)";
  const finalPot = currentPot + toCall;
  const percentage = (toCall / finalPot) * 100;
  return `${percentage.toFixed(1)}%`;
};

// Helper: Sort players by action order for the current street
const getSortedPlayersByActionOrder = (
  players: Player[],
  dealerIndex: number,
  phase: GamePhase
) => {
  const total = players.length;
  // Pre-flop starts after BB (Dealer + 3), Post-flop starts after Dealer (Dealer + 1)
  const offset = phase === GamePhase.PRE_FLOP ? 3 : 1;
  const startIndex = (dealerIndex + offset) % total;

  const sorted: Player[] = [];
  for (let i = 0; i < total; i++) {
    sorted.push(players[(startIndex + i) % total]);
  }
  return sorted;
};

export const getAIDecision = async (
  activePlayer: Player,
  allPlayers: Player[],
  board: Card[],
  pot: number,
  phase: GamePhase,
  currentHighBet: number,
  bigBlind: number,
  handHistory: string[],
  reasoningHistory: string[] = []
): Promise<AIDecision> => {
  const toCall = currentHighBet - activePlayer.currentBet;
  const potOdds = calculatePotOdds(toCall, pot);
  const stackInBB = (activePlayer.chips / bigBlind).toFixed(1);

  // Filter visible board
  let visibleBoard: Card[] = [];
  if (phase === GamePhase.FLOP) visibleBoard = board.slice(0, 3);
  else if (phase === GamePhase.TURN) visibleBoard = board.slice(0, 4);
  else if (phase === GamePhase.RIVER || phase === GamePhase.SHOWDOWN)
    visibleBoard = board.slice(0, 5);

  // --- 1. Construct Sequential Action List ---
  const dealerIndex = allPlayers.findIndex((p) => p.isDealer);
  const rawActionOrder = getSortedPlayersByActionOrder(
    allPlayers,
    dealerIndex !== -1 ? dealerIndex : 0,
    phase
  );

  // Filter out folded players for the snapshot (Current Table State)
  // We only care about active participants for the current state view.
  const actionOrderPlayers = rawActionOrder.filter(
    (p) => p.status !== "FOLDED"
  );

  // Identify indices for positional tags (Circular to handle round-table context)
  const heroIndex = actionOrderPlayers.findIndex(
    (p) => p.id === activePlayer.id
  );
  const totalPlayers = actionOrderPlayers.length;

  let prevIndex = -1;
  let nextIndex = -1;

  if (totalPlayers > 1) {
    prevIndex = (heroIndex - 1 + totalPlayers) % totalPlayers;
    nextIndex = (heroIndex + 1) % totalPlayers;
  }

  // Build the narrative line for each player
  const actionSequence = actionOrderPlayers
    .map((p, index) => {
      const isHero = p.id === activePlayer.id;
      const role = p.isDealer ? "BTN" : p.position;

      let actionDesc: string = p.status;

      // Detailed Action Descriptions based on Status and Context
      if (p.status === "ELIMINATED") {
        actionDesc = "Eliminated";
      } else if (p.status === "ALL-IN") {
        actionDesc = `All-In ($${formatChips(p.currentBet)})`;
      } else if (
        p.status === "WAITING" ||
        p.status === "THINKING" ||
        p.status === "ACTING"
      ) {
        if (p.currentBet > 0) {
          actionDesc = `Posted Blind/Bet ($${formatChips(
            p.currentBet
          )}) - Yet to Act`;
        } else {
          actionDesc = "Yet to Act";
        }
      } else if (p.status === "CHECKED") {
        actionDesc = "Checked";
      } else if (p.status === "CALLED") {
        actionDesc = `Called ($${formatChips(p.currentBet)})`;
      } else if (p.status === "RAISED") {
        actionDesc = `RAISED to $${formatChips(p.currentBet)}`;
      }

      let marker = "";
      if (isHero) {
        marker = " <---  YOU (DECISION)";
      } else if (index === prevIndex) {
        marker = " <--- PREVIOUS";
      } else if (index === nextIndex) {
        marker = " <--- NEXT";
      }

      return `${role} (${p.name}): [${actionDesc}] | Stack: ${formatChips(
        p.chips
      )}${marker}`;
    })
    .join("\n");

  // --- STRATEGY PROMPTS ---

  let systemInstruction = getPlayerStrategy(activePlayer);

  systemInstruction += `
--------------------------------
OUTPUT FORMAT (STRICT)
--------------------------------
Return ONLY a JSON object:

{
  "action": "fold" | "check" | "call" | "raise",
  "amount"?: number,
  "reasoning": "concise explanation of your thought process in one or two sentences"
}

--------------------------------
RAISE RULES (MANDATORY)
--------------------------------
- Minimum total raise: $${formatChips(currentHighBet + bigBlind)}
    `;

  const prompt = `
=== SITUATION ===
Phase: ${phase}
Pot: $${formatChips(pot)}
To Call: $${formatChips(toCall)}
Pot Odds: ${potOdds}
Your Stack: $${formatChips(activePlayer.chips)} (${stackInBB} BBs)

=== HAND ===
Cards: ${formatCards(activePlayer.hand)}
Board: ${visibleBoard.length ? formatCards(visibleBoard) : "Clean"}

=== FULL HAND HISTORY ===
${handHistory.length > 0 ? handHistory.join("\n") : "No actions yet."}

=== YOUR PREVIOUS REASONING ===
${
  reasoningHistory.length > 0
    ? reasoningHistory.join("\n---\n")
    : "No previous thoughts."
}

=== CURRENT TABLE STATE ===
${actionSequence}

=== DECISION ===
Based on the FULL history (previous streets) and current table state, make a decision consistent with your ${
    activePlayer.playStyle || "LAG"
  } persona.
    `;

  // --- DEBUG LOGGING ---
  console.log(
    `%c--- AI PROMPT (${activePlayer.name}) ---`,
    "background: #222; color: #bada55",
    prompt
  );

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: {
              type: Type.STRING,
              enum: ["fold", "check", "call", "raise"],
            },
            amount: { type: Type.INTEGER },
            reasoning: { type: Type.STRING },
          },
          required: ["action", "reasoning"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const decision = JSON.parse(text) as AIDecision;

    // --- Safeguards ---
    if (decision.action === "raise") {
      let validAmount = decision.amount || currentHighBet * 2;
      if (validAmount <= currentHighBet)
        validAmount = currentHighBet + bigBlind;

      // Snap to Blind
      validAmount = Math.round(validAmount / bigBlind) * bigBlind;

      const maxTotal = activePlayer.chips + activePlayer.currentBet;
      if (validAmount > maxTotal) validAmount = maxTotal;

      decision.amount = validAmount;
    }
    if (decision.action === "call" || decision.action === "check")
      delete decision.amount;

    return decision;
  } catch (error) {
    console.error("AI Error:", error);
    return { action: "fold", reasoning: "Error in AI service." };
  }
};
