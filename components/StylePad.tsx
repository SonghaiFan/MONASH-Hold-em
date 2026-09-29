import React, { useRef } from "react";
import { useLanguage } from "../services/i18n";
import { CORNERS, StylePoint } from "../services/style";

interface StylePadProps {
  target: StylePoint | null; // where the style is set; null when the model decides
  actual?: StylePoint | null; // where it has actually played, once there are enough hands
  onChange?: (p: StylePoint) => void; // dragging (absent: read-only)
  onPreset?: (id: string) => void; // a corner tapped
  selectedPreset?: string | null;
  disabled?: boolean;
  compact?: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// The style as a shape on a diamond: each of the four points (aggressive up,
// loose right, passive down, tight left) reaches as far as the style leans
// that way. A thread runs from the shape to the corner archetype it is closest
// to. How it has really played is drawn over it as a yellow outline.
//
// Coordinates inside the diamond's square box run 0..100 with the centre at
// 50,50; a style's handle sits at 50 + (x - 0.5) * 50, which keeps every
// style inside the diamond (its extremes land on the edges' midpoints).

const REACH_MIN = 0.14; // even a style at the far end keeps a sliver on the opposite side

const shapeOf = (p: StylePoint) => {
  const reach = (v: number) => (REACH_MIN + (1 - REACH_MIN) * v) * 50;
  return {
    top: [50, 50 - reach(p.y)],
    right: [50 + reach(p.x), 50],
    bottom: [50, 50 + reach(1 - p.y)],
    left: [50 - reach(1 - p.x), 50],
  };
};

const handleOf = (p: StylePoint) => [50 + (p.x - 0.5) * 50, 50 - (p.y - 0.5) * 50];

// Where each corner's chip sits, in the diamond box's coordinates
const CHIP_AT: Record<keyof typeof CORNERS, [number, number]> = {
  topLeft: [-22, -20],
  topRight: [122, -20],
  bottomLeft: [-22, 120],
  bottomRight: [122, 120],
};

const quadrantOf = (p: StylePoint): keyof typeof CORNERS =>
  p.y >= 0.5 ? (p.x < 0.5 ? "topLeft" : "topRight") : p.x < 0.5 ? "bottomLeft" : "bottomRight";

export const StylePad: React.FC<StylePadProps> = ({
  target,
  actual,
  onChange,
  onPreset,
  selectedPreset,
  disabled,
  compact,
}) => {
  const { t } = useLanguage();
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const editable = !!onChange && !disabled;

  // The corner the style belongs to: the named one if it is one, else its quadrant
  const cornerIds = Object.values(CORNERS) as string[];
  const corner: keyof typeof CORNERS | null = !target
    ? null
    : selectedPreset && cornerIds.includes(selectedPreset)
      ? ((Object.keys(CORNERS) as (keyof typeof CORNERS)[]).find((k) => CORNERS[k] === selectedPreset) ?? null)
      : quadrantOf(target);

  const pointAt = (e: React.PointerEvent): StylePoint => {
    const r = box.current!.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5;
    const dy = (e.clientY - r.top) / r.height - 0.5;
    return { x: clamp01(0.5 + dx * 2), y: clamp01(0.5 - dy * 2) };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!editable) return;
    dragging.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // still drags while the pointer stays on the diamond
    }
    onChange!(pointAt(e));
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragging.current && editable) onChange!(pointAt(e));
  };
  const onUp = () => {
    dragging.current = false;
  };
  // Arrow keys nudge the style, for anyone not dragging
  const onKey = (e: React.KeyboardEvent) => {
    if (!editable || !target) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!d) return;
    e.preventDefault();
    onChange!({ x: clamp01(target.x + d[0]), y: clamp01(target.y + d[1]) });
  };

  const chip = (place: keyof typeof CORNERS, position: string) => {
    const id = CORNERS[place];
    const on = corner === place;
    return (
      <button
        type="button"
        disabled={!onPreset || disabled}
        onClick={() => onPreset?.(id)}
        className={`absolute ${position} z-20 transition-colors flex items-center justify-center font-medium ${
          compact ? "h-7 min-w-[42px] px-2 text-[11px] rounded-[10px]" : "h-9 min-w-[50px] px-3 text-[13px] rounded-[14px]"
        } ${
          on
            ? "bg-[#ff7a59] text-white shadow-sm"
            : "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
        } ${onPreset && !disabled ? "cursor-pointer" : "cursor-default"}`}
      >
        {t.stylePad.corners[id] ?? id}
      </button>
    );
  };

  const label = (text: string, sub: string, color: string, position: string) => (
    <div className={`absolute ${position} pointer-events-none leading-tight text-center`}>
      <div className={compact ? "text-[13px] font-medium" : "text-[16px] font-medium"} style={{ color }}>
        {text}
      </div>
      {!compact && <div className="text-[12px] text-white/45 mt-0.5">{sub}</div>}
    </div>
  );

  const shape = target ? shapeOf(target) : null;
  const clip = shape ? `polygon(${[shape.top, shape.right, shape.bottom, shape.left].map(([x, y]) => `${x}% ${y}%`).join(", ")})` : "";
  const handle = target ? handleOf(target) : null;
  const actualShape = actual ? shapeOf(actual) : null;

  return (
    <div
      className={`relative w-full rounded-[28px] bg-black/40 border border-white/10 select-none transition-opacity ${
        disabled ? "opacity-35" : ""
      } ${compact ? "aspect-[1/0.8]" : "aspect-[1/0.95]"}`}
    >
      {chip("topLeft", compact ? "top-2.5 left-2.5" : "top-3.5 left-3.5")}
      {chip("topRight", compact ? "top-2.5 right-2.5" : "top-3.5 right-3.5")}
      {chip("bottomLeft", compact ? "bottom-2.5 left-2.5" : "bottom-3.5 left-3.5")}
      {chip("bottomRight", compact ? "bottom-2.5 right-2.5" : "bottom-3.5 right-3.5")}

      {label(t.stylePad.aggressive, t.stylePad.aggressiveSub, "#ff4fa3", compact ? "top-2.5 left-1/2 -translate-x-1/2" : "top-4 left-1/2 -translate-x-1/2")}
      {label(t.stylePad.passive, t.stylePad.passiveSub, "#38c9e8", compact ? "bottom-2.5 left-1/2 -translate-x-1/2" : "bottom-4 left-1/2 -translate-x-1/2")}
      {label(t.stylePad.tight, t.stylePad.tightSub, "#b36bff", "top-1/2 -translate-y-1/2 left-[3%] w-[21%]")}
      {label(t.stylePad.loose, t.stylePad.looseSub, "#ffae34", "top-1/2 -translate-y-1/2 right-[3%] w-[21%]")}

      {/* The diamond: a square box, centred; everything inside is drawn in its 0..100 space */}
      <div
        ref={box}
        role={editable ? "slider" : "img"}
        tabIndex={editable ? 0 : -1}
        aria-label={t.stylePad.label}
        aria-valuetext={target ? `${Math.round(target.x * 100)}, ${Math.round(target.y * 100)}` : undefined}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[52%] aspect-square touch-none outline-none rounded-full focus-visible:ring-2 focus-visible:ring-white/30 ${
          editable ? "cursor-grab active:cursor-grabbing" : ""
        }`}
      >
        {/* Frame: the diamond, two dashed rings inside it, and the axes */}
        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 100">
          <polygon points="50,0 100,50 50,100 0,50" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
          {[0.66, 0.33].map((k) => (
            <polygon
              key={k}
              points={`50,${50 - 50 * k} ${50 + 50 * k},50 50,${50 + 50 * k} ${50 - 50 * k},50`}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="0.8"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* The style's shape, filled with the four directions' colours */}
        {shape && (
          <div
            className="absolute inset-0 pointer-events-none transition-[clip-path] duration-150"
            style={{
              clipPath: clip,
              background:
                "conic-gradient(from 0deg at 50% 50%, #ff3fa4 0deg, #ff7a59 60deg, #ffb238 110deg, #3cd6f0 190deg, #a855f7 280deg, #ff3fa4 360deg)",
            }}
          />
        )}

        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 100">
          {/* The thread to its archetype's corner */}
          {handle && corner && (
            <line
              x1={handle[0]}
              y1={handle[1]}
              x2={CHIP_AT[corner][0] + (corner.endsWith("Left") ? 10 : -10)}
              y2={CHIP_AT[corner][1] + (corner.startsWith("top") ? 10 : -10)}
              stroke="#ff7a59"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {/* How it has actually played */}
          {actualShape && (
            <polygon
              points={[actualShape.top, actualShape.right, actualShape.bottom, actualShape.left].map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              stroke="#f5e35b"
              strokeWidth="1.6"
              strokeDasharray="4 3"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            >
              <title>{t.stylePad.actual}</title>
            </polygon>
          )}
        </svg>

        {/* The handle you drag */}
        {handle && editable && (
          <span
            className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.18),0_2px_10px_rgba(0,0,0,0.5)] pointer-events-none"
            style={{ left: `${handle[0]}%`, top: `${handle[1]}%` }}
          />
        )}
      </div>
    </div>
  );
};
