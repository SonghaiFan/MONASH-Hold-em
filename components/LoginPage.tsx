import React, { useState, useEffect } from 'react';
import { ActionButton } from './ActionButton';
import { PlayingCard } from './PlayingCard';
import { Suit } from '../types';

interface LoginPageProps {
    onLogin: (username: string) => void;
    isExiting?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, isExiting }) => {
    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [systemStatus, setSystemStatus] = useState('• AWAITING INPUT');

    useEffect(() => {
        if (isLoading) {
            setSystemStatus('• AUTHENTICATING...');
        } else if (username.length > 2) {
            setSystemStatus('• IDENTITY DETECTED');
        } else if (username.length > 0) {
             setSystemStatus('• ANALYZING...');
        } else {
            setSystemStatus('• AWAITING INPUT');
        }
    }, [username, isLoading]);

    const handleEnter = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!username.trim()) return;
        setIsLoading(true);
        // Simulate a brief "system check" delay for effect
        setTimeout(() => {
             onLogin(username);
        }, 800);
    };

    return (
        <div className={`
            w-full h-full relative z-20 flex flex-col items-center justify-center p-6
            transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] overflow-hidden
            ${isExiting ? 'opacity-0 scale-95 blur-sm -translate-y-4' : 'opacity-100 scale-100 translate-y-0'}
        `}>
            {/* Cyber Grid Background */}
            <div 
                className="absolute inset-0 pointer-events-none opacity-[0.03]"
                style={{
                    backgroundImage: `linear-gradient(to right, #808080 1px, transparent 1px),
                                      linear-gradient(to bottom, #808080 1px, transparent 1px)`,
                    backgroundSize: '40px 40px',
                    maskImage: 'radial-gradient(circle at center, black 40%, transparent 100%)'
                }}
            />

            {/* 3D Background Cards */}
            <div className="absolute inset-0 pointer-events-none perspective-1000 z-0">
                

                {/* Top Right */}
                <div className="absolute top-[10%] -right-[15%] md:right-[10%] opacity-[0.2] animate-[float-3d-reverse_18s_ease-in-out_infinite]">
                    <div className="transform -rotate-[15deg] scale-90">
                         <PlayingCard 
                            card={{ rank: 'K', suit: Suit.Spades, id: 'bg-jack' }} 
                            size={26}
                            className="shadow-2xl"
                        />
                    </div>
                </div>

                {/* Bottom Foreground */}
                <div className="absolute bottom-[-5%] left-[10%] md:left-[20%] opacity-[0.25] animate-[float-3d-slow_12s_ease-in-out_infinite_reverse]">
                    <div className="transform rotate-[30deg] scale-110">
                        <PlayingCard 
                            card={{ rank: 'A', suit: Suit.Hearts, id: 'bg-ace-h' }} 
                            size={32} // Largest
                            className="shadow-2xl"
                        />
                    </div>
                </div>

            </div>

            <div className="relative z-10 flex flex-col items-center gap-12 max-w-md w-full">
                
                {/* Logo / Title Area */}
                <div className="flex flex-col items-center gap-4 text-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
                    
                    <div className="relative">
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 mb-2 font-sans drop-shadow-2xl">
                            MONASH
                        </h1>
                        <div className="absolute -inset-1 blur-xl bg-white/10 rounded-full opacity-0 animate-pulse delay-1000" />
                        <h2 className="text-[#d4af37] font-mono tracking-[0.5em] text-xs md:text-sm uppercase pl-1 drop-shadow-lg flex items-center justify-center gap-2">
                            <span className="w-1 h-1 bg-[#d4af37] rounded-full inline-block" />
                            Hold'em Protocol
                            <span className="w-1 h-1 bg-[#d4af37] rounded-full inline-block" />
                        </h2>
                    </div>
                </div>

                {/* Login Form */}
                <form onSubmit={handleEnter} className="w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
                    <div className="group relative">
                        <div className="absolute -inset-4 bg-gradient-to-r from-transparent via-white/5 to-transparent rounded-lg opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-md" />
                        
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="ENTER CALLSIGN"
                            className="
                                relative z-10 w-full bg-transparent border-b border-white/10 py-4
                                font-mono text-center text-xl text-white placeholder:text-white/20
                                focus:outline-none focus:border-[#d4af37] transition-all duration-300
                                tracking-wider uppercase
                            "
                            autoFocus
                            spellCheck={false}
                            maxLength={12}
                        />
                        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-[#d4af37] scale-x-0 group-focus-within:scale-x-100 transition-transform duration-500 ease-out shadow-[0_0_10px_#d4af37]" />
                    </div>

                    <div className="flex flex-col gap-4">
                        <ActionButton 
                            type="submit"
                            variant="gold" 
                            disabled={isLoading || !username.trim()}
                            className="w-full tracking-[0.2em] text-xs py-5 shadow-[0_0_30px_rgba(212,175,55,0.1)] hover:shadow-[0_0_50px_rgba(212,175,55,0.2)]"
                        >
                            {isLoading ? 'INITIALIZING...' : 'ESTABLISH LINK'}
                        </ActionButton>

                        <div className="h-4 flex items-center justify-center">
                            <span className={`text-[0.6rem] font-mono tracking-widest uppercase transition-colors duration-300 ${isLoading ? 'text-[#d4af37] animate-pulse' : 'text-white/30'}`}>
                                {systemStatus}
                            </span>
                        </div>
                    </div>
                </form>

                {/* Footer Status */}
                <div className="text-[0.6rem] text-white/20 font-mono tracking-widest uppercase animate-in fade-in duration-1000 delay-500 flex gap-4 border-t border-white/5 pt-4">
                    <span>Sys v2.4.0</span>
                    <span>•</span>
                    <span>Secure Connection</span>
                </div>
            </div>
        </div>
    );
};