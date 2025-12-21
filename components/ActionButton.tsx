import React from 'react';

type Variant = 'gold' | 'red' | 'green' | 'neutral';

interface ActionButtonProps {
    onClick?: () => void;
    children: React.ReactNode;
    variant?: Variant;
    className?: string;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
}

export const ActionButton: React.FC<ActionButtonProps> = ({ 
    onClick, 
    children, 
    variant = 'neutral',
    className = '',
    disabled = false,
    type = 'button'
}) => {
    
    // Config maps for colors
    const config = {
        gold: {
            base: 'text-[#d4af37] border-[#d4af37]/30 hover:border-[#d4af37]',
            fill: 'bg-[#d4af37]',
            hoverText: 'group-hover:text-black'
        },
        red: {
            base: 'text-white/40 border-white/10 hover:border-red-500/50 hover:text-red-400',
            fill: 'bg-red-500',
            hoverText: 'group-hover:text-white'
        },
        green: {
            base: 'text-emerald-400 border-emerald-500/30 hover:border-emerald-400',
            fill: 'bg-emerald-500',
            hoverText: 'group-hover:text-black'
        },
        neutral: {
            base: 'text-white/60 border-white/10 hover:border-white',
            fill: 'bg-white',
            hoverText: 'group-hover:text-black'
        }
    };

    const c = config[variant];

    return (
        <button 
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`
                group relative overflow-hidden flex items-center justify-center
                bg-black/40 backdrop-blur-xl border 
                py-4 rounded-full font-sans text-sm font-bold uppercase tracking-wider 
                transition-all duration-300 shadow-lg
                disabled:opacity-50 disabled:cursor-not-allowed
                ${c.base}
                ${className}
            `}
        >
            <span className={`relative z-10 transition-colors duration-300 ${c.hoverText}`}>
                {children}
            </span>
            <div className={`absolute inset-0 ${c.fill} transform translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0`} />
        </button>
    );
};