import type { VariableField } from "../api";
export const builtinFields: VariableField[] = [
  // --- You ---
  { path: "you.holeCards", group: "you", example: "A♠ K♥", desc: { en: "Your two cards", zh: "你的两张底牌" } },
  { path: "you.startingHand", group: "you", example: "AKo, top 4% of starting hands", desc: { en: "Your hand as a code, and how it ranks preflop", zh: "起手牌代号，以及在所有起手牌中的排名" } },
  { path: "you.madeHand", group: "you", example: "top pair, good kicker", sometimes: true, desc: { en: "What you have made with the board (after the flop)", zh: "和公共牌组成的牌型（翻牌后才有）" } },
  { path: "you.draws", group: "you", example: '{ draws: ["nut flush draw"], outs: 9, hitNextCardPercent: 19.6 }', sometimes: true, children: ["draws", "outs", "hitNextCardPercent", "hitByRiverPercent"], desc: { en: "Straight and flush draws, with outs and odds to hit (flop and turn)", zh: "顺子、同花听牌，含补牌数和中牌概率（翻牌、转牌）" } },
  { path: "you.position", group: "you", example: "BTN", desc: { en: "Your seat: BTN, SB, BB, UTG, HJ, CO…", zh: "你的位置：BTN、SB、BB、UTG、HJ、CO…" } },
  { path: "you.stack", group: "you", example: "1840", desc: { en: "Chips behind", zh: "你剩余的筹码" } },
  { path: "you.alreadyBetThisStreet", group: "you", example: "20", desc: { en: "What you have put in on this street", zh: "本轮你已经投入的筹码" } },
  { path: "you.name", group: "you", example: "Marcus", desc: { en: "Your name at the table", zh: "你在牌桌上的名字" } },

  // --- The table ---
  { path: "street", group: "table", example: "FLOP", desc: { en: "PRE_FLOP, FLOP, TURN or RIVER", zh: "当前轮次：PRE_FLOP、FLOP、TURN、RIVER" } },
  { path: "board", group: "table", example: "Q♠ 7♥ 2♦", desc: { en: "The community cards (\"none (preflop)\" before the flop)", zh: "公共牌（翻牌前为 \"none (preflop)\"）" } },
  { path: "boardTexture", group: "table", example: "rainbow, disconnected", sometimes: true, desc: { en: "How wet the board is: flush and straight possibilities", zh: "牌面结构：是否可能成同花、顺子" } },
  { path: "pot", group: "table", example: "120", desc: { en: "Chips in the pot, bets on this street included", zh: "底池筹码（含本轮下注）" } },
  { path: "toCall", group: "table", example: "40", desc: { en: "What it costs you to call (0: you can check)", zh: "跟注需要的筹码（0 表示可以过牌）" } },
  { path: "bigBlind", group: "table", example: "20", desc: { en: "The big blind", zh: "大盲注" } },
  { path: "minRaiseTotal", group: "table", example: "80", desc: { en: "The smallest total you may raise to", zh: "最小加注到多少" } },
  { path: "maxBetTotal", group: "table", example: "1860", desc: { en: "The most you can bet in total (all in)", zh: "最多能下注到多少（全下）" } },
  { path: "opponentsInHand", group: "table", example: "2", desc: { en: "How many opponents are still in", zh: "还在牌局中的对手人数" } },

  // --- The maths, worked out in code ---
  { path: "equityPercent", group: "maths", example: "46.2", desc: { en: "Your chance to win at showdown against their estimated ranges", zh: "对抗对手估计范围时，你摊牌获胜的概率" } },
  { path: "equityVsRandomPercent", group: "maths", example: "58.0", desc: { en: "The same against random hands, for reference", zh: "对抗随机手牌的胜率，仅供参考" } },
  { path: "equityMinusPotOdds", group: "maths", example: "21.2", desc: { en: "equityPercent − potOddsPercent: above 0, a call makes money", zh: "胜率减底池赔率：大于 0 说明跟注有利" } },
  { path: "effectiveStackBigBlinds", group: "maths", example: "88", desc: { en: "The stack actually in play against the deepest opponent, in big blinds", zh: "与最深对手之间的有效筹码（大盲数）" } },

  // --- Opponents ---
  { path: "opponentRanges", group: "opponents", example: '[{ name: "Sarah", estimatedRange: "top 12% of starting hands", because: "3-bet preflop" }]', children: ["name", "estimatedRange", "because"], desc: { en: "What each opponent's betting says they hold, and why", zh: "根据下注推断的每位对手手牌范围，以及依据" } },
  { path: "tableInActionOrder", group: "opponents", example: '[{ name, position, status, stack, isYou, reads }]', children: ["name", "position", "status", "stack", "isYou", "reads"], desc: { en: "Everyone still in, in the order they act", zh: "仍在局中的玩家，按行动顺序排列" } },
  { path: "tableInActionOrder[].reads", group: "opponents", example: "{ handsSeen: 42, vpipPercent: 31, pfrPercent: 18, postflopAggressionPercent: 40 }", sometimes: true, children: ["handsSeen", "vpipPercent", "pfrPercent", "postflopAggressionPercent"], desc: { en: "An opponent's HUD: VPIP, PFR, postflop aggression (a note instead under 20 hands)", zh: "对手的 HUD 数据：VPIP、PFR、翻牌后激进度（不足 20 手时只有一句说明）" } },

  // --- History ---
  { path: "handHistory", group: "history", example: '["PRE_FLOP: Sarah (CO) RAISES to $60", "--- FLOP ---", …]', desc: { en: "Every action this hand, in order", zh: "本局到目前为止的每个动作" } },
  { path: "yourEarlierReads", group: "history", example: '["[FLOP] She c-bets wide; call and re-evaluate."]', desc: { en: "Your own reasoning from earlier this hand", zh: "你本局之前几次决策时的思路" } },
];

export const builtinFormulaFields: VariableField[] = [
  { path: "you.stackInBigBlinds", group: "you", example: "92", desc: { en: "Your stack, in big blinds", zh: "剩余筹码折合多少个大盲" } },
  { path: "potOddsPercent", group: "maths", example: "25.0", desc: { en: "The equity a call needs to break even", zh: "跟注不亏所需的最低胜率" } },
  { path: "minimumDefenseFrequencyPercent", group: "maths", example: "67", sometimes: true, desc: { en: "Facing a bet: how often your range must continue", zh: "面对下注时，你的范围至少要继续的比例" } },
  { path: "stackToPotRatio", group: "maths", example: "4.3", desc: { en: "Stack ÷ pot: under ~3, top pair can play for stacks", zh: "筹码与底池之比：低于约 3 时顶对可以打光" } },
];
