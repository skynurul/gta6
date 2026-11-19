// util.js — small math helpers shared by every system of Ember Isle.
// The island lives on the XZ ground plane (Three.js Y is up); headings are
// angles in that plane, forward = (cos a, 0, sin a).
export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Shortest signed turn from angle a toward angle b.
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angleDiff(a, b) * clamp(t, 0, 1);
}

// Distance on the ground plane.
export function dist2(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

export function dist(ax, az, bx, bz) {
  return Math.sqrt(dist2(ax, az, bx, bz));
}

// Deterministic RNG (mulberry32) so the island is the same every run.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function randRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

// Push a circle (x, z, r) out of an axis-aligned rectangle on the ground.
// Returns a push-out vector, or null when there is no overlap.
export function circleVsRect(cx, cz, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const nz = clamp(cz, rect.z, rect.z + rect.d);
  const dx = cx - nx;
  const dz = cz - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 === 0) return { x: 0, z: -r };
  const d = Math.sqrt(d2);
  return { x: (dx / d) * (r - d), z: (dz / d) * (r - d) };
}

export function pointInRect(px, pz, rect) {
  return px >= rect.x && px <= rect.x + rect.w && pz >= rect.z && pz <= rect.z + rect.d;
}

// Format a number as cash, e.g. 1250 -> "$1,250".
export function money(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Short compass direction for a heading angle on the XZ plane.
export function compass(angle) {
  const dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const i = Math.round((((angle % TAU) + TAU) % TAU) / (Math.PI / 4)) % 8;
  return dirs[i];
}

// Turn a heading angle into a Three.js rotation.y (object forward +X at 0).
export function headingToRotationY(angle) {
  return -angle;
}
