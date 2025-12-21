import { GoogleGenAI, Type } from "@google/genai";
import { Card, GamePhase, Player } from "../types";

// Initialize Gemini
// Note: API_KEY must be provided in the environment variables
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface AIDecision {
    action: 'fold' | 'call' | 'raise';
    amount?: number;
    reasoning?: string;
}

const formatCards = (cards: Card[]) => {
    return cards.map(c => `${c.rank}${c.suit}`).join(', ');
};

export const getAIDecision = async (
    activePlayer: Player,
    allPlayers: Player[],
    board: Card[],
    pot: number,
    phase: GamePhase,
    currentHighBet: number,
    bigBlind: number,
    handHistory: string[]
): Promise<AIDecision> => {
    
    const toCall = currentHighBet - activePlayer.currentBet;
    const BIG_BLIND = bigBlind;

    // Filter visible board cards based on phase
    let visibleBoard: Card[] = [];
    if (phase === GamePhase.FLOP) {
        visibleBoard = board.slice(0, 3);
    } else if (phase === GamePhase.TURN) {
        visibleBoard = board.slice(0, 4);
    } else if (phase === GamePhase.RIVER || phase === GamePhase.SHOWDOWN) {
        visibleBoard = board.slice(0, 5);
    }
    // PRE_FLOP: visibleBoard remains empty

    // Calculate players acting behind (simplified estimation)
    const activePlayerIndex = allPlayers.findIndex(p => p.id === activePlayer.id);
    // Create a rotated array starting after the active player
    const rotatedPlayers = [
        ...allPlayers.slice(activePlayerIndex + 1),
        ...allPlayers.slice(0, activePlayerIndex)
    ];
    
    const playersLeftToAct = rotatedPlayers.filter(p => 
        p.status !== 'FOLDED' && 
        p.status !== 'ELIMINATED' && 
        p.status !== 'ALL-IN'
    ).map(p => p.name).join(', ');

    const playersInfo = allPlayers.map(p => {
        const isHero = p.id === activePlayer.id;
        return `
        - Name: ${p.name} ${isHero ? '(YOU - ACTIVE)' : ''}
          Position: ${p.position} ${p.isDealer ? '[BTN]' : ''}
          Stack: $${p.chips}
          Current Bet in Round: $${p.currentBet}
          Status: ${p.status}
        `;
    }).join('\n');

    const historyLog = handHistory.join('\n');

    // Contextual Note for Pre-Flop Blinds
    let preFlopNote = "";
    if (phase === GamePhase.PRE_FLOP) {
        preFlopNote = `
        IMPORTANT PRE-FLOP CONTEXT: 
        - The Small Blind (SB) and Big Blind (BB) have posted forced bets.
        - Unless the Action Log explicitly says "SB calls" or "BB checks", they have NOT acted yet.
        - They still have the option to Raise or Check/Call when action gets to them.
        `;
    }

    const systemInstruction = `
        You are a GTO (Game Theory Optimal) poker expert named ${activePlayer.name}.
        
        Strategic Objectives:
        1. **Range Construction**: Analyze the 'Action Log' to assign ranges to opponents.
           - UTG Raise = Strong Range (TT+, AJs+, KQs).
           - Button Raise = Wide Range.
        
        2. **Pot Odds & Equity**: Calculate if calling is profitable based on the odds.
        
        3. **Position**: Play tighter out of position (SB/BB/UTG) and more aggressive in position (BTN/CO).
           - BEWARE: There are active players behind you: [${playersLeftToAct}].
        
        4. **Bluffing**: 
           - Identify spots where you have "Range Advantage".
           - Do not bluff calling stations.

        Action Rules:
        1. Return ONLY a JSON object.
        2. Action must be "fold", "call", or "raise".
        3. **CHECKING**: If the "Amount you need to Call" is $0, returning "call" means CHECK. Do NOT return an amount for a check.
        4. **RAISING**:
           - "amount" must be the TOTAL bet for the round (Your current bet + chips added).
           - Minimum raise total is usually $${currentHighBet + BIG_BLIND} (unless all-in).
           - Raises must be multiples of ${BIG_BLIND}.
    `;

    const prompt = `
        === GAME STATE ===
        Phase: ${phase}
        Current Pot: $${pot}
        High Bet to Match: $${currentHighBet}
        Amount you need to Call: $${toCall} ${toCall === 0 ? '(This is a CHECK situation)' : ''}
        
        === YOUR INFO ===
        Your Hand: ${formatCards(activePlayer.hand)}
        Your Stack: $${activePlayer.chips}
        Your Position: ${activePlayer.position}

        === COMMUNITY CARDS ===
        ${visibleBoard.length > 0 ? formatCards(visibleBoard) : 'None'}

        === PLAYERS TABLE ===
        ${playersInfo}

        === PLAYERS LEFT TO ACT BEHIND YOU ===
        ${playersLeftToAct || 'None (You are closing action)'}

        ${preFlopNote}

        === ACTION LOG (HISTORY) ===
        ${historyLog}

        Based on the history and GTO principles, make your decision.
    `;

    // --- DEBUG LOGGING ---
    console.log(`%c--- AI PROMPT (${activePlayer.name}) ---`, 'background: #222; color: #bada55', prompt);

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest', // Fast and cheap model
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        action: { type: Type.STRING, enum: ["fold", "call", "raise"] },
                        amount: { type: Type.INTEGER },
                        reasoning: { type: Type.STRING }
                    },
                    required: ["action", "reasoning"]
                }
            }
        });

        const text = response.text;
        if (!text) throw new Error("No response from AI");

        const decision = JSON.parse(text) as AIDecision;
        
        // --- Validation & Safeguards ---

        // 1. Validate Raise Amount
        if (decision.action === 'raise') {
             let validAmount = decision.amount || (currentHighBet * 2);
             
             // Ensure it's at least a min-raise (unless all-in)
             if (validAmount <= currentHighBet) {
                 validAmount = currentHighBet + BIG_BLIND; // min raise add
             }
             
             // Snap to Blind
             validAmount = Math.round(validAmount / BIG_BLIND) * BIG_BLIND;

             // Cap at All-In (Player's total money = chips + currentBet)
             const maxTotal = activePlayer.chips + activePlayer.currentBet;
             if (validAmount > maxTotal) {
                 validAmount = maxTotal;
             }
             
             decision.amount = validAmount;
        }

        // 2. Validate Call/Check
        if (decision.action === 'call') {
            // Ensure no amount is passed for a call/check to prevent confusion in game logic
            delete decision.amount; 
        }

        return decision;

    } catch (error) {
        console.error("AI Error:", error);
        return { action: 'fold', reasoning: "Error in AI service, defaulting to fold." };
    }
};