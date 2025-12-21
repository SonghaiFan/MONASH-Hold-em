import React, { useState } from 'react';
import { ActionButton } from './ActionButton';

interface LoginPageProps {
    onLogin: (username: string) => void;
    isExiting?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, isExiting }) => {
    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleEnter = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!username.trim()) return;
        setIsLoading(true);
        onLogin(username);
    };

    return (
        <div className={`
            w-full h-full relative z-20 flex flex-col items-center justify-center p-6
            transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)]
            ${isExiting ? 'opacity-0 scale-95 blur-sm -translate-y-4' : 'opacity-100 scale-100 translate-y-0'}
        `}>

            <div className="relative z-10 flex flex-col items-center gap-12 max-w-md w-full">
                
                {/* Logo / Title Area */}
                <div className="flex flex-col items-center gap-4 text-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
                    
                    <div>
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 mb-2 font-sans drop-shadow-2xl">
                            MONASH
                        </h1>
                        <h2 className="text-[#d4af37] font-mono tracking-[0.5em] text-xs md:text-sm uppercase pl-1 drop-shadow-lg">
                            Hold'em Protocol
                        </h2>
                    </div>
                </div>

                {/* Login Form */}
                <form onSubmit={handleEnter} className="w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
                    <div className="group relative">
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="ENTER CALLSIGN"
                            className="
                                w-full bg-transparent border-b border-white/10 py-4
                                font-mono text-center text-xl text-white placeholder:text-white/20
                                focus:outline-none focus:border-[#d4af37] transition-all duration-300
                            "
                            autoFocus
                            spellCheck={false}
                        />
                        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-[#d4af37] scale-x-0 group-focus-within:scale-x-100 transition-transform duration-500 ease-out shadow-[0_0_10px_#d4af37]" />
                    </div>

                    <ActionButton 
                        type="submit"
                        variant="gold" 
                        disabled={isLoading || !username.trim()}
                        className="w-full tracking-[0.2em] text-xs py-5 shadow-[0_0_30px_rgba(212,175,55,0.1)] hover:shadow-[0_0_50px_rgba(212,175,55,0.2)]"
                    >
                        {isLoading ? 'AUTHENTICATING...' : 'INITIALIZE SYSTEM'}
                    </ActionButton>
                </form>

                {/* Footer Status */}
                <div className="text-[0.6rem] text-white/20 font-mono tracking-widest uppercase animate-in fade-in duration-1000 delay-500 flex gap-4">
                    <span>Sys v2.4.0</span>
                    <span>•</span>
                    <span>Made by @范不着Frank</span>
                </div>
            </div>
        </div>
    );
};