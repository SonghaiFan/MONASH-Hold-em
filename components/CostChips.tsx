import React from "react";
import { CHIP_COLORS, calculateChipCounts } from "./ChipStack";

// A model's price drawn in the game's own chips: one chip is one cent per
// million tokens, so Jev's $0.04/M is four white chips and Claude's $6.00/M
// is a purple and a black. Same colours as the stacks on the table, so the
// eye already knows which end is expensive.

interface CostChipsProps {
  dollarsPerM: number;
  className?: string;
}

const CHIP_W = 24;
const CHIP_H = 7;
const GAP = 5; // between stacks

export const CostChips: React.FC<CostChipsProps> = ({ dollarsPerM, className = "" }) => {
  const cents = Math.max(1, Math.round(dollarsPerM * 100));
  // Denominations above $500 never occur at these prices; the breakdown is the table's
  const stacks = calculateChipCounts(cents);
  const tallest = Math.max(...stacks.map((s) => s.count), 1);
  const width = stacks.length * (CHIP_W + GAP) - GAP;
  const height = tallest * CHIP_H + 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={`$${dollarsPerM.toFixed(2)} per million tokens`}
    >
      <title>{`$${dollarsPerM.toFixed(2)} / M tokens · ${cents} chips' worth`}</title>
      {stacks.map(({ value, count }, si) => {
        const x = si * (CHIP_W + GAP);
        return Array.from({ length: count }, (_, i) => {
          const y = height - (i + 1) * CHIP_H - 1;
          return (
            <g key={`${value}-${i}`} transform={`translate(${x} ${y})`}>
              <rect width={CHIP_W} height={CHIP_H} rx={CHIP_H / 2} fill={CHIP_COLORS[value]} stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />
              {/* the edge stripes every chip in the game carries */}
              <rect x={5} y={1.8} width={3} height={CHIP_H - 3.6} rx={1.2} fill="rgba(255,255,255,0.8)" />
              <rect x={CHIP_W - 8} y={1.8} width={3} height={CHIP_H - 3.6} rx={1.2} fill="rgba(255,255,255,0.8)" />
            </g>
          );
        });
      })}
    </svg>
  );
};
