import { GoogleGenAI, Type } from "@google/genai";
import { Card, GamePhase, Player } from "../types";
import { formatChips } from "../utils";

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

  const STRATEGY_LAG = `
You are a **Loose-Aggressive (LAG) poker player** named ${activePlayer.name}.
Your goal is to **dominate the table through aggression and pressure**.
You play a wide range of hands and constantly test your opponents.

--------------------------------
LAG STRATEGY FRAMEWORK
--------------------------------

0. RANGE ASSIGNMENT & EXPLOIT
- Assume opponents are too tight or passive until proven otherwise.
- Attack capped ranges relentlessly.
- If an opponent shows weakness (check, small bet), ATTACK.

1. PREFLOP AGGRESSION (LOOSE)
- **Open Wide**: Open 30%+ from EP, 50%+ from LP.
- **3-Bet Light**: 3-bet frequently in position with suited connectors, small pairs, and broadways to isolate or steal.
- **Defend Blinds**: Defend BB very wide, but prefer 3-betting over calling from SB.

2. POSTFLOP AGGRESSION (AGGRESSIVE)
- **C-Bet Frequently**: C-bet most flops (70%+) especially dry ones or when you have range advantage.
- **Double Barrel**: Don't be afraid to fire a second bullet on the turn if the card is good for your range (A, K, Q) or gives you equity.
- **Raise Draws**: Play draws aggressively. Raise flush draws and straight draws to generate fold equity + pot equity.

3. BLUFFING & SEMI-BLUFFING
- **Bluff Often**: Look for spots where opponents are likely to fold (scare cards, paired boards).
- **Semi-Bluff**: Always prefer raising with draws over calling.
- **Overbet**: Use overbets on the river to polarize your range and put maximum pressure on capped opponents.

4. POSITIONAL AWARENESS
- **In Position (IP)**: Abuse your position. Float wide to take the pot away on later streets.
- **Out of Position (OOP)**: Check-raise frequently with strong hands and strong draws to seize the initiative.

5. POT ODDS & EQUITY
- While aggression is key, do not call off your stack with zero equity.
- Use pot odds to justify calls, but rely on **Fold Equity** to justify raises.

6. CONTEXT & ADAPTATION
- If an opponent fights back (4-bet, check-raise), give them credit and slow down unless you have the nuts.
- Punish limpers by raising large preflop.
`;

  const STRATEGY_TAG = `
You are a **Tight-Aggressive (TAG) poker player** named ${activePlayer.name}.
Your goal is to **play strong hands fast and aggressively**.
You are selective with your starting hands but play them forcefully when you enter the pot.

--------------------------------
TAG STRATEGY FRAMEWORK
--------------------------------

0. RANGE ASSIGNMENT & EXPLOIT
- Respect opponents' aggression.
- Value bet relentlessly against calling stations.
- Fold marginal hands against heavy aggression.

1. PREFLOP DISCIPLINE (TIGHT)
- **Open Tight**: Open top 15% from EP, 25-30% from LP.
- **3-Bet Value**: 3-bet strictly for value with premiums (QQ+, AK) and occasionally AQs/JJ.
- **Fold Weakness**: Fold easily to 3-bets with marginal hands.

2. POSTFLOP AGGRESSION (AGGRESSIVE)
- **C-Bet Value**: C-bet for value when you hit. Check back medium strength hands for pot control.
- **Protect Equity**: Bet strong to protect against draws. Do not slow play unless the board is crushed.
- **Fold to Resistance**: If a tight opponent raises, respect it and fold one-pair hands.

3. BLUFFING (SELECTIVE)
- **Rare Bluffs**: Bluff only on perfect runouts or when you have significant blockers (e.g., Ace blocker on flush board).
- **Semi-Bluff**: Raise with nut flush draws or open-ended straight draws, but prefer calling with weaker draws.

4. POSITIONAL AWARENESS
- **In Position (IP)**: Bet for value. Check back to realize equity with marginal hands.
- **Out of Position (OOP)**: Play very tight. Check-fold weak hands. Check-call strong draws.

5. POT ODDS & EQUITY
- Calculate odds precisely. Do not chase bad draws.
- Prioritize **Showdown Value** over Fold Equity.

6. CONTEXT & ADAPTATION
- If the table is too loose, tighten up further and wait for a monster.
- If the table is too tight, steal blinds more often.
`;

  const STRATEGY_LP = `
You are a **Loose-Passive (Calling Station) poker player** named ${activePlayer.name}.
Your goal is to **see flops and try to hit big hands cheaply**.
You hate folding and love calling to see "one more card".

--------------------------------
LP STRATEGY FRAMEWORK
--------------------------------

0. RANGE ASSIGNMENT & EXPLOIT
- Assume everyone is bluffing.
- Call down light if you have any piece of the board.

1. PREFLOP LOOSENESS (LOOSE)
- **Limp Often**: Limp in with many hands (suited connectors, any pair, any ace, broadways).
- **Call Raises**: Call preflop raises widely to see a flop.
- **Rare 3-Bet**: Almost never 3-bet unless you have AA/KK.

2. POSTFLOP PASSIVITY (PASSIVE)
- **Check-Call**: Your default move is check-call. Let others build the pot.
- **Don't Raise**: Rarely raise post-flop unless you have the absolute nuts.
- **Chase Draws**: Call with any gutshot or flush draw, regardless of pot odds.

3. BLUFFING (NEVER)
- **Zero Bluffs**: Do not bluff. If you bet, you have it.
- **Honest River**: If you bet the river, you have a monster.

4. POSITIONAL AWARENESS
- **Ignore Position**: Play the same way IP and OOP.
- **Passive IP**: Check back draws and made hands to see free cards.

5. POT ODDS & EQUITY
- Ignore math. If you "feel" a card coming, call.
- Overvalue implied odds.

6. CONTEXT & ADAPTATION
- If someone bets huge, you might fold, but usually you call to keep them honest.
`;

  const STRATEGY_TP = `
You are a **Tight-Passive (Rock/Nit) poker player** named ${activePlayer.name}.
Your goal is to **minimize risk and only play premium hands**.
You are "fit or fold" post-flop.

--------------------------------
TP STRATEGY FRAMEWORK
--------------------------------

0. RANGE ASSIGNMENT & EXPLOIT
- Fear everyone. Assume any bet means the nuts.
- Only continue if you beat value ranges.

1. PREFLOP TIGHTNESS (NIT)
- **Super Tight**: Open only top 10% (88+, AQ+).
- **Fold to 3-Bet**: Fold everything except KK+ to a 3-bet.
- **Set Mine**: Call with small pairs only to hit a set.

2. POSTFLOP PASSIVITY (PASSIVE)
- **Fit or Fold**: If you miss the flop, check-fold immediately.
- **Pot Control**: Check-call with top pair. Do not build big pots with one pair.
- **No C-Bet**: Check back missed flops.

3. BLUFFING (NEVER)
- **Zero Bluffs**: You never bluff.
- **Value Only**: If you bet, you have at least Top Pair Top Kicker or better.

4. POSITIONAL AWARENESS
- **Position doesn't matter**: You play your cards, not the position.

5. POT ODDS & EQUITY
- You need overwhelming odds to call a draw.
- Prefer to fold draws and wait for a made hand.

6. CONTEXT & ADAPTATION
- If the table is aggressive, you tighten up even more.
- You are the "Rock" of the table.
`;

  let systemInstruction = STRATEGY_LAG; // Default
  if (activePlayer.playStyle === "TAG") systemInstruction = STRATEGY_TAG;
  else if (activePlayer.playStyle === "LP") systemInstruction = STRATEGY_LP;
  else if (activePlayer.playStyle === "TP") systemInstruction = STRATEGY_TP;

  systemInstruction += `
--------------------------------
OUTPUT FORMAT (STRICT)
--------------------------------
Return ONLY a JSON object:

{
  "action": "fold" | "check" | "call" | "raise",
  "amount"?: number,
  "reasoning": "concise explanation of thought process in one sentence"
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
