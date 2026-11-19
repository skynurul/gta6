// pedestrians.js — the people of Solmar Bay: strollers on the sidewalks who
// wander, cross at corners, and run screaming from gunfire and speeding cars.
import { TAU, clamp, dist, makeRng, pick, randRange } from './util.js';
import { collideWorld, nearestIntersection } from './city.js';

const SHIRTS = ['#e63946', '#2a9d8f', '#e9c46a', '#f4a261', '#9b5de5', '#00bbf9', '#f15bb5', '#e07a5f'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

export function makePed(rng, x, y) {
  return {
    x, y,
    angle: randRange(rng, 0, TAU),
    speed: randRange(rng, 34, 58),
    shirt: pick(rng, SHIRTS),
    skin: pick(rng, SKINS),
    walkPhase: randRange(rng, 0, TAU),
    target: null,
    panic: 0,
    panicX: 0,
    panicY: 0,
    dead: false,
  };
}

export function spawnPed(rng, city) {
  // Start on a sidewalk beside a road.
  const p = nearestIntersection(city, randRange(rng, 200, 3000), randRange(rng, 200, 3000));
  return makePed(rng, p.x + randRange(rng, -70, 70), p.y + randRange(rng, -70, 70));
}

export function updatePed(ped, city, rng, dt, danger) {
  if (ped.dead) return;
  ped.walkPhase += dt * 8;
  // Danger nearby: run away from it.
  if (danger) {
    const d = dist(ped.x, ped.y, danger.x, danger.y);
    if (d < danger.r) {
      ped.panic = 1.6;
      ped.panicX = danger.x;
      ped.panicY = danger.y;
    }
  }
  if (ped.panic > 0) {
    ped.panic -= dt;
    const away = Math.atan2(ped.y - ped.panicY, ped.x - ped.panicX);
    ped.angle += (away - ped.angle) * 0.2;
    ped.x += Math.cos(away) * 150 * dt;
    ped.y += Math.sin(away) * 150 * dt;
  } else {
    if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 30) {
      const t = nearestIntersection(city, ped.x, ped.y);
      const dirs = [[400, 0], [-400, 0], [0, 400], [0, -400]];
      const d = pick(rng, dirs);
      ped.target = {
        x: clamp(t.x + d[0], 200, 3000),
        y: clamp(t.y + d[1], 200, 3000),
      };
    }
    const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
    let diff = want - ped.angle;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    ped.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
  }
  const res = collideWorld(city, ped.x, ped.y, 10);
  ped.x = res.x;
  ped.y = res.y;
}
