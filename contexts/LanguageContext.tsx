import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'en' | 'zh';

type Translations = {
  [key in Language]: {
    [key: string]: string;
  };
};

const translations: Translations = {
  en: {
    'app.title': 'GREEN TABLE',
    'app.subtitle': "Play Hold'em Poker with LLM ",
    'system.awaiting': '• AWAITING INPUT',
    'system.authenticating': '• AUTHENTICATING...',
    'system.identity_detected': '• IDENTITY DETECTED',
    'system.analyzing': '• ANALYZING...',
    'login.placeholder': 'ENTER CALLSIGN',
    'login.enter': 'ESTABLISH LINK',
    'login.initializing': 'INITIALIZING...',
    'landing.welcome': 'WELCOME',
    'landing.select_stratum': 'SELECT STRATUM',
    'landing.table_setup': 'TABLE SETUP',
    'landing.player': 'PLAYER',
    'landing.unknown': 'UNKNOWN',
    'landing.buy_in': 'Buy-In',
    'landing.blinds': 'Blinds',
    'landing.tactical_config': 'Tactical Config',
    'landing.total_players_note': 'Total players including you',
    'landing.size.heads_up': 'Heads Up',
    'landing.size.duel': '1v1 Duel',
    'landing.size.6max': '6-Max',
    'landing.size.short_handed': 'Short Handed',
    'landing.size.full_ring': 'Full Ring',
    'landing.size.standard': 'Standard',
    'level.one': 'Entry-Level',
    'level.two': 'Middle-Class',
    'level.three': 'Family-Stability',
    'level.four': 'Old-Money',
    'level.five': 'Top of the Chain',
    'level.name.one': 'FOOTSCRAY COURTS',
    'level.sub.one': 'Inner West',
    'level.name.two': 'BOX HILL CENTRE',
    'level.sub.two': 'Eastern Hub',
    'level.name.three': 'GLEN WAVERLEY',
    'level.sub.three': 'School District',
    'level.name.four': 'BALWYN HILL',
    'level.sub.four': 'Blue-Chip East',
    'level.name.five': 'TOORAK ESTATE',
    'level.sub.five': 'Elite South',
    'action.start': 'START GAME',
    'action.initiate': 'INITIATE',
    'action.back': 'BACK',
    'game.current_bet': 'Current Bet',
    'game.blind_posted': 'Blind Posted',
    'game.next_hand': 'Next Hand',
    'game.rebuy': 'Rebuy Stack',
    'game.victory': 'Victory - Play Again',
    'game.raise_amount': 'Raise Amount',
    'game.total_pot': 'Total Pot',
    'game.main_pot': 'Main',
    'game.side_pot': 'Side',
    'game.fold': 'FOLD',
    'game.check': 'CHECK',
    'game.call': 'CALL',
    'game.raise': 'RAISE',
    'game.all_in': 'ALL IN',
    'game.confirm': 'CONFIRM',
    'game.cancel': 'CANCEL',
    'game.min': 'MIN',
    'game.half_pot': '1/2 POT',
    'game.pot': 'POT',
    'game.loading': 'Loading System...',
    'game.table_initialized': 'Table Initialized',
    'game.im_ready': "I'M READY",
    'game.exit': 'Exit Game',
    'game.status.thinking': 'Thinking...',
    'game.status.busted': 'BUSTED',
    'game.status.bet': 'Bet',
    'game.status.called': 'CALLED',
    'game.status.checked': 'CHECKED',
    'game.status.raised': 'RAISED',
    'game.status.folded': 'FOLDED',
  },
  zh: {
    'app.title': '绿桌子',
    'app.subtitle': '和大型语言模型玩德州扑克',
    'system.awaiting': '• 等待输入',
    'system.authenticating': '• 正在验证...',
    'system.identity_detected': '• 身份已确认',
    'system.analyzing': '• 正在分析...',
    'login.placeholder': '输入代号',
    'login.enter': '建立连接',
    'login.initializing': '正在初始化...',
    'landing.welcome': '欢迎',
    'landing.select_stratum': '选择阶层',
    'landing.table_setup': '牌桌设置',
    'landing.player': '玩家',
    'landing.unknown': '未知',
    'landing.buy_in': '买入',
    'landing.blinds': '盲注',
    'landing.tactical_config': '战术配置',
    'landing.total_players_note': '包括你在内的玩家总数',
    'landing.size.heads_up': '单挑',
    'landing.size.duel': '1v1 对决',
    'landing.size.6max': '6人桌',
    'landing.size.short_handed': '短桌',
    'landing.size.full_ring': '满员桌',
    'landing.size.standard': '标准',
    'level.one': '入门级',
    'level.two': '中产阶级',
    'level.three': '家庭稳定',
    'level.four': '老钱家族',
    'level.five': '顶层阶级',
    'level.name.one': '富茨克雷球场',
    'level.sub.one': '内西区',
    'level.name.two': '博士山中心',
    'level.sub.two': '东部枢纽',
    'level.name.three': '格伦韦弗利',
    'level.sub.three': '学区',
    'level.name.four': '博文山',
    'level.sub.four': '东部蓝筹',
    'level.name.five': '图拉克庄园',
    'level.sub.five': '南部精英',
    'action.start': '开始游戏',
    'action.initiate': '启动',
    'action.back': '返回',
    'game.current_bet': '当前下注',
    'game.blind_posted': '盲注已下',
    'game.next_hand': '下一局',
    'game.rebuy': '补充筹码',
    'game.victory': '胜利 - 再来一局',
    'game.raise_amount': '加注金额',
    'game.total_pot': '总底池',
    'game.main_pot': '主池',
    'game.side_pot': '边池',
    'game.fold': '弃牌',
    'game.check': '过牌',
    'game.call': '跟注',
    'game.raise': '加注',
    'game.all_in': '全押',
    'game.confirm': '确认',
    'game.cancel': '取消',
    'game.min': '最小',
    'game.half_pot': '半池',
    'game.pot': '满池',
    'game.loading': '系统加载中...',
    'game.table_initialized': '牌桌已初始化',
    'game.im_ready': '准备好了',
    'game.exit': '退出游戏',
    'game.status.thinking': '思考中...',
    'game.status.busted': '破产',
    'game.status.bet': '下注',
    'game.status.called': '跟注',
    'game.status.checked': '过牌',
    'game.status.raised': '加注',
    'game.status.folded': '弃牌',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('zh');

  const t = (key: string) => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
