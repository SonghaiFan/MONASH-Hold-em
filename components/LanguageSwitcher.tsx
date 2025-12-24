import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

export const LanguageSwitcher: React.FC = () => {
    const { language, setLanguage } = useLanguage();

    return (
        <div className="fixed top-4 right-4 z-50 flex gap-2 font-mono">
            <button
                onClick={() => setLanguage('en')}
                className={`px-2 py-1 text-xs border transition-colors ${
                    language === 'en' 
                        ? 'border-[#d4af37] text-[#d4af37] bg-[#d4af37]/10' 
                        : 'border-white/10 text-white/40 hover:text-white hover:border-white/30'
                }`}
            >
                EN
            </button>
            <button
                onClick={() => setLanguage('zh')}
                className={`px-2 py-1 text-xs border transition-colors ${
                    language === 'zh' 
                        ? 'border-[#d4af37] text-[#d4af37] bg-[#d4af37]/10' 
                        : 'border-white/10 text-white/40 hover:text-white hover:border-white/30'
                }`}
            >
                中文
            </button>
        </div>
    );
};
