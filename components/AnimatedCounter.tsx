import React, { useEffect, useState, useRef } from 'react';
import { formatChips } from '../utils';

interface AnimatedCounterProps {
    value: number;
    prefix?: string;
    className?: string;
    highlightColor?: string;
}

// Cubic ease-out for a smooth "mechanical" stop feel
const easeOutCubic = (x: number): number => {
    return 1 - Math.pow(1 - x, 3);
};

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({ 
    value, 
    prefix = '', 
    className = '',
    highlightColor = '#d4af37' // Gold default
}) => {
    const [displayValue, setDisplayValue] = useState(value);
    const [isAnimating, setIsAnimating] = useState(false);
    const [trend, setTrend] = useState<'up' | 'down' | 'neutral'>('neutral');
    const [dynamicScale, setDynamicScale] = useState(1);
    
    const startValue = useRef(value);
    const startTime = useRef<number | null>(null);
    const reqId = useRef<number | null>(null);
    const durationRef = useRef(800);

    useEffect(() => {
        // If value hasn't effectively changed, do nothing
        if (value === displayValue) return;

        const delta = value - displayValue;
        const absDelta = Math.abs(delta);
        const isUp = delta > 0;

        // Determine direction
        setTrend(isUp ? 'up' : 'down');
        setIsAnimating(true);

        // --- Dynamic Calculation ---
        
        // Duration: Logarithmic scaling based on magnitude.
        // Small change (10) -> ~800ms
        // Large change (10,000) -> ~2000ms
        // Cap at 3 seconds max.
        const calculatedDuration = Math.min(3000, 600 + Math.log10(Math.max(1, absDelta)) * 350);
        durationRef.current = calculatedDuration;

        // Scale: Only applied when Increasing.
        // Base 1.1x. Add 0.08x per power of 10.
        // Delta 100 -> ~1.26x
        // Delta 10,000 -> ~1.4x
        // Cap at 1.4x
        const targetScale = isUp 
            ? Math.min(1.4, 1.1 + Math.log10(Math.max(1, absDelta)) * 0.08)
            : 1;

        setDynamicScale(targetScale);

        startValue.current = displayValue;
        startTime.current = null;

        const animate = (timestamp: number) => {
            if (!startTime.current) startTime.current = timestamp;
            const runtime = timestamp - startTime.current;
            const progress = Math.min(runtime / durationRef.current, 1);
            
            const ease = easeOutCubic(progress);
            
            // Calculate current number
            const nextVal = Math.floor(startValue.current + (value - startValue.current) * ease);
            setDisplayValue(nextVal);

            if (progress < 1) {
                reqId.current = requestAnimationFrame(animate);
            } else {
                setDisplayValue(value);
                setIsAnimating(false);
                setTrend('neutral');
                setDynamicScale(1); // Reset scale after animation
            }
        };

        if (reqId.current) cancelAnimationFrame(reqId.current);
        reqId.current = requestAnimationFrame(animate);

        return () => {
            if (reqId.current) cancelAnimationFrame(reqId.current);
        };
    }, [value]);

    const isIncreasing = isAnimating && trend === 'up';

    return (
        <span 
            className={`
                inline-block tabular-nums transition-all duration-300
                ${isIncreasing ? 'text-emerald-400 brightness-110' : ''}
                ${className}
            `}
            style={{
                // Apply dynamic scale only if increasing, otherwise 1
                transform: `scale(${isIncreasing ? dynamicScale : 1})`,
                textShadow: isIncreasing ? '0 0 15px rgba(52, 211, 153, 0.6)' : 'none',
                // Ensure transform origin is center to scale evenly
                transformOrigin: 'center center'
            }}
        >
            {prefix}{formatChips(displayValue, isAnimating)}
        </span>
    );
};