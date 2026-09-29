import React, { useState, MouseEvent } from "react";
import { Card, Suit } from "../types";

export type CardPreset = "xs" | "sm" | "md" | "lg" | "xl" | "inherit";

interface PlayingCardProps {
    card?: Card;
    hidden?: boolean;
    delay?: number; // Entry animation delay
    flipDelay?: number; // Flip reveal delay
    className?: string;
    style?: React.CSSProperties;
    isWinning?: boolean;
    dimmed?: boolean; // a hand has been decided and this card is not part of it
    size?: CardPreset | number; // Now accepts a number (pixels) or a preset
}

export const PlayingCard: React.FC<PlayingCardProps> = ({
    card,
    hidden,
    delay = 0,
    flipDelay = 0,
    className = "",
    style,
    isWinning,
    dimmed = false,
    size = "md",
}) => {
    // 4-Color Deck Logic
    const getSuitColor = (s?: Suit) => {
        switch (s) {
            case Suit.Hearts:
                return "#dc2626"; // Red
            case Suit.Diamonds:
                return "#603175"; // Purple
            case Suit.Clubs:
                return "#11542a"; // Green
            case Suit.Spades:
                return "#171717"; // Black
            default:
                return "#171717";
        }
    };

    const mainColor = getSuitColor(card?.suit);

    const [dynamicStyle, setDynamicStyle] = useState({
        rotateX: 0,
        rotateY: 0,
        shadowX: 0,
        shadowY: 0.6, // in em conceptually, but applied as px relative to width
        scale: 1,
        transition: "transform 0.4s cubic-bezier(0.19, 1, 0.22, 1)",
    });

    // Determine sizing class or style
    const sizePresets: Record<string, string> = {
        xs: "text-[6px]",
        sm: "text-[8px]",
        md: "text-[10px]",
        lg: "text-[14px]",
        xl: "text-[20px]",
        inherit: "",
    };

    const isNumber = typeof size === "number";
    const sizeClass = isNumber
        ? ""
        : sizePresets[size as string] ?? sizePresets.md;
    const customSizeStyle = isNumber ? { fontSize: `${size}px` } : {};

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
            shadowY: yPct * 15 * shadowScale + 20 * shadowScale,
            scale: 1.05,
            transition: "none",
        });
    };

    const handleMouseLeave = () => {
        setDynamicStyle({
            rotateX: 0,
            rotateY: 0,
            shadowX: 0,
            shadowY: 10, // approximate default
            scale: 1,
            transition: "transform 0.5s cubic-bezier(0.19, 1, 0.22, 1)",
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
                ${isWinning ? "z-40" : "hover:!z-50"}
            `}
            style={{
                perspective: "60em", // Perspective scales with card size
                ...customSizeStyle,
                ...style,
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <div
                className="w-full h-full animate-deal transform-style-3d"
                style={{
                    animationDelay: `${delay}s`,
                    animationFillMode: "both",
                }}
            >
                <div
                    className={`
                        w-full h-full relative transform-style-3d 
                        transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                        ${hidden ? "rotate-y-180" : "rotate-y-0"}
                    `}
                    style={{ transitionDelay: `${flipDelay}s` }}
                >
                    <div
                        className="w-full h-full transform-style-3d will-change-transform"
                        style={{
                            transform: `
                                rotateX(${dynamicStyle.rotateX}deg) 
                                rotateY(${dynamicStyle.rotateY}deg) 
                                scale(${dynamicStyle.scale})
                            `,
                            transition: isWinning
                                ? "transform 0.4s ease-out"
                                : dynamicStyle.transition,
                        }}
                    >
                        {/* === FRONT FACE === */}
                        <div
                            className="absolute inset-0 backface-hidden overflow-hidden rounded-[1.8em] bg-[#fafafa] flex flex-col justify-between px-[1.3em] pt-[1em] pb-[1.3em]"
                            style={{
                                transform: "translateZ(1px)",
                                boxShadow: `0 0.3em 1.2em rgba(0, 0, 0, 0.25), ${dynamicStyle.shadowX}px ${dynamicStyle.shadowY}px 1.5em rgba(0, 0, 0, 0.15)`,
                            }}
                        >
                            <span
                                className="font-['Inter'] font-normal leading-none tracking-tight text-[4.4em]"
                                style={{ color: mainColor }}
                            >
                                {card?.rank}
                            </span>
                            <span
                                className="leading-none text-[3.4em]"
                                style={{ color: mainColor }}
                            >
                                {card?.suit}
                            </span>
                            {/* Greyed out, not see-through: overlapping cards must not show each other */}
                            <div className={`absolute inset-0 bg-black pointer-events-none transition-opacity duration-500 ${dimmed ? "opacity-55" : "opacity-0"}`} />
                        </div>

                        {/* === BACK FACE === */}
                        <div
                            className="absolute inset-0 backface-hidden rounded-[1.8em] overflow-hidden bg-[#fafafa] p-[1em]"
                            style={{
                                transform: "rotateY(180deg) translateZ(1px)",
                                boxShadow: "0 0.3em 1.2em rgba(0, 0, 0, 0.25)",
                            }}
                        >
                            <div className="w-full h-full rounded-[0.9em] card-back-hatch" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
