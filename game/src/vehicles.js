// vehicles.js — cars: the player's arcade driving, traffic that follows the road
// graph, and police cruisers that chase and ram. All original Solmar Bay models.
import { TAU, angleDiff, angleLerp, clamp, dist, makeRng, pick, randRange } from './util.js';
import { collideWorld, nearestIntersection, onRoad, randomRoadPoint } from './city.js';

export const CAR_MODELS = [
  { name: 'Solmar Sedan', color: '#e07a5f', top: 330, accel: 210, grip: 2.6, len: 46, wid: 22 },
  { name: 'Bay Coupe', color: '#f4d35e', top: 380, accel: 250, grip: 3.0, len: 44, wid: 20 },
  { name: 'Dune Buggy', color: '#81b29a', top: 300, accel: 230, grip: 2.4, len: 42, wid: 24 },
  { name: 'Sunset Taxi', color: '#ffb703', top: 320, accel: 210, grip: 2.6, len: 46, wid: 22, taxi: true },
  { name: 'Harbor Van', color: '#8ecae6', top: 270, accel: 170, grip: 2.2, len: 52, wid: 24 },
  { name: 'Marina GT', color: '#e5989b', top: 430, accel: 300, grip: 3.4, len: 44, wid: 20 },
  { name: 'Palm Pickup', color: '#b5e48c', top: 310, accel: 220, grip: 2.5, len: 50, wid: 23 },
  { name: 'Cruiser', color: '#2b2d42', top: 400, accel: 290, grip: 3.2, len: 48, wid: 22, police: true },
];

export function makeCar(model, x, y, angle, opts = {}) {
  return {
    model,
    x, y, angle,
    speed: 0,
    steer: 0,
    health: 100,
    color: opts.color || model.color,
    driver: opts.driver ?? null, // 'traffic' | 'police' | 'player' | null (parked)
    target: null, // traffic: next intersection
    stuck: 0,
    dead: false,
    skid: 0,
    flash: 0,
    id: opts.id ?? Math.floor(Math.random() * 1e9),
  };
}

// Arcade car physics: accelerate, steer harder at low speed, drift with handbrake.
export function driveCar(car, dt, throttle, steer, handbrake) {
  const m = car.model;
  const forward = Math.cos(car.angle);
  const right = Math.sin(car.angle);
  const fSpeed = car.speed;
  let accel = throttle * m.accel;
  if (handbrake) accel *= 0.35;
  car.speed += accel * dt;
  // Drag and rolling resistance.
  car.speed -= car.speed * (handbrake ? 1.6 : 0.35) * dt;
  car.speed = clamp(car.speed, -m.top * 0.45, m.top);
  if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;
  const steerPower = clamp(Math.abs(car.speed) / 120, 0, 1) * m.grip;
  const dir = car.speed >= 0 ? 1 : -1;
  car.angle += steer * steerPower * dir * dt * (handbrake ? 1.35 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.x = nx;
  car.y = ny;
  if (handbrake && Math.abs(car.speed) > 140) car.skid = Math.max(car.skid, 0.35);
  car.skid = Math.max(0, car.skid - dt);
  return { forward, right, fSpeed };
}

// Traffic: pick the next intersection, drive toward it along the road, turn there.
export function updateTrafficCar(car, city, rng, dt) {
  if (!car.target) car.target = nearestIntersection(city, car.x, car.y);
  const t = car.target;
  const d = dist(car.x, car.y, t.x, t.y);
  if (d < 46) {
    // At an intersection: choose a new heading (never a U-turn).
    const dirs = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    ];
    const cur = { x: Math.round(Math.cos(car.angle)), y: Math.round(Math.sin(car.angle)) };
    const options = dirs.filter((o) => !(o.x === -cur.x && o.y === -cur.y));
    const pickDir = pick(rng, options);
    // Next intersection one block away in that direction.
    const step = 400;
    let nx = t.x + pickDir.x * step;
    let ny = t.y + pickDir.y * step;
    nx = clamp(nx, 200, 3000);
    ny = clamp(ny, 200, 3000);
    car.target = { x: nx, y: ny };
    car.stuck = 0;
  }
  const wantAngle = Math.atan2(t.y - car.y, t.x - car.x);
  const diff = angleDiff(car.angle, wantAngle);
  const steer = clamp(diff * 2.2, -1, 1);
  const speedTarget = 120 + Math.sin(car.id) * 25;
  const throttle = car.speed < speedTarget ? 1 : 0;
  driveCar(car, dt, throttle, steer, false);
  car.angle = angleLerp(car.angle, wantAngle, clamp(Math.abs(diff) * 0.4, 0, 1) * dt * 2);
  if (Math.abs(car.speed) < 8) car.stuck += dt;
  else car.stuck = 0;
  if (car.stuck > 3) {
    car.target = nearestIntersection(city, car.x, car.y);
    car.stuck = 0;
  }
}

// Police cruiser: steer hard toward the target and ram it.
export function updatePoliceCar(car, tx, ty, dt) {
  const wantAngle = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, wantAngle);
  const steer = clamp(diff * 2.6, -1, 1);
  const d = dist(car.x, car.y, tx, ty);
  const throttle = d > 60 ? 1 : 0.4;
  driveCar(car, dt, throttle, steer, false);
  car.angle = angleLerp(car.angle, wantAngle, 0.5 * dt);
}

// Keep a car out of buildings and inside the world.
export function collideCar(city, car) {
  const before = { x: car.x, y: car.y };
  const r = Math.max(car.model.len, car.model.wid) * 0.5;
  const res = collideWorld(city, car.x, car.y, r * 0.85);
  car.x = res.x;
  car.y = res.y;
  if (res.hit && Math.abs(car.speed) > 120) {
    car.speed *= 0.45;
    car.health -= 6;
    return true;
  }
  if (res.hit) car.speed *= 0.7;
  return res.hit && (before.x !== car.x || before.y !== car.y);
}

// Simple circle push between two cars; returns true on a hard bump.
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const min = 30;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min || d2 === 0) return false;
  const d = Math.sqrt(d2);
  const push = (min - d) / 2;
  const nx = dx / d;
  const ny = dy / d;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const rel = Math.abs(a.speed - b.speed);
  a.speed *= 0.85;
  b.speed *= 0.85;
  return rel > 90;
}

// Spawn a parked car on a road edge.
export function spawnParkedCar(rng, city, modelIndex) {
  const p = randomRoadPoint(rng, city);
  const model = CAR_MODELS[modelIndex ?? Math.floor(rng() * (CAR_MODELS.length - 1))];
  const angle = onRoad(city, p.x + 60, p.y) ? 0 : Math.PI / 2;
  return makeCar(model, p.x, p.y, angle, { driver: null });
}

export function spawnTrafficCar(rng, city) {
  const p = randomRoadPoint(rng, city);
  const model = CAR_MODELS[Math.floor(rng() * (CAR_MODELS.length - 1))];
  const angle = pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
  const car = makeCar(model, p.x, p.y, angle, { driver: 'traffic' });
  car.speed = 100;
  return car;
}

export function spawnPoliceCar(rng, city, nearX, nearY) {
  // Appear on a road a short way from the player.
  let p;
  for (let i = 0; i < 12; i++) {
    p = randomRoadPoint(rng, city);
    if (dist(p.x, p.y, nearX, nearY) > 500 && dist(p.x, p.y, nearX, nearY) < 1100) break;
  }
  const car = makeCar(CAR_MODELS[7], p.x, p.y, Math.atan2(nearY - p.y, nearX - p.x), { driver: 'police' });
  car.speed = 140;
  return car;
}
