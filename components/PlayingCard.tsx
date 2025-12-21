import React, { useState, MouseEvent } from 'react';
import { Card, Suit } from '../types';

export type CardPreset = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'inherit';

interface PlayingCardProps {
    card?: Card;
    hidden?: boolean;
    delay?: number; // Entry animation delay
    flipDelay?: number; // Flip reveal delay
    className?: string;
    style?: React.CSSProperties;
    isWinning?: boolean;
    size?: CardPreset | number; // Now accepts a number (pixels) or a preset
}

export const PlayingCard: React.FC<PlayingCardProps> = ({ 
    card, 
    hidden, 
    delay = 0, 
    flipDelay = 0,
    className = '', 
    style, 
    isWinning,
    size = 'md' 
}) => {
    // 4-Color Deck Logic
    const getSuitColor = (s?: Suit) => {
        switch (s) {
            case Suit.Hearts: return '#dc2626';   // Red
            case Suit.Diamonds: return '#603175'; // Purple
            case Suit.Clubs: return '#11542a';    // Green
            case Suit.Spades: return '#171717';   // Black
            default: return '#171717';
        }
    };

    const mainColor = getSuitColor(card?.suit);

    const [dynamicStyle, setDynamicStyle] = useState({
        rotateX: 0,
        rotateY: 0,
        shadowX: 0,
        shadowY: 0.6, // in em conceptually, but applied as px relative to width
        scale: 1,
        transition: 'transform 0.4s cubic-bezier(0.19, 1, 0.22, 1)'
    });

    // Determine sizing class or style
    const sizePresets: Record<string, string> = {
        xs: 'text-[6px]',  // w=60px
        sm: 'text-[8px]',  // w=80px
        md: 'text-[10px]', // w=100px
        lg: 'text-[14px]', // w=140px
        xl: 'text-[20px]',  // w=200px
        inherit: '' // Empty string allows className (e.g., text-[10px]) or parent font-size to take full effect
    };

    let sizeClass = '';
    let customSizeStyle: React.CSSProperties = {};

    if (typeof size === 'number') {
        // If number, strictly set font-size in px
        customSizeStyle = { fontSize: `${size}px` };
    } else if (sizePresets[size]) {
        sizeClass = sizePresets[size];
    } else {
        sizeClass = sizePresets['md'];
    }

    const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
        if (hidden) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const xPct = (mouseX / width - 0.5) * 2;
        const yPct = (mouseY / height - 0.5) * 2;
        
        const maxTilt = 15;
        // Scale shadow based on card real size to prevent huge shadows on tiny cards
        const shadowScale = width / 100; 

        setDynamicStyle({
            rotateX: -yPct * maxTilt, 
            rotateY: xPct * maxTilt,
            shadowX: -xPct * (15 * shadowScale),
            shadowY: (yPct * 15 * shadowScale) + (20 * shadowScale), 
            scale: 1.05,
            transition: 'none'
        });
    };

    const handleMouseLeave = () => {
        setDynamicStyle({
            rotateX: 0,
            rotateY: 0,
            shadowX: 0,
            shadowY: 10, // approximate default
            scale: 1,
            transition: 'transform 0.5s cubic-bezier(0.19, 1, 0.22, 1)'
        });
    };

    return (
        <div 
            className={`
                group relative select-none
                w-[10em] h-[14em]
                aspect-[5/7] shrink-0
                ${sizeClass}
                ${className}
                ${isWinning ? 'z-40' : 'hover:!z-50'}
            `}
            style={{
                perspective: '60em', // Perspective scales with card size
                ...customSizeStyle,
                ...style
            }} 
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <div 
                className="w-full h-full animate-deal transform-style-3d" 
                style={{ 
                    animationDelay: `${delay}s`,
                    animationFillMode: 'both' 
                }}
            >
                <div 
                    className={`
                        w-full h-full relative transform-style-3d 
                        transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                        ${hidden ? 'rotate-y-180' : 'rotate-y-0'}
                    `}
                    style={{ transitionDelay: `${flipDelay}s` }}
                >
                    <div 
                        className="w-full h-full transform-style-3d will-change-transform"
                        style={{ 
                            transform: `
                                rotateX(${dynamicStyle.rotateX}deg) 
                                rotateY(${dynamicStyle.rotateY}deg) 
                                scale(${isWinning ? 1.2 : dynamicStyle.scale})
                            `,
                            transition: isWinning ? 'transform 0.4s ease-out' : dynamicStyle.transition
                        }}
                    >
                        {/* === FRONT FACE === */}
                        <div className={`
                            absolute inset-0 backface-hidden overflow-hidden
                            rounded-[1em] p-[0.75em]
                            bg-[#fdfdfd] flex flex-col justify-between
                            transition-all duration-300
                            ${isWinning ? 'shadow-[0_0_4em_rgba(212,175,55,0.7)]' : 'shadow-xl'}
                        `}
                        style={{
                            transform: 'translateZ(1px)', 
                            boxShadow: isWinning ? undefined : `
                                0 0.2em 0.3em -0.1em rgba(0, 0, 0, 0.1), 
                                0 0.1em 0.2em -0.1em rgba(0, 0, 0, 0.06),
                                ${dynamicStyle.shadowX}px ${dynamicStyle.shadowY}px 1.5em rgba(0, 0, 0, 0.15)
                            `
                        }}>
                            <div className="absolute inset-0 shadow-[inset_0_0_2em_rgba(0,0,0,0.03)] rounded-[1em] pointer-events-none z-10" />

                            {/* Top Left */}
                            <div className="flex flex-col items-center self-start relative z-10 w-[2em]">
                                <span 
                                    className="font-['Inter'] font-bold text-[3.5em] leading-none tracking-tight"
                                    style={{ color: mainColor }}
                                >
                                    {card?.rank}
                                </span>
                                <span 
                                    className="text-[3em] leading-none mt-[0.1em]"
                                    style={{ color: mainColor }}
                                >
                                    {card?.suit}
                                </span>
                            </div>

                        </div>

                        {/* === BACK FACE === */}
                        <div 
                            className={`
                                absolute inset-0 backface-hidden rounded-[1em] overflow-hidden
                                bg-[#141414] border border-[#222]
                                shadow-xl flex items-center justify-center
                            `}
                            style={{
                                transform: 'rotateY(180deg) translateZ(1px)'
                            }}
                        >
                             <div className="absolute inset-[0.4em] border border-white/[0.03] rounded-[0.6em] pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};