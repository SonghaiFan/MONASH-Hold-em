import React from 'react';

interface SliderProps {
    min: number;
    max: number;
    step?: number;
    value: number;
    onChange: (value: number) => void;
    className?: string;
    disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({ 
    min, 
    max, 
    step = 1, 
    value, 
    onChange, 
    className = '',
    disabled = false
}) => {
    return (
        <input 
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
            disabled={disabled}
            className={`
                w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer focus:outline-none touch-none
                disabled:opacity-50 disabled:cursor-not-allowed
                
                /* Thumb Styles - Webkit */
                [&::-webkit-slider-thumb]:appearance-none 
                [&::-webkit-slider-thumb]:w-6 
                [&::-webkit-slider-thumb]:h-6
                [&::-webkit-slider-thumb]:rounded-full 
                [&::-webkit-slider-thumb]:bg-[#d4af37]
                [&::-webkit-slider-thumb]:shadow-[0_0_15px_rgba(212,175,55,0.4)]
                [&::-webkit-slider-thumb]:border-none
                /* Removed transition-all here to prevent drag lag */
                [&::-webkit-slider-thumb]:active:scale-110
                
                /* Thumb Styles - Firefox */
                [&::-moz-range-thumb]:w-6 
                [&::-moz-range-thumb]:h-6
                [&::-moz-range-thumb]:rounded-full 
                [&::-moz-range-thumb]:bg-[#d4af37]
                [&::-moz-range-thumb]:border-none
                [&::-moz-range-thumb]:active:scale-110
                
                ${className}
            `}
        />
    );
};