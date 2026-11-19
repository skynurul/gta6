// city.js — Solmar Bay, a sun-soaked coastal city, generated from a seed.
// A grid of avenues and streets, blocks of pastel buildings, a beach and turquoise
// water along the south shore, docks on the east, a park, and a road graph that
// traffic and police drive on. All collision uses the buildings' rectangles.
import { clamp, makeRng, pick, randRange } from './util.js';

export const WORLD = 3400; // world is WORLD x WORLD pixels
export const ROAD_W = 96;

const AVENUES = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
const STREETS = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];

const ROOF_COLORS = [
  '#f2a65a', '#e07a5f', '#81b29a', '#f4d35e', '#ee964b', '#a8dadc',
  '#e5989b', '#b5e48c', '#f7ede2', '#ffafcc', '#8ecae6', '#ffb703',
];
const WALL_COLORS = ['#fdf0d5', '#ffe8d6', '#fff1e6', '#fde2e4', '#e0fbfc', '#fff3b0'];

export function generateCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];

  // Blocks sit between neighbouring avenues/streets.
  for (let bx = 0; bx < AVENUES.length - 1; bx++) {
    for (let by = 0; by < STREETS.length - 1; by++) {
      const x0 = AVENUES[bx] + ROAD_W / 2 + 14;
      const y0 = STREETS[by] + ROAD_W / 2 + 14;
      const x1 = AVENUES[bx + 1] - ROAD_W / 2 - 14;
      const y1 = STREETS[by + 1] - ROAD_W / 2 - 14;
      const w = x1 - x0;
      const h = y1 - y0;
      // The south-west block is Coral Park; the south-east strip is the beach.
      if (bx === 1 && by === 5) {
        for (let i = 0; i < 16; i++) {
          trees.push({
            x: randRange(rng, x0 + 20, x1 - 20),
            y: randRange(rng, y0 + 20, y1 - 20),
            r: randRange(rng, 10, 18),
            palm: rng() < 0.5,
          });
        }
        continue;
      }
      if (by === 6) continue; // beach blocks: sand, palms, no buildings
      const kind = rng();
      if (kind < 0.55) {
        // One big building filling most of the block.
        const bw = w * randRange(rng, 0.55, 0.8);
        const bh = h * randRange(rng, 0.55, 0.8);
        buildings.push(makeBuilding(rng, x0 + (w - bw) / 2, y0 + (h - bh) / 2, bw, bh, bx, by));
      } else if (kind < 0.85) {
        // Two buildings side by side.
        const gap = 26;
        const bw = (w - gap) / 2;
        buildings.push(makeBuilding(rng, x0, y0 + 20, bw, h - 40, bx, by));
        buildings.push(makeBuilding(rng, x0 + bw + gap, y0 + 20, bw, h - 40, bx, by));
      } else {
        // Four small shops around a courtyard.
        const bw = (w - 30) / 2;
        const bh = (h - 30) / 2;
        buildings.push(makeBuilding(rng, x0, y0, bw, bh, bx, by));
        buildings.push(makeBuilding(rng, x0 + bw + 30, y0, bw, bh, bx, by));
        buildings.push(makeBuilding(rng, x0, y0 + bh + 30, bw, bh, bx, by));
        buildings.push(makeBuilding(rng, x0 + bw + 30, y0 + bh + 30, bw, bh, bx, by));
      }
      // A few palms along the block edges.
      for (let i = 0; i < 3; i++) {
        trees.push({
          x: randRange(rng, x0, x1),
          y: pick(rng, [y0 + 4, y1 - 4]),
          r: randRange(rng, 9, 14),
          palm: true,
        });
      }
    }
  }

  // Docks on the east edge: piers, crates, containers.
  const docks = { x: 3120, y: 400, w: 240, h: 2200 };
  const crates = [];
  for (let i = 0; i < 26; i++) {
    crates.push({
      x: randRange(rng, docks.x + 20, docks.x + docks.w - 60),
      y: randRange(rng, docks.y + 20, docks.y + docks.h - 60),
      w: randRange(rng, 26, 44),
      h: randRange(rng, 26, 44),
      color: pick(rng, ['#e07a5f', '#81b29a', '#f4d35e', '#8ecae6', '#e5989b']),
    });
  }

  // Street lamps at every intersection corner.
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      lamps.push({ x: ax - ROAD_W / 2 - 6, y: sy - ROAD_W / 2 - 6 });
      lamps.push({ x: ax + ROAD_W / 2 + 6, y: sy + ROAD_W / 2 + 6 });
    }
  }

  // Beach palms along the shore.
  for (let x = 120; x < WORLD - 120; x += 130) {
    trees.push({ x: x + randRange(rng, -30, 30), y: randRange(rng, 3160, 3240), r: randRange(rng, 10, 15), palm: true });
  }

  return {
    seed,
    buildings,
    trees,
    lamps,
    crates,
    docks,
    avenues: AVENUES,
    streets: STREETS,
    // Named places the story and missions point at.
    places: {
      safehouse: { x: 600, y: 600, label: 'Safehouse' },
      docks: { x: 3240, y: 1500, label: 'Solmar Docks' },
      marina: { x: 3240, y: 700, label: 'Marina' },
      garage: { x: 1000, y: 2200, label: "Rosa's Garage" },
      penthouse: { x: 2200, y: 1000, label: 'Azure Penthouse' },
      park: { x: 800, y: 2400, label: 'Coral Park' },
      beach: { x: 1600, y: 3260, label: 'Solmar Beach' },
      plaza: { x: 1800, y: 1800, label: 'Plaza del Sol' },
    },
  };
}

function makeBuilding(rng, x, y, w, h, bx, by) {
  const tall = rng() < 0.22;
  return {
    x, y, w, h,
    roof: pick(rng, ROOF_COLORS),
    wall: pick(rng, WALL_COLORS),
    height: tall ? randRange(rng, 26, 42) : randRange(rng, 8, 18),
    windows: Math.max(2, Math.floor(w / 46)),
    downtown: bx >= 2 && bx <= 4 && by >= 2 && by <= 4,
  };
}

// True when the point is on a road (drivable), false on a block.
export function onRoad(city, x, y) {
  const near = (v, list) => list.some((c) => Math.abs(v - c) < ROAD_W / 2);
  return near(x, city.avenues) || near(y, city.streets);
}

// The road graph: intersections of avenues and streets.
export function intersections(city) {
  const pts = [];
  for (const ax of city.avenues) {
    for (const sy of city.streets) pts.push({ x: ax, y: sy });
  }
  return pts;
}

// Nearest intersection to a point.
export function nearestIntersection(city, x, y) {
  let best = null;
  let bd = Infinity;
  for (const ax of city.avenues) {
    for (const sy of city.streets) {
      const d = (ax - x) * (ax - x) + (sy - y) * (sy - y);
      if (d < bd) { bd = d; best = { x: ax, y: sy }; }
    }
  }
  return best;
}

// A random point on a road, for spawning traffic and parked cars.
export function randomRoadPoint(rng, city) {
  const vertical = rng() < 0.5;
  if (vertical) {
    return {
      x: pick(rng, city.avenues) + (rng() < 0.5 ? -20 : 20),
      y: randRange(rng, 120, WORLD - 120),
    };
  }
  return {
    x: randRange(rng, 120, WORLD - 120),
    y: pick(rng, city.streets) + (rng() < 0.5 ? -20 : 20),
  };
}

// Push a circle out of every building and crate it overlaps.
export function collideWorld(city, x, y, r) {
  let hit = false;
  for (const b of city.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 === 0) { y -= r; continue; }
      const d = Math.sqrt(d2);
      x += (dx / d) * (r - d);
      y += (dy / d) * (r - d);
    }
  }
  for (const c of city.crates) {
    const nx = clamp(x, c.x, c.x + c.w);
    const ny = clamp(y, c.y, c.y + c.h);
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 === 0) { y -= r; continue; }
      const d = Math.sqrt(d2);
      x += (dx / d) * (r - d);
      y += (dy / d) * (r - d);
    }
  }
  return { x: clamp(x, 40, WORLD - 40), y: clamp(y, 40, WORLD - 40), hit };
}
