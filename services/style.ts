// A playing style as a point on a map.
//
//   x: tight → loose        how many hands it plays (VPIP)
//   y: passive → aggressive how many of those it raises (PFR as a share of VPIP)
//
// The six named styles are points on the map. Any other point is a style of
// its own: its preflop targets come straight from where it sits, and its
// postflop habits (aggression, bluffing, sizing, temperature, tilt) are a
// blend of the named styles near it, the nearer the more.

import { PERSONAS } from "../constants";
import { Persona } from "../types";

export interface StylePoint {
  x: number; // 0..1
  y: number; // 0..1
}

export const CUSTOM = "CUSTOM";

const VPIP_MIN = 0.08;
const VPIP_MAX = 0.62;
const RATIO_MIN = 0.1; // PFR / VPIP
const RATIO_MAX = 0.9;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const targetsAt = (p: StylePoint) => {
  const vpip = lerp(VPIP_MIN, VPIP_MAX, p.x);
  return { vpip, pfr: vpip * lerp(RATIO_MIN, RATIO_MAX, p.y) };
};

export const pointOf = (vpip: number, pfr: number): StylePoint => {
  const ratio = vpip > 0 ? pfr / vpip : 0;
  return {
    x: clamp01((vpip - VPIP_MIN) / (VPIP_MAX - VPIP_MIN)),
    y: clamp01((ratio - RATIO_MIN) / (RATIO_MAX - RATIO_MIN)),
  };
};

export const presetPoint = (id: string): StylePoint | null => {
  const p = PERSONAS[id];
  return p?.vpip !== undefined && p.pfr !== undefined ? pointOf(p.vpip, p.pfr) : null;
};

// The four corners of the map, and the named style that lives in each
export const CORNERS = { topLeft: "TAG", topRight: "LAG", bottomLeft: "NIT", bottomRight: "FISH" } as const;

// A dragged dot this close to a named style snaps onto it
const SNAP = 0.07;

export const snapToPreset = (p: StylePoint): string | null => {
  let best: string | null = null;
  let bestD = SNAP;
  Object.keys(PERSONAS).forEach((id) => {
    const q = presetPoint(id);
    if (!q) return;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  });
  return best;
};

// A style of its own: targets from the point, habits blended from the named
// styles by inverse squared distance; sizing from the nearest one.
export const customPersona = (p: StylePoint): Persona => {
  const named = Object.values(PERSONAS)
    .map((persona) => ({ persona, at: presetPoint(persona.id) }))
    .filter((n): n is { persona: Persona; at: StylePoint } => n.at !== null)
    .map((n) => ({ ...n, d: Math.hypot(n.at.x - p.x, n.at.y - p.y) }));
  const weights = named.map((n) => 1 / Math.max(n.d, 0.02) ** 2);
  const total = weights.reduce((a, b) => a + b, 0);
  const blend = (key: "aggression" | "looseness" | "bluffFreq" | "temperature" | "tiltFactor") =>
    named.reduce((sum, n, i) => sum + n.persona[key] * weights[i], 0) / total;
  const nearest = named.reduce((a, b) => (b.d < a.d ? b : a));
  const { vpip, pfr } = targetsAt(p);

  return {
    id: CUSTOM,
    label: nearest.persona.label,
    description: "A custom style",
    aggression: blend("aggression"),
    looseness: blend("looseness"),
    bluffFreq: blend("bluffFreq"),
    sizing: nearest.persona.sizing,
    temperature: blend("temperature"),
    tiltFactor: blend("tiltFactor"),
    vpip,
    pfr,
  };
};

// What a seat's settings mean at the table: no persona (Natural), a named
// one, or one built from its point
export const personaFor = (strategy: string, style?: StylePoint): Persona | undefined => {
  if (strategy === CUSTOM && style) return customPersona(style);
  return PERSONAS[strategy];
};

// Where a seat's dot sits on the map, if it has one
export const pointFor = (strategy: string, style?: StylePoint): StylePoint | null =>
  strategy === CUSTOM && style ? style : presetPoint(strategy);

// Stats are kept per style: a seat retuned is, for the numbers, a new player
export const styleKeyOf = (strategy: string, style?: StylePoint) =>
  strategy === CUSTOM && style ? `${CUSTOM}:${style.x.toFixed(2)},${style.y.toFixed(2)}` : strategy;
