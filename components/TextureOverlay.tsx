import React from 'react';

export const TextureOverlay: React.FC = () => {
    return (
        <svg className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-[0.04] z-0 mix-blend-overlay">
            <filter id="noiseFilter">
                <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
            </filter>
            <rect width="100%" height="100%" filter="url(#noiseFilter)" />
        </svg>
    );
};