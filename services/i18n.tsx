import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Language = "en" | "zh";

export interface Translations {
  langName: string;
  gameTitle: string;
  gameSubtitle: string;
  madeBy: string;
  sysVersion: string;

  login: {
    title: string;
    namePlaceholder: string;
    play: string;
  };

  setup: {
    title: string;
    unknown: string;
    brokeTitle: (wealth: number) => string;
    brokeDesc: (stake: number) => string;
    takeStake: string;
    selectVenue: string;
    buyIn: string;
    blinds: string;
    locked: (amount: number) => string;
    lockedTooltip: (buyIn: number, wealth: number) => string;
    atTheTable: string;
    nobodyYet: string;
    handed: (count: number) => string;
    menuTitle: (name: string) => string;
    providersCount: (count: number) => string;
    menuOrderTip: string;
    menuLockedTip: string;
    seatSomeone: (model: string) => string;
    sendHome: (model: string) => string;
    seatOneMore: (model: string) => string;
    btnLocked: (need: number, have: number) => string;
    btnSeatFirst: string;
    btnDeal: (players: number, venue: string) => string;
    tableSize: string;
    playersCount: (n: number) => string;
    opponents: string;
    startGame: string;
    bankroll: string;
    stakes: string;
    yourTable: string;
    holdToEdit: string;
    tapToOpen: string;
    sitDown: (buyIn: number) => string;
    venueLine: (buyIn: number, small: number, big: number) => string;
    takeStakeAmount: (stake: number) => string;
    lockedCta: (need: number, have: number) => string;
    removeSeat: string;
    addSeat: string;
  };

  seat: {
    model: string;
    strategy: string;
    prompt: string;
    promptPlaceholder: string;
    promptNote: string;
    done: string;
    customPrompt: string;
    offMenu: string;
    defaultTag: string;
    editedTag: string;
    restoreDefault: string;
    targets: (vpip: number, pfr: number) => string;
  };

  hud: {
    hands: (n: number) => string;
    vpipHint: string;
    pfrHint: string;
    afqHint: string;
    target: (pct: number) => string;
    tooFew: string;
    natural: string;
    chart: string;
  };

  desk: {
    blinds: string;
    hands: string;
    session: string;
    seats: string;
    you: string;
    yourTurn: string;
    openStats: string;
    handLog: string;
    logEmpty: string;
    phases: Record<string, string>;
    venueMenu: string;
    venueStake: string;
  };

  venues: Record<
    string,
    {
      name: string;
      sub: string;
      desc: string;
    }
  >;

  game: {
    exitTitle: string;
    tableReady: string;
    imReady: string;
    totalPot: string;
    loading: string;
    busted: string;
    bet: string;
    peekCards: string;
    hideCards: string;
    thinking: string;
    currentBet: string;
    blindPosted: string;
    nextHand: string;
    skipHand: string;
    swipeToFold: string;
    rebuyStack: string;
    brokeLeave: string;
    victoryPlayAgain: string;
    raiseAmount: string;
    allIn: string;
    minLabel: string;
    maxLabel: string;
    quickMin: string;
    quickHalfPot: string;
    quickPot: string;
    quickAllIn: string;
    cancel: string;
    confirmRaise: string;
    fold: string;
    call: string;
    check: string;
    raise: string;
    actions: {
      check: string;
      checked: string;
      call: string;
      called: string;
      raise: string;
      raised: string;
      fold: string;
      folded: string;
      allIn: string;
      waiting: string;
    };
    handRanks: {
      royalFlush: string;
      straightFlush: string;
      fourOfAKind: string;
      fullHouse: string;
      flush: string;
      straight: string;
      threeOfAKind: string;
      twoPair: string;
      pair: string;
      highCard: string;
      opponentsFolded: string;
      splitPot: (hand: string) => string;
    };
  };

  personas: Record<
    string,
    {
      label: string; // short tag, e.g. at the table
      name: string; // spelled out, in the lobby
      desc: string;
    }
  >;
}

export const translations: Record<Language, Translations> = {
  en: {
    langName: "English",
    gameTitle: "Frankie Hold'em",
    gameSubtitle: "Frank's Hold'em",
    madeBy: "Made by 范不着Frank",
    sysVersion: "Sys v1.0.0",

    login: {
      title: "Frankie Hold'em",
      namePlaceholder: "Your name",
      play: "Play",
    },

    setup: {
      title: "TABLE SETUP",
      unknown: "UNKNOWN",
      brokeTitle: (wealth) => `You're down to ${wealth.toLocaleString()} — not enough for any table.`,
      brokeDesc: (stake) => `The house will stake you back to $${stake.toLocaleString()}.`,
      takeStake: "Take the stake",
      selectVenue: "Select Venue",
      buyIn: "Buy-In",
      blinds: "Blinds",
      locked: (amount) => `Locked · $${amount.toLocaleString()}`,
      lockedTooltip: (buyIn, wealth) =>
        `Buy-in $${buyIn.toLocaleString()} · you have $${wealth.toLocaleString()} · look, but you can't sit down`,
      atTheTable: "At the table",
      nobodyYet: "Nobody yet",
      handed: (count) => `${count}-handed`,
      menuTitle: (name) => `Menu · ${name}`,
      providersCount: (count) => (count === 1 ? "One provider here" : `${count} providers here`),
      menuOrderTip: " · order one, someone sits down with it",
      menuLockedTip: " · just looking: this room is above your bankroll",
      seatSomeone: (model) => `Seat someone on ${model}`,
      sendHome: (model) => `Send one ${model} player home`,
      seatOneMore: (model) => `Seat one more on ${model}`,
      btnLocked: (need, have) => `LOCKED · NEED $${need.toLocaleString()} · YOU HAVE $${have.toLocaleString()}`,
      btnSeatFirst: "SEAT SOMEONE FIRST",
      btnDeal: (players, venue) => `DEAL · ${players} PLAYERS · ${venue}`,
      tableSize: "Seats",
      playersCount: (n) => `${n} players`,
      opponents: "Opponents",
      startGame: "START GAME",
      bankroll: "Bankroll",
      stakes: "Stakes",
      yourTable: "Your table",
      holdToEdit: "Press and hold an opponent to change how they play",
      tapToOpen: "Tap the faces to see who you're playing",
      sitDown: (buyIn) => `Sit down · ${buyIn.toLocaleString()} buy-in`,
      venueLine: (buyIn, small, big) =>
        `${buyIn.toLocaleString()} buy-in · ${small.toLocaleString()}/${big.toLocaleString()} blinds`,
      takeStakeAmount: (stake) => `Take the stake · ${stake.toLocaleString()}`,
      lockedCta: (need, have) => `Needs ${need.toLocaleString()} · you have ${have.toLocaleString()}`,
      removeSeat: "One fewer opponent",
      addSeat: "One more opponent",
    },

    seat: {
      model: "Model",
      strategy: "Strategy",
      prompt: "Prompt",
      promptPlaceholder: "How should they play? e.g. You're a retired pro who can't stand limpers.",
      promptNote: "What this AI is told before every decision. Change it and only this AI thinks differently.",
      done: "Done",
      customPrompt: "Prompt edited",
      offMenu: "Not served here",
      defaultTag: "Default",
      editedTag: "Edited",
      restoreDefault: "Restore default",
      targets: (vpip, pfr) => `Plays about ${vpip}% of hands, raises ${pfr}% before the flop`,
    },

    hud: {
      hands: (n) => (n === 1 ? "1 hand" : `${n} hands`),
      vpipHint: "Puts money in before the flop",
      pfrHint: "Raises before the flop",
      afqHint: "Bets or raises after the flop",
      target: (pct) => `target ${pct}%`,
      tooFew: "Too few hands to tell yet",
      natural: "No targets: the model decides every street",
      chart: "Preflop follows the hand chart; the model takes over from the flop",
    },

    desk: {
      blinds: "Blinds",
      hands: "Hands",
      session: "vs buy-in",
      seats: "Seats",
      you: "You",
      yourTurn: "Your turn",
      openStats: "Open stats",
      handLog: "This hand",
      logEmpty: "Nothing yet — the first action shows here.",
      phases: { PRE_FLOP: "Preflop", FLOP: "Flop", TURN: "Turn", RIVER: "River", SHOWDOWN: "Showdown" },
      venueMenu: "Models served here",
      venueStake: "Stakes",
    },

    venues: {
      footscray: {
        name: "Footscray Courts",
        sub: "Inner West",
        desc: "Entry-Level",
      },
      boxhill: {
        name: "Box Hill Centre",
        sub: "Eastern Hub",
        desc: "Middle-Class",
      },
      glen: {
        name: "Glen Waverley",
        sub: "School District",
        desc: "Family-Stability",
      },
      balwyn: {
        name: "Balwyn Hill",
        sub: "Blue-Chip East",
        desc: "Old Money",
      },
      toorak: {
        name: "Toorak Estate",
        sub: "Elite South",
        desc: "Top of the Chain",
      },
    },

    game: {
      exitTitle: "Exit Game",
      tableReady: "Table ready",
      imReady: "I'm ready",
      totalPot: "Total Pot",
      loading: "Loading System...",
      busted: "BUSTED",
      bet: "Bet",
      peekCards: "Peek Cards",
      hideCards: "Hide Cards",
      thinking: "Thinking...",
      currentBet: "Current Bet",
      blindPosted: "Blind Posted",
      nextHand: "Next hand",
      skipHand: "Skip hand",
      swipeToFold: "Swipe up to fold",
      rebuyStack: "Rebuy",
      brokeLeave: "Broke · leave the table",
      victoryPlayAgain: "You won · play again",
      raiseAmount: "Raise Amount",
      allIn: "All in",
      minLabel: "Min:",
      maxLabel: "Max:",
      quickMin: "min",
      quickHalfPot: "½ Pot",
      quickPot: "Pot",
      quickAllIn: "All in",
      cancel: "Cancel",
      confirmRaise: "Confirm Raise",
      fold: "Fold",
      call: "Call",
      check: "Check",
      raise: "Raise",
      actions: {
        check: "Check",
        checked: "CHECKED",
        call: "Call",
        called: "CALLED",
        raise: "Raise",
        raised: "RAISED",
        fold: "Fold",
        folded: "FOLDED",
        allIn: "All in",
        waiting: "WAITING",
      },
      handRanks: {
        royalFlush: "Royal Flush",
        straightFlush: "Straight Flush",
        fourOfAKind: "Four of a Kind",
        fullHouse: "Full House",
        flush: "Flush",
        straight: "Straight",
        threeOfAKind: "Three of a Kind",
        twoPair: "Two Pair",
        pair: "Pair",
        highCard: "High Card",
        opponentsFolded: "Opponents folded",
        splitPot: (hand) => `Split Pot (${hand})`,
      },
    },

    personas: {
      RAW: { label: "", name: "Natural", desc: "Plays exactly as the model judges the spot, nothing added" },
      TAG: { label: "TAG", name: "Tight-aggressive", desc: "Tight-aggressive regular: solid ranges, bets for value" },
      LAG: { label: "LAG", name: "Loose-aggressive", desc: "Loose-aggressive: plays many hands, applies pressure" },
      NIT: { label: "NIT", name: "Nit", desc: "The rock: folds almost everything, only premiums" },
      STATION: { label: "STN", name: "Calling station", desc: "Calling station: rarely folds, pays you off" },
      MANIAC: { label: "MNC", name: "Maniac", desc: "Maniac: raises everything, overbets aggressively" },
      FISH: { label: "FSH", name: "Recreational", desc: "Recreational: unpredictable, chases draws" },
    },
  },

  zh: {
    langName: "中文",
    gameTitle: "Frankie Hold'em",
    gameSubtitle: "弗兰克德州扑克",
    madeBy: "由 范不着Frank 制作",
    sysVersion: "系统版本 v1.0.0",

    login: {
      title: "Frankie Hold'em",
      namePlaceholder: "你的名字",
      play: "开始",
    },

    setup: {
      title: "牌桌配置",
      unknown: "未知特工",
      brokeTitle: (wealth) => `资金仅剩 ${wealth.toLocaleString()} — 不足以进入任何牌桌。`,
      brokeDesc: (stake) => `庄家将资助你重置至初始筹码 $${stake.toLocaleString()}。`,
      takeStake: "领取庄家资助",
      selectVenue: "选择场次",
      buyIn: "买入",
      blinds: "盲注",
      locked: (amount) => `未解锁 · $${amount.toLocaleString()}`,
      lockedTooltip: (buyIn, wealth) =>
        `买入需 $${buyIn.toLocaleString()} · 当前持有 $${wealth.toLocaleString()} · 筹码不足，暂不可入座`,
      atTheTable: "当前牌桌",
      nobodyYet: "暂无对手",
      handed: (count) => `${count}人桌`,
      menuTitle: (name) => `阵容菜单 · ${name}`,
      providersCount: (count) => (count === 1 ? "当前场次提供 1 款模型" : `当前场次提供 ${count} 款模型`),
      menuOrderTip: " · 点击添加一位对手入座",
      menuLockedTip: " · 仅供预览：该场次超出你的资金",
      seatSomeone: (model) => `添加一名 ${model} 对手入座`,
      sendHome: (model) => `请离一名 ${model} 对手`,
      seatOneMore: (model) => `再添加一名 ${model} 对手`,
      btnLocked: (need, have) => `未解锁 · 需 $${need.toLocaleString()} · 当前仅有 $${have.toLocaleString()}`,
      btnSeatFirst: "请先添加至少一位对手",
      btnDeal: (players, venue) => `开局 · ${players} 人桌 · ${venue}`,
      tableSize: "人数",
      playersCount: (n) => `${n} 人桌`,
      opponents: "对手阵容",
      startGame: "开始游戏",
      bankroll: "可用资金",
      stakes: "盲注级别",
      yourTable: "你的牌桌",
      holdToEdit: "长按对手，调整他们的打法",
      tapToOpen: "点开头像，看看你的对手",
      sitDown: (buyIn) => `入座 · 买入 ${buyIn.toLocaleString()}`,
      venueLine: (buyIn, small, big) =>
        `买入 ${buyIn.toLocaleString()} · 盲注 ${small.toLocaleString()}/${big.toLocaleString()}`,
      takeStakeAmount: (stake) => `领取资助 · ${stake.toLocaleString()}`,
      lockedCta: (need, have) => `需要 ${need.toLocaleString()} · 你只有 ${have.toLocaleString()}`,
      removeSeat: "减少一位对手",
      addSeat: "增加一位对手",
    },

    seat: {
      model: "模型",
      strategy: "策略",
      prompt: "提示词",
      promptPlaceholder: "他该怎么打？例如：你是一位退役职业牌手，最看不惯溜进底池的人。",
      promptNote: "每次做决定前，模型都会读到这段话。改动只影响这一位 AI。",
      done: "完成",
      customPrompt: "提示词已修改",
      offMenu: "本场不提供",
      defaultTag: "默认",
      editedTag: "已修改",
      restoreDefault: "恢复默认",
      targets: (vpip, pfr) => `约 ${vpip}% 的牌入池，翻牌前加注约 ${pfr}%`,
    },

    hud: {
      hands: (n) => `${n} 手`,
      vpipHint: "翻牌前主动投入筹码",
      pfrHint: "翻牌前加注",
      afqHint: "翻牌后下注或加注",
      target: (pct) => `目标 ${pct}%`,
      tooFew: "手数太少，还看不出来",
      natural: "没有目标值：每条街都由模型决定",
      chart: "翻牌前按起手牌表出牌，翻牌后交给模型",
    },

    desk: {
      blinds: "盲注",
      hands: "手数",
      session: "较买入",
      seats: "座位",
      you: "你",
      yourTurn: "轮到你",
      openStats: "查看数据",
      handLog: "本局",
      logEmpty: "还没有动作，第一个行动会出现在这里。",
      phases: { PRE_FLOP: "翻牌前", FLOP: "翻牌", TURN: "转牌", RIVER: "河牌", SHOWDOWN: "摊牌" },
      venueMenu: "本场提供的模型",
      venueStake: "级别",
    },

    venues: {
      footscray: {
        name: "Footscray 街头球场",
        sub: "墨尔本内西区",
        desc: "新手入门",
      },
      boxhill: {
        name: "Box Hill 商业中心",
        sub: "华人商圈核心",
        desc: "中产常规局",
      },
      glen: {
        name: "Glen Waverley 名区",
        sub: "顶尖学区豪杰",
        desc: "稳健富足局",
      },
      balwyn: {
        name: "Balwyn Hill 博温高地",
        sub: "传统老牌东区",
        desc: "老钱暗局",
      },
      toorak: {
        name: "Toorak 顶级庄园",
        sub: "顶级富豪之巅",
        desc: "天花板决战",
      },
    },

    game: {
      exitTitle: "离开牌桌",
      tableReady: "牌局已就绪",
      imReady: "准备就绪",
      totalPot: "总底池",
      loading: "系统加载中...",
      busted: "出局",
      bet: "下注",
      peekCards: "查看手牌",
      hideCards: "收起手牌",
      thinking: "思考中...",
      currentBet: "当前下注",
      blindPosted: "盲注",
      nextHand: "下一局",
      skipHand: "跳过本局",
      swipeToFold: "上滑弃牌",
      rebuyStack: "补充筹码",
      brokeLeave: "筹码耗尽 · 离开牌桌",
      victoryPlayAgain: "大获全胜 · 再来一局",
      raiseAmount: "加注金额",
      allIn: "全下",
      minLabel: "最小:",
      maxLabel: "最大:",
      quickMin: "最小",
      quickHalfPot: "半池",
      quickPot: "满池",
      quickAllIn: "全下",
      cancel: "取消",
      confirmRaise: "确认加注",
      fold: "弃牌",
      call: "跟注",
      check: "过牌",
      raise: "加注",
      actions: {
        check: "过牌",
        checked: "已过牌",
        call: "跟注",
        called: "已跟注",
        raise: "加注",
        raised: "已加注",
        fold: "弃牌",
        folded: "已弃牌",
        allIn: "全下",
        waiting: "等待中",
      },
      handRanks: {
        royalFlush: "皇家同花顺",
        straightFlush: "同花顺",
        fourOfAKind: "四条",
        fullHouse: "葫芦",
        flush: "同花",
        straight: "顺子",
        threeOfAKind: "三条",
        twoPair: "两对",
        pair: "一对",
        highCard: "高牌",
        opponentsFolded: "对手全部弃牌",
        splitPot: (hand) => `平分底池 (${hand})`,
      },
    },

    personas: {
      RAW: { label: "", name: "本色", desc: "完全按模型自己对局面的判断出牌，不加修饰" },
      TAG: { label: "稳凶", name: "紧凶", desc: "紧凶型常规选手：范围坚实，注重价值下注" },
      LAG: { label: "松凶", name: "松凶", desc: "松凶型激进选手：范围宽泛，施压频繁，善于诈唬" },
      NIT: { label: "岩石", name: "岩石", desc: "极紧型岩石选手：弃牌率极高，仅拿超强牌上桌" },
      STATION: { label: "跟注站", name: "跟注站", desc: "跟注站：极少弃牌，极少加注，买牌到底" },
      MANIAC: { label: "狂热", name: "疯子", desc: "疯狂狂热者：无脑加注，超池重注，刀尖舔血" },
      FISH: { label: "娱乐", name: "娱乐玩家", desc: "娱乐型玩家：走位飘忽，沉迷听牌，易受情绪影响" },
    },
  },
};

const LANG_STORAGE_KEY = "franks-holdem:lang";

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: Translations;
  translateHand: (desc: string) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === "en" || saved === "zh") return saved;
      if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("zh")) {
        return "zh";
      }
    } catch {
      // ignore
    }
    return "en";
  });

  const setLang = (nextLang: Language) => {
    setLangState(nextLang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, nextLang);
    } catch {
      // ignore
    }
  };

  const toggleLang = () => {
    setLang(lang === "en" ? "zh" : "en");
  };

  const t = translations[lang];

  const translateHand = (desc: string): string => {
    if (!desc) return "";
    if (desc === "Opponents Folded") return t.game.handRanks.opponentsFolded;
    if (lang === "en") return desc;

    // Check for "Split Pot (...)"
    const splitMatch = desc.match(/^Split Pot \((.*)\)$/);
    if (splitMatch) {
      const innerTranslated = translateHand(splitMatch[1]);
      return t.game.handRanks.splitPot(innerTranslated);
    }

    const rankMap: Record<string, string> = {
      "Royal Flush": t.game.handRanks.royalFlush,
      "Straight Flush": t.game.handRanks.straightFlush,
      "Four of a Kind": t.game.handRanks.fourOfAKind,
      "Full House": t.game.handRanks.fullHouse,
      Flush: t.game.handRanks.flush,
      Straight: t.game.handRanks.straight,
      "Three of a Kind": t.game.handRanks.threeOfAKind,
      "Two Pair": t.game.handRanks.twoPair,
      Pair: t.game.handRanks.pair,
      "High Card": t.game.handRanks.highCard,
    };

    return rankMap[desc] || desc;
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      document.title = t.gameTitle;
    }
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t, translateHand }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
};
