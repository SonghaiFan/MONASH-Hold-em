import React, { useMemo } from 'react';

interface SliderProps {
    min: number;
    max: number;
    step?: number;
    value: number;
    onChange: (value: number) => void;
    markerValue?: number; // The value where the scale changes and bar appears
    className?: string;
    disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({ 
    min, 
    max, 
    step = 1, 
    value, 
    onChange, 
    markerValue,
    className = '',
    disabled = false
}) => {
    // 0.65 means 65% of the slider width covers min -> markerValue (Linear)
    // The remaining 35% covers markerValue -> max (Logarithmic)
    const PIVOT_PCT = 0.65; 

    // Helper: Is the split-scale logic applicable?
    // We strictly enforce split scale if marker is valid and strictly inside the range
    // If marker <= min, we effectively have only the logarithmic tail.
    // If marker >= max, we effectively have only the linear head.
    const isSplitScale = useMemo(() => {
        return markerValue !== undefined && markerValue > min && markerValue < max;
    }, [min, max, markerValue]);

    // Convert External Dollar Value -> Internal Slider Percent (0-100)
    const toSliderPercent = (dollarVal: number): number => {
        const safeVal = Math.max(min, Math.min(max, dollarVal));

        if (!isSplitScale || !markerValue) {
            // Standard Linear Fallback
            if (max === min) return 0;
            return ((safeVal - min) / (max - min)) * 100;
        }

        if (safeVal <= markerValue) {
            // Segment 1: STRICT LINEAR (Min -> Marker)
            const range = markerValue - min;
            const ratio = (safeVal - min) / range;
            return ratio * (PIVOT_PCT * 100);
        } else {
            // Segment 2: STRICT LOGARITHMIC (Marker -> Max)
            // t = (log(val) - log(marker)) / (log(max) - log(marker))
            const safeMarker = Math.max(1, markerValue);
            const safeMax = Math.max(1, max);
            const safeInput = Math.max(1, safeVal);

            const logMin = Math.log(safeMarker);
            const logMax = Math.log(safeMax);
            const logVal = Math.log(safeInput);
            
            const t = (logVal - logMin) / (logMax - logMin);
            return (PIVOT_PCT * 100) + (t * ((1 - PIVOT_PCT) * 100));
        }
    };

    // Convert Internal Slider Percent (0-100) -> External Dollar Value
    const fromSliderPercent = (percent: number): number => {
        if (!isSplitScale || !markerValue) {
            // Standard Linear Fallback
            const val = min + (percent / 100) * (max - min);
            return Math.round(val / step) * step;
        }

        let rawVal: number;
        const pivotVal = PIVOT_PCT * 100;

        if (percent <= pivotVal) {
            // Segment 1: STRICT LINEAR
            const ratio = percent / pivotVal;
            rawVal = min + ratio * (markerValue - min);
        } else {
            // Segment 2: STRICT LOGARITHMIC
            // t = (percent - pivot) / (100 - pivot)
            const t = (percent - pivotVal) / (100 - pivotVal);
            
            const safeMarker = Math.max(1, markerValue);
            const safeMax = Math.max(1, max);
            
            const logMin = Math.log(safeMarker);
            const logMax = Math.log(safeMax);
            
            rawVal = Math.exp(logMin + t * (logMax - logMin));
        }

        // Snap to step
        const snapped = Math.round(rawVal / step) * step;
        return Math.max(min, Math.min(max, snapped));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const pct = parseFloat(e.target.value);
        const dollarVal = fromSliderPercent(pct);
        onChange(dollarVal);
    };

    const internalValue = toSliderPercent(value);
    const markerPosition = isSplitScale && markerValue ? toSliderPercent(markerValue) : null;

    return (
        <div className={`relative w-full h-6 flex items-center ${className}`}>
            {/* Visual Track */}
            <div className="absolute left-0 right-0 h-1 bg-white/10 rounded-full overflow-hidden pointer-events-none">
                {/* Fill bar */}
                <div 
                    className="h-full bg-[#d4af37] shadow-[0_0_10px_rgba(212,175,55,0.4)]" 
                    style={{ width: `${internalValue}%` }}
                />
            </div>

            {/* Marker Line */}
            {markerPosition !== null && (
                <div 
                    className="absolute h-3 w-[2px] bg-white/50 top-1.5 pointer-events-none z-0"
                    style={{ left: `${markerPosition}%` }}
                >
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[0.5rem] text-white/40 font-mono tracking-wider">
                        POT
                    </div>
                </div>
            )}

            <input 
                type="range"
                min={0}
                max={100}
                step={0.1} // Fine internal resolution
                value={internalValue}
                onChange={handleChange}
                disabled={disabled}
                className={`
                    absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10
                    disabled:cursor-not-allowed
                `}
            />

            {/* Custom Thumb (Visual Only, follows internalValue) */}
            <div 
                className="absolute w-6 h-6 bg-[#d4af37] rounded-full shadow-[0_0_15px_rgba(212,175,55,0.4)] pointer-events-none transform -translate-x-1/2 z-20 transition-transform active:scale-110"
                style={{ left: `${internalValue}%` }}
            >
                <div className="w-full h-full rounded-full border-2 border-white/20"></div>
            </div>
        </div>
    );
};