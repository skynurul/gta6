// terrain3d.js — Ember Isle itself: a procedural volcanic island.
// Everything is analytic, so the terrain, the roads, the districts and the
// collision all agree: terrainHeight(x, z) is the one source of truth.
// The island lives on the XZ ground plane (Three.js Y is up), 3400 x 3400.
import { clamp, dist, makeRng, randRange, smoothstep, circleVsRect } from './util.js';

export const WORLD = 3400;
export const CENTER = { x: 1700, z: 1700 };
export const VOLCANO = { x: 1700, z: 430, r: 640, peak: 300 };

// The road grid: avenues run north-south, streets east-west, every 400 units.
export const AVENUES = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
export const STREETS = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
export const ROAD_HALF = 23;

// The volcano climb road: a spiral loop around the cone, rising to the rim.
export const CLIMB_WAYPOINTS = [
  { x: 1700, z: 1100 },
  { x: 1300, z: 920 },
  { x: 1080, z: 660 },
  { x: 1300, z: 440 },
  { x: 1620, z: 300 },
  { x: 1960, z: 440 },
  { x: 2180, z: 660 },
  { x: 2000, z: 920 },
];
export const SUMMIT = { x: 1700, z: 300 };

// The coastal ring: a rectangle of the inner grid roads, one block in from
// the shore so every checkpoint stays on dry land and on a road.
export const COASTAL_WAYPOINTS = [
  { x: 2600, z: 2600 },
  { x: 2600, z: 1600 },
  { x: 2600, z: 600 },
  { x: 1600, z: 600 },
  { x: 600, z: 600 },
  { x: 600, z: 1600 },
  { x: 600, z: 2600 },
  { x: 1600, z: 2600 },
];

export const DISTRICTS = [
  { id: 'ash', name: 'Port Ash', color: 0xb0703a, center: { x: 3150, z: 1500 } },
  { id: 'vieja', name: 'Caldera Vieja', color: 0xd9a066, center: { x: 1700, z: 820 } },
  { id: 'sands', name: 'Palma Sands', color: 0xe8d27a, center: { x: 1700, z: 3150 } },
  { id: 'cinder', name: 'Mount Cinder', color: 0x8a2a1a, center: { x: 1700, z: 430 } },
  { id: 'slag', name: 'Slagworks', color: 0x8a8f96, center: { x: 500, z: 2000 } },
];

export const PLACES = {
  safehouse: { x: 1500, z: 1300, name: 'Safehouse' },
  docks: { x: 3150, z: 1500, name: 'Port Ash Docks' },
  marina: { x: 2500, z: 3150, name: 'Palma Sands Marina' },
  garage: { x: 600, z: 2000, name: 'Slagworks Garage' },
  summit: { x: 1700, z: 300, name: 'Summit Overlook' },
  volcanoBase: { x: 1700, z: 980, name: 'Volcano Base' },
  raceCoastal: { x: 2600, z: 2600, name: 'Coastal Ring Start' },
  raceClimb: { x: 1700, z: 1100, name: 'Volcano Climb Start' },
  emberField: { x: 1480, z: 620, name: 'Ember Field' },
};

// How high the climb road is at each waypoint (progress 0..1 around the loop).
function climbHeightAt(i) {
  const n = CLIMB_WAYPOINTS.length;
  const t = i / n;
  return 12 + 230 * Math.sin(t * Math.PI * 0.92);
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / len2;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return { d: dist(px, pz, cx, cz), t, cx, cz };
}

// Height of the road surface at (x, z): flat in town, rising toward the volcano.
function roadHeight(x, z) {
  const dv = dist(x, z, VOLCANO.x, VOLCANO.z);
  return 12 + 250 * Math.pow(Math.max(0, 1 - dv / 760), 1.6);
}

// The one source of truth for ground height. Roads flatten the terrain so
// cars can drive the grid and the climb spiral without climbing the cone.
export function terrainHeight(x, z) {
  const cx = x - CENTER.x;
  const cz = z - CENTER.z;
  const r = Math.sqrt(cx * cx + cz * cz) / 1700;
  const island = 30 * smoothstep(1.0, 0.55, r);
  const dv = dist(x, z, VOLCANO.x, VOLCANO.z);
  let cone = 300 * Math.pow(Math.max(0, 1 - dv / 700), 1.25);
  cone -= 80 * Math.max(0, 1 - dv / 130); // crater bowl
  const noise = 4 * Math.sin(x * 0.005 + 1.7) * Math.cos(z * 0.004 - 0.6)
    + 2 * Math.sin(x * 0.013) * Math.sin(z * 0.011 + 2.2);
  let h = island + cone + noise - 2;

  // Grid roads flatten the ground toward the road surface.
  let dRoad = Infinity;
  for (const a of AVENUES) dRoad = Math.min(dRoad, Math.abs(x - a));
  for (const s of STREETS) dRoad = Math.min(dRoad, Math.abs(z - s));
  const wGrid = 1 - smoothstep(20, 70, dRoad);

  // The climb spiral flattens toward its own rising surface.
  let dClimb = Infinity;
  let climbH = 12;
  for (let i = 0; i < CLIMB_WAYPOINTS.length; i++) {
    const a = CLIMB_WAYPOINTS[i];
    const b = CLIMB_WAYPOINTS[(i + 1) % CLIMB_WAYPOINTS.length];
    const seg = distToSegment(x, z, a.x, a.z, b.x, b.z);
    if (seg.d < dClimb) {
      dClimb = seg.d;
      climbH = (climbHeightAt(i) + climbHeightAt((i + 1) % CLIMB_WAYPOINTS.length)) / 2;
    }
  }
  const wClimb = 1 - smoothstep(15, 55, dClimb);

  const w = Math.max(wGrid, wClimb);
  if (w > 0) {
    const target = wClimb > wGrid ? climbH : roadHeight(x, z);
    h = h * (1 - w) + target * w;
  }
  return h;
}

export function districtFor(x, z) {
  if (dist(x, z, VOLCANO.x, VOLCANO.z) < 620) return DISTRICTS[3];
  if (x > 2900) return DISTRICTS[0];
  if (z > 2850) return DISTRICTS[2];
  if (x < 900) return DISTRICTS[4];
  if (z < 1150 && x > 1100 && x < 2300) return DISTRICTS[1];
  let best = DISTRICTS[1];
  let bd = Infinity;
  for (const d of DISTRICTS) {
    const dd = dist(x, z, d.center.x, d.center.z);
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return best;
}

export function onRoad(x, z) {
  for (const a of AVENUES) if (Math.abs(x - a) < ROAD_HALF) return true;
  for (const s of STREETS) if (Math.abs(z - s) < ROAD_HALF) return true;
  return false;
}

export function nearestIntersection(x, z) {
  let bx = AVENUES[0];
  let bz = STREETS[0];
  for (const a of AVENUES) if (Math.abs(a - x) < Math.abs(bx - x)) bx = a;
  for (const s of STREETS) if (Math.abs(s - z) < Math.abs(bz - z)) bz = s;
  return { x: bx, z: bz };
}

// Snap a point to the nearest road centreline (used for spawns).
export function snapToRoad(x, z) {
  let bx = AVENUES[0];
  let bz = STREETS[0];
  for (const a of AVENUES) if (Math.abs(a - x) < Math.abs(bx - x)) bx = a;
  for (const s of STREETS) if (Math.abs(s - z) < Math.abs(bz - z)) bz = s;
  return Math.abs(bx - x) < Math.abs(bz - z) ? { x: bx, z } : { x, z: bz };
}

export function randomRoadPoint(rng) {
  const horiz = rng() < 0.5;
  const line = (horiz ? AVENUES : STREETS)[Math.floor(rng() * 8)];
  const along = randRange(rng, 240, 3160);
  return horiz ? { x: along, z: line } : { x: line, z: along };
}

// Lava pools on the volcano slopes: standing in one drains health.
export const LAVA_ZONES = [
  { x: 1560, z: 560, r: 90 },
  { x: 1840, z: 520, r: 80 },
  { x: 1700, z: 700, r: 70 },
  { x: 1420, z: 760, r: 60 },
  { x: 1980, z: 760, r: 60 },
];

export function inLava(x, z) {
  for (const lz of LAVA_ZONES) {
    if (dist(x, z, lz.x, lz.z) < lz.r) return true;
  }
  return false;
}

const PALETTES = {
  ash: [0x9a6a4a, 0x7a5a4a, 0xb07a4a, 0x6a5a52],
  vieja: [0xd9a066, 0xc98a5a, 0xe8c090, 0xb0703a],
  sands: [0xf0e0c0, 0xe8d0a0, 0xffffff, 0xd0c090],
  slag: [0x7a7f86, 0x6a6f76, 0x8a6a5a, 0x5a5f66],
  cinder: [0x4a3a36, 0x5a4440, 0x3a2f2c],
};

// Generate the island's built content: buildings, trees, lamps, crates, docks.
export function generateIsland(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];
  const crates = [];
  const plazas = [];

  for (let ax = 0; ax < 7; ax++) {
    for (let az = 0; az < 7; az++) {
      const x0 = AVENUES[ax] + ROAD_HALF + 6;
      const x1 = AVENUES[ax + 1] - ROAD_HALF - 6;
      const z0 = STREETS[az] + ROAD_HALF + 6;
      const z1 = STREETS[az + 1] - ROAD_HALF - 6;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const d = districtFor(cx, cz);
      // The volcano swallows the northern blocks; the south row is beach.
      if (dist(cx, cz, VOLCANO.x, VOLCANO.z) < 760) continue;
      if (az === 6) {
        for (let i = 0; i < 5; i++) {
          trees.push({
            x: randRange(rng, x0, x1), z: randRange(rng, z0, z1),
            s: randRange(rng, 0.9, 1.5), kind: 'palm', tint: rng(),
          });
        }
        continue;
      }
      if (rng() < 0.12) {
        plazas.push({ x: cx, z: cz });
        for (let i = 0; i < 4; i++) {
          trees.push({
            x: randRange(rng, x0, x1), z: randRange(rng, z0, z1),
            s: randRange(rng, 0.8, 1.3), kind: 'leaf', tint: rng(),
          });
        }
        continue;
      }
      const downtown = Math.abs(cx - 1700) < 700 && Math.abs(cz - 1700) < 700;
      const count = rng() < 0.5 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = count === 1 ? randRange(rng, 150, 260) : randRange(rng, 110, 160);
        const dd = count === 1 ? randRange(rng, 150, 260) : randRange(rng, 110, 160);
        const bx = count === 1 ? cx - w / 2 : x0 + (i * (x1 - x0)) / 2 + 10;
        const bz = count === 1 ? cz - dd / 2 : z0 + 10;
        const h = downtown
          ? randRange(rng, 45, 110)
          : randRange(rng, 16, 42);
        const palette = PALETTES[d.id] || PALETTES.vieja;
        buildings.push({
          x: bx, z: bz, w, d: dd, h,
          wall: palette[Math.floor(rng() * palette.length)],
          roof: rng() < 0.5 ? 0x3a3f46 : 0x6a4a3a,
        });
      }
    }
  }

  // Palm-lined beach, pines on the volcano slopes, leaf trees inland.
  for (let i = 0; i < 90; i++) {
    const a = rng() * Math.PI * 2;
    const r = randRange(rng, 1420, 1620);
    const x = CENTER.x + Math.cos(a) * r;
    const z = CENTER.z + Math.sin(a) * r;
    if (x < 60 || x > 3340 || z < 60 || z > 3340) continue;
    trees.push({ x, z, s: randRange(rng, 0.9, 1.6), kind: 'palm', tint: rng() });
  }
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2;
    const r = randRange(rng, 660, 900);
    const x = VOLCANO.x + Math.cos(a) * r;
    const z = VOLCANO.z + Math.sin(a) * r;
    if (x < 60 || x > 3340 || z < 60 || z > 3340) continue;
    trees.push({ x, z, s: randRange(rng, 1.0, 1.8), kind: 'pine', tint: rng() });
  }

  // Street lamps at every intersection corner.
  for (const a of AVENUES) {
    for (const s of STREETS) {
      lamps.push({ x: a + 30, z: s + 30 });
      lamps.push({ x: a - 30, z: s - 30 });
    }
  }

  // Crates on the docks, in the Slagworks yard, and on the volcano slopes.
  for (let i = 0; i < 14; i++) {
    crates.push({ x: randRange(rng, 3050, 3280), z: randRange(rng, 900, 2100), s: randRange(rng, 0.8, 1.4) });
  }
  for (let i = 0; i < 8; i++) {
    crates.push({ x: randRange(rng, 350, 850), z: randRange(rng, 1700, 2300), s: randRange(rng, 0.8, 1.4) });
  }
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2;
    const r = randRange(rng, 380, 560);
    crates.push({ x: VOLCANO.x + Math.cos(a) * r, z: VOLCANO.z + Math.sin(a) * r, s: randRange(rng, 0.9, 1.3) });
  }

  // Docks: piers reaching east into the sea at Port Ash.
  const docks = [];
  for (let i = 0; i < 3; i++) {
    const z = 900 + i * 300;
    docks.push({ x: 3220, z, len: 260, w: 60 });
  }

  return { buildings, trees, lamps, crates, plazas, docks, seed };
}

// Push a circle out of every building rect and keep it on the island.
export function collideWorld(x, z, r, buildings) {
  let px = x;
  let pz = z;
  for (const b of buildings) {
    const push = circleVsRect(px, pz, r, b);
    if (push) {
      px += push.x;
      pz += push.z;
    }
  }
  const d = dist(px, pz, CENTER.x, CENTER.z);
  if (d > 1640) {
    const k = 1640 / d;
    px = CENTER.x + (px - CENTER.x) * k;
    pz = CENTER.z + (pz - CENTER.z) * k;
  }
  return { x: px, z: pz };
}

// Is (x, z) inside a building rect? (Bullets and peds use this.)
export function insideBuilding(x, z, buildings) {
  for (const b of buildings) {
    if (x >= b.x && x <= b.x + b.w && z >= b.z && z <= b.z + b.d) return true;
  }
  return false;
}
