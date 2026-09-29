import React, { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { avatarFor } from "../services/avatars";

// The opponents, folded into a stack of faces or unfolded into a list — and
// the unfolding is a snake, not a pendulum. Every face rides one track: along
// the stack to its left end, then straight down the list. The leftmost face
// is the head and goes first; each one behind follows its trail, sliding into
// the corner the one ahead just left before turning down. They move in lock
// step, so nobody passes anybody: the head runs furthest (the bottom row) and
// the tail stops first (the top row). Folding runs the same track backwards.
//
// Positions are one number per face, its distance along the track:
//   s < 0  — on the stack, |s| px right of the corner
//   s ≥ 0  — in the list, s px below the corner

export interface SnakeRow {
  id: string;
  title: string;
  subtitle: string;
  marked?: boolean; // shows the prompt mark
}

interface SeatSnakeProps {
  rows: SnakeRow[]; // in list order, top to bottom
  unfolded: boolean;
  onUnfold: () => void;
  unfoldLabel: string;
  markTitle: string;
  rowProps: (id: string) => React.ButtonHTMLAttributes<HTMLButtonElement>;
  pressing: string | null;
}

const GUTTER = 20; // the page's side padding: where the corner sits
const FACE = 48;
const ROW_H = 68; // a list row: the face and 10px above and below
const TOP = 10; // the face's inset from the top of a row, and of the stack
const STEP = 36; // stacked faces overlap by a quarter
const SPEED = 450; // px per second along the track: slow enough to see the snake
const COIN = 40; // over its first 40px down the list a face sheds its coin

const QuoteMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const SeatSnake: React.FC<SeatSnakeProps> = ({
  rows,
  unfolded,
  onUnfold,
  unfoldLabel,
  markTitle,
  rowProps,
  pressing,
}) => {
  const n = rows.length;
  // Row j is stacked at k = n-1-j: the last row leads from the left end of the stack
  const start = (j: number) => -(n - 1 - j) * STEP;
  const stop = (j: number) => j * ROW_H;
  // How far the whole snake has travelled; everyone moves by this much, then stops at their row
  const length = (n - 1) * ROW_H; // the head's journey, the longest
  const [travel, setTravel] = useState(unfolded ? length : 0);
  const travelRef = useRef(travel);

  useEffect(() => {
    const target = unfolded ? length : 0;
    if (reducedMotion()) {
      travelRef.current = target;
      setTravel(target);
      return;
    }
    const distance = Math.abs(target - travelRef.current);
    const controls = animate(travelRef.current, target, {
      duration: Math.max(0.25, distance / SPEED),
      ease: [0.45, 0, 0.25, 1],
      onUpdate: (v) => {
        travelRef.current = v;
        setTravel(v);
      },
    });
    return () => controls.stop();
  }, [unfolded, length]);

  const at = (j: number) => Math.min(start(j) + travel, stop(j));
  const arrived = (j: number) => unfolded && at(j) >= stop(j) - 0.5;

  const point = (s: number) => (s < 0 ? { x: GUTTER - s, y: TOP } : { x: GUTTER, y: TOP + s });
  const deepest = rows.reduce((m, _, j) => Math.max(m, point(at(j)).y), TOP);
  const height = deepest + FACE + TOP;

  return (
    // isolate: the faces' z-indexes order them within the snake, and must not lift them over the page (the pinned Sit down button)
    <div className="relative isolate mt-3 mb-4" style={{ height }}>
      {/* The list: each row's words appear once its face has arrived */}
      {rows.map((row, j) => {
        const here = arrived(j);
        return (
          <button
            key={row.id}
            type="button"
            {...rowProps(row.id)}
            tabIndex={here ? 0 : -1}
            aria-hidden={!here}
            aria-haspopup="dialog"
            className={`
              absolute inset-x-0 flex items-center gap-4 px-5 text-left select-none [-webkit-touch-callout:none]
              transition-[opacity,background-color,transform] duration-300 cursor-pointer
              ${here ? "opacity-100" : "opacity-0 pointer-events-none"}
              ${pressing === row.id ? "bg-white/[0.06] scale-[0.98]" : "hover:bg-white/[0.03]"}
            `}
            style={{ top: stop(j), height: ROW_H }}
          >
            <span className="w-12 h-12 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[17px] text-white truncate">{row.title}</span>
              <span className="block text-[14px] text-white/45 truncate">{row.subtitle}</span>
            </span>
            {row.marked && (
              <span className="text-white/35 shrink-0" title={markTitle}>
                <QuoteMark />
              </span>
            )}
          </button>
        );
      })}

      {/* The faces, riding the track. Stacked, each sits on a coin with a black
          ring so the overlaps read; the coin fades over its first steps down. */}
      {rows.map((row, j) => {
        const s = at(j);
        const { x, y } = point(s);
        const coin = s <= 0 ? 1 : Math.max(0, 1 - s / COIN);
        return (
          <span
            key={row.id}
            className="absolute w-12 h-12 rounded-full pointer-events-none"
            style={{
              left: 0,
              top: 0,
              transform: `translate(${x}px, ${y}px)`,
              zIndex: j + 1, // the head, leftmost, lies on top of the stack
              padding: 6 * coin,
              backgroundColor: `rgba(44, 44, 46, ${coin})`,
              boxShadow: `0 0 0 3px rgba(0, 0, 0, ${coin})`,
            }}
          >
            <img src={avatarFor(row.id)} alt="" draggable={false} className="w-full h-full object-contain" />
          </span>
        );
      })}

      {/* Folded, the whole stack is one button */}
      {!unfolded && (
        <button
          type="button"
          onClick={onUnfold}
          aria-expanded={false}
          aria-label={unfoldLabel}
          className="absolute cursor-pointer rounded-full"
          style={{ left: GUTTER - 4, top: TOP - 4, width: FACE + (n - 1) * STEP + 8, height: FACE + 8, zIndex: n + 1 }}
        />
      )}
    </div>
  );
};
