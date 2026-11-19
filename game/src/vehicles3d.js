// vehicles3d.js — Ember Isle's cars: primitive-built 3D models, arcade
// driving physics on the XZ plane, and traffic that follows the road graph.
// Headings are angles in the XZ plane, forward = (cos a, 0, sin a); turning
// left increases the angle. Mesh rotation.y is therefore -angle.
import * as THREE from 'three';
import {
  terrainHeight, onRoad, nearestIntersection, randomRoadPoint, collideWorld,
} from './terrain3d.js';
import { angleDiff, clamp, dist } from './util.js';

export const CAR_MODELS = [
  { id: 'sedan', name: 'Ash Sedan', top: 310, accel: 210, grip: 6.5, len: 9, wid: 4.4, color: 0x7a8a99, kind: 'sedan' },
  { id: 'coupe', name: 'Ember Coupe', top: 350, accel: 250, grip: 7.5, len: 8.4, wid: 4.2, color: 0xc23a1e, kind: 'coupe' },
  { id: 'gt', name: 'Cinder GT', top: 430, accel: 300, grip: 8, len: 9.2, wid: 4.6, color: 0xe8b400, kind: 'gt' },
  { id: 'taxi', name: 'Island Taxi', top: 300, accel: 200, grip: 6.5, len: 9, wid: 4.4, color: 0xe8d020, kind: 'taxi' },
  { id: 'van', name: 'Cargo Van', top: 260, accel: 160, grip: 5.5, len: 10.5, wid: 5, color: 0x8a7a6a, kind: 'van' },
  { id: 'pickup', name: 'Ash Pickup', top: 320, accel: 230, grip: 6, len: 10, wid: 4.8, color: 0x3a6a8a, kind: 'pickup' },
  { id: 'police', name: 'Isle PD Cruiser', top: 380, accel: 280, grip: 8, len: 9.4, wid: 4.6, color: 0x1a1a22, kind: 'police' },
];

export function modelById(id) {
  return CAR_MODELS.find((m) => m.id === id) || CAR_MODELS[0];
}

// Shared materials: paint is per-car, everything else is shared so the
// scene reuses programs and the draw calls stay cheap.
const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e141c, metalness: 0.9, roughness: 0.12 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.0, roughness: 0.95 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.3 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, metalness: 0.4, roughness: 0.6 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dce2, metalness: 1.0, roughness: 0.18 });
const lightFrontMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.2 });
const lightRearMat = new THREE.MeshStandardMaterial({ color: 0x8a1010, emissive: 0xc01818, emissiveIntensity: 1.0, metalness: 0.2, roughness: 0.2 });
const lightRedMat = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 1.6, metalness: 0.2, roughness: 0.2 });
const lightBlueMat = new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x2040ff, emissiveIntensity: 1.6, metalness: 0.2, roughness: 0.2 });

// Extrude a side-profile polygon (x = length, y = height) across the car's
// width, with a rounded bevel so the body reads as sculpted metal, not a box.
function extrudeProfile(points, depth, bevel) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 2, steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

function part(geo, mat, x, y, z, shadow) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = !!shadow;
  return mesh;
}

function boxPart(w, h, d, mat, x, y, z, shadow) {
  return part(new THREE.BoxGeometry(w, h, d), mat, x, y, z, shadow);
}

// Build one car from a sculpted extruded body, a dark glass greenhouse,
// and detailed wheels. Forward is local +X.
export function buildCarMesh(model) {
  const g = new THREE.Group();
  const len = model.len;
  const wid = model.wid;
  const hl = len / 2;
  const paint = new THREE.MeshStandardMaterial({ color: model.color, metalness: 0.55, roughness: 0.32 });

  if (model.kind === 'van') {
    // Tall slab body with a sloped nose, glass band and side windows.
    const bodyPts = [
      [-hl + 0.2, 0.35], [-hl - 0.05, 0.8], [-hl, 2.45],
      [hl - 0.6, 2.45], [hl + 0.05, 1.6], [hl + 0.05, 0.8], [hl - 0.2, 0.35],
    ];
    g.add(part(extrudeProfile(bodyPts, wid - 0.6, 0.3), paint, 0, 0, 0, true));
    const shield = boxPart(0.1, 1.0, wid * 0.8, glassMat, hl - 0.15, 1.85, 0, false);
    shield.rotation.z = -0.5;
    g.add(shield);
    g.add(boxPart(len * 0.5, 0.65, 0.08, glassMat, -0.4, 1.95, wid / 2 - 0.02, false));
    g.add(boxPart(len * 0.5, 0.65, 0.08, glassMat, -0.4, 1.95, -wid / 2 + 0.02, false));
  } else {
    // Lower body: hood and trunk lines with a rounded bevel.
    const bodyPts = [
      [-hl + 0.2, 0.35], [-hl - 0.05, 0.6], [-hl, 0.95], [-hl + 1.0, 1.08],
      [hl - 1.1, 1.08], [hl, 0.95], [hl + 0.05, 0.6], [hl - 0.2, 0.35],
    ];
    g.add(part(extrudeProfile(bodyPts, wid - 0.6, 0.3), paint, 0, 0, 0, true));
    if (model.kind === 'pickup') {
      // Cab up front, open bed at the rear.
      const cabPts = [[0.3, 1.02], [1.2, 1.9], [hl - 1.3, 1.9], [hl - 0.6, 1.02]];
      g.add(part(extrudeProfile(cabPts, wid * 0.84 - 0.3, 0.15), glassMat, 0, 0, 0, true));
      const bedY = 1.25;
      g.add(boxPart(len * 0.42, 0.5, wid * 0.9, trimMat, -hl + len * 0.24, bedY, 0, false));
      g.add(boxPart(0.15, 0.55, wid * 0.9, paint, -hl + 0.1, bedY + 0.15, 0, false));
      g.add(boxPart(len * 0.42, 0.55, 0.12, paint, -hl + len * 0.24, bedY + 0.15, wid / 2 - 0.06, false));
      g.add(boxPart(len * 0.42, 0.55, 0.12, paint, -hl + len * 0.24, bedY + 0.15, -wid / 2 + 0.06, false));
    } else {
      // Glass greenhouse: windshield slope, roof, rear window.
      const sporty = model.kind === 'coupe' || model.kind === 'gt';
      const roofH = sporty ? 1.78 : 1.92;
      const cabPts = [
        [-hl + 1.8, 1.02], [-hl + 2.8, roofH], [hl - 3.1, roofH], [hl - 2.1, 1.02],
      ];
      g.add(part(extrudeProfile(cabPts, wid * 0.84 - 0.3, 0.15), glassMat, 0, 0, 0, true));
    }
  }

  // Bumpers, grille, lights, mirrors, exhaust.
  g.add(boxPart(0.5, 0.35, wid * 0.92, chromeMat, hl + 0.05, 0.55, 0, false));
  g.add(boxPart(0.5, 0.35, wid * 0.92, chromeMat, -hl - 0.05, 0.55, 0, false));
  g.add(boxPart(0.12, 0.4, wid * 0.5, trimMat, hl + 0.08, 0.85, 0, false));
  g.add(boxPart(0.15, 0.28, 0.9, lightFrontMat, hl + 0.06, 0.95, wid / 2 - 0.75, false));
  g.add(boxPart(0.15, 0.28, 0.9, lightFrontMat, hl + 0.06, 0.95, -wid / 2 + 0.75, false));
  g.add(boxPart(0.15, 0.28, 0.9, lightRearMat, -hl - 0.06, 0.95, wid / 2 - 0.75, false));
  g.add(boxPart(0.15, 0.28, 0.9, lightRearMat, -hl - 0.06, 0.95, -wid / 2 + 0.75, false));
  g.add(boxPart(0.35, 0.18, 0.14, trimMat, hl * 0.42, 1.35, wid / 2 + 0.06, false));
  g.add(boxPart(0.35, 0.18, 0.14, trimMat, hl * 0.42, 1.35, -wid / 2 - 0.06, false));
  const exhaust = part(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8), chromeMat, -hl - 0.1, 0.4, wid * 0.25, false);
  exhaust.rotation.z = Math.PI / 2;
  g.add(exhaust);

  if (model.kind === 'gt') {
    // Rear wing on two struts.
    g.add(boxPart(1.1, 0.08, wid * 0.8, trimMat, -hl + 0.5, 1.55, 0, false));
    g.add(boxPart(0.12, 0.4, 0.12, trimMat, -hl + 0.8, 1.32, wid * 0.3, false));
    g.add(boxPart(0.12, 0.4, 0.12, trimMat, -hl + 0.8, 1.32, -wid * 0.3, false));
    g.add(boxPart(0.15, 0.22, wid * 0.7, lightRearMat, -hl - 0.06, 1.05, 0, false));
  }
  if (model.kind === 'police') {
    // White roof and a red/blue light bar.
    g.add(boxPart(len * 0.42, 0.08, wid * 0.72, new THREE.MeshStandardMaterial({ color: 0xf0f0f0, metalness: 0.4, roughness: 0.4 }), 0, 1.96, 0, false));
    g.add(boxPart(1.2, 0.18, wid * 0.55, trimMat, 0, 2.06, 0, false));
    g.add(boxPart(0.55, 0.26, 0.7, lightRedMat, 0, 2.24, 0.75, false));
    g.add(boxPart(0.55, 0.26, 0.7, lightBlueMat, 0, 2.24, -0.75, false));
  }
  if (model.kind === 'taxi') {
    g.add(boxPart(1.3, 0.35, 1.6, new THREE.MeshStandardMaterial({ color: 0xe8d020, emissive: 0x8a7010, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.4 }), 0, 2.06, 0, false));
  }

  // Wheels: tire + bright rim + a spoke bar so spin reads. Axle is local Z.
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.42, 16);
  tireGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.44, 12);
  rimGeo.rotateX(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.62, 0.1, 0.46);
  const positions = [
    [len * 0.32, wid / 2 - 0.12, true],
    [len * 0.32, -wid / 2 + 0.12, true],
    [-len * 0.32, wid / 2 - 0.12, false],
    [-len * 0.32, -wid / 2 + 0.12, false],
  ];
  for (const [wx, wz, front] of positions) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.55, wz);
    const spin = new THREE.Group();
    spin.add(part(tireGeo, tireMat, 0, 0, 0, true));
    spin.add(part(rimGeo, rimMat, 0, 0, 0, false));
    spin.add(part(spokeGeo, trimMat, 0, 0, 0, false));
    pivot.add(spin);
    g.add(pivot);
    wheels.push({ pivot, spin, front });
  }
  g.userData.wheels = wheels;
  g.userData.model = model;
  return g;
}

export function createCar(modelId, x, z, angle, opts) {
  const model = modelById(modelId);
  const car = {
    model,
    x, z, angle,
    vx: 0, vz: 0,
    speed: 0,
    steer: 0,
    mesh: buildCarMesh(model),
    traffic: false,
    target: null,
    cruise: 150,
    ...(opts || {}),
  };
  car.mesh.position.set(x, terrainHeight(x, z), z);
  car.mesh.rotation.y = -angle;
  return car;
}

// Sync a car object onto its mesh: position, heading, terrain pitch/roll.
export function syncCarMesh(car) {
  const h = terrainHeight(car.x, car.z);
  const fx = Math.cos(car.angle);
  const fz = Math.sin(car.angle);
  const hF = terrainHeight(car.x + fx * 3, car.z + fz * 3);
  const hB = terrainHeight(car.x - fx * 3, car.z - fz * 3);
  const hL = terrainHeight(car.x - fz * 3, car.z + fx * 3);
  const hR = terrainHeight(car.x + fz * 3, car.z - fx * 3);
  car.mesh.position.set(car.x, h, car.z);
  car.mesh.rotation.order = 'YXZ';
  car.mesh.rotation.y = -car.angle;
  car.mesh.rotation.z = Math.atan2(hF - hB, 6);
  car.mesh.rotation.x = Math.atan2(hL - hR, 6);
  const spin = car.speed * 0.016 / 0.55;
  for (const w of car.mesh.userData.wheels) {
    w.spin.rotation.z -= spin;
    if (w.front) w.pivot.rotation.y = -car.steer * 0.42;
  }
}

// Arcade driving: speed along the heading, velocity lerped toward it by grip.
// ctl: {up, down, left, right, handbrake}. Returns the speed lost in a crash.
export function driveCar(car, ctl, dt, ctx) {
  const m = car.model;
  const offroad = !onRoad(car.x, car.z);
  const top = (car.topMul || 1) * (offroad ? m.top * 0.62 : m.top);
  if (ctl.up) car.speed += m.accel * dt;
  if (ctl.down) car.speed -= m.accel * 0.8 * dt;
  if (!ctl.up && !ctl.down) {
    car.speed -= car.speed * 0.6 * dt;
    if (Math.abs(car.speed) < 2) car.speed = 0;
  }
  car.speed = clamp(car.speed, -top * 0.4, top);
  const steerIn = (ctl.right ? 1 : 0) - (ctl.left ? 1 : 0);
  const gripNow = (car.gripMul || 1) * (ctl.handbrake ? 1.6 : m.grip);
  // Turning left decreases the heading angle (forward = (cos a, sin a) on
  // the XZ plane, and left of north is west). Reversing flips the steering.
  const turnRate = 2.1 * (1 - (Math.abs(car.speed) / m.top) * 0.5) * (ctl.handbrake ? 1.5 : 1);
  car.angle += steerIn * turnRate * dt * (car.speed >= 0 ? 1 : -1);
  car.steer = steerIn;
  const fx = Math.cos(car.angle);
  const fz = Math.sin(car.angle);
  const tx = fx * car.speed;
  const tz = fz * car.speed;
  const k = Math.min(1, gripNow * dt);
  car.vx += (tx - car.vx) * k;
  car.vz += (tz - car.vz) * k;
  if (offroad) {
    car.vx *= 1 - 0.5 * dt;
    car.vz *= 1 - 0.5 * dt;
  }
  const prevSpeed = Math.hypot(car.vx, car.vz);
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  // Buildings push the car out; a hard hit scrubs speed.
  const before = { x: car.x, z: car.z };
  const pushed = collideWorld(car.x, car.z, m.len * 0.45, ctx.buildings);
  car.x = pushed.x;
  car.z = pushed.z;
  let crash = 0;
  if (before.x !== car.x || before.z !== car.z) {
    crash = prevSpeed;
    car.vx *= 0.4;
    car.vz *= 0.4;
    car.speed *= 0.5;
  }
  return crash;
}

// Steer a car toward a point, as if a driver were holding the wheel.
// Returns the control object driveCar understands. A positive angle
// difference means the target is at a larger heading, which is a right turn.
export function steerCarToward(car, tx, tz, topSpeed, handbrake) {
  const want = Math.atan2(tz - car.z, tx - car.x);
  const d = angleDiff(car.angle, want);
  const steer = Math.abs(d) < 0.08 ? 0 : d > 0 ? 1 : -1;
  return {
    up: Math.abs(car.speed) < topSpeed,
    down: false,
    left: steer === -1,
    right: steer === 1,
    handbrake: !!handbrake,
  };
}

// Keep two cars from overlapping: push apart and trade a little speed.
export function collideCars(a, b) {
  const ra = a.model.len * 0.42;
  const rb = b.model.len * 0.42;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d2 = dx * dx + dz * dz;
  const min = ra + rb;
  if (d2 >= min * min || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const push = (min - d) / 2;
  const nx = dx / d;
  const nz = dz / d;
  a.x -= nx * push;
  a.z -= nz * push;
  b.x += nx * push;
  b.z += nz * push;
  const rel = Math.abs((a.vx - b.vx) * nx + (a.vz - b.vz) * nz);
  a.vx *= 0.85;
  a.vz *= 0.85;
  b.vx *= 0.85;
  b.vz *= 0.85;
  a.speed *= 0.9;
  b.speed *= 0.9;
  return rel;
}

export function spawnTrafficCar(game) {
  const p = randomRoadPoint(game.rng);
  const ids = ['sedan', 'coupe', 'taxi', 'van', 'pickup'];
  const car = createCar(ids[Math.floor(game.rng() * ids.length)], p.x, p.z, game.rng() * Math.PI * 2, {
    traffic: true,
    cruise: 120 + game.rng() * 70,
  });
  const t = nearestIntersection(p.x, p.z);
  car.target = t;
  game.scene.add(car.mesh);
  game.cars.push(car);
  return car;
}

// Traffic: drive toward the target intersection, pick a new one on arrival,
// slow for the car ahead, despawn far away and respawn near the player.
export function updateTraffic(game, dt) {
  const p = game.player;
  for (let i = game.cars.length - 1; i >= 0; i--) {
    const car = game.cars[i];
    if (!car.traffic) continue;
    if (dist(car.x, car.z, p.x, p.z) > 1100) {
      game.scene.remove(car.mesh);
      game.cars.splice(i, 1);
      spawnTrafficCar(game);
      continue;
    }
    if (!car.target || dist(car.x, car.z, car.target.x, car.target.z) < 45) {
      const cur = nearestIntersection(car.x, car.z);
      const opts = [];
      for (const a of [cur.x - 400, cur.x + 400]) {
        if (a >= 200 && a <= 3000) opts.push({ x: a, z: cur.z });
      }
      for (const s of [cur.z - 400, cur.z + 400]) {
        if (s >= 200 && s <= 3000) opts.push({ x: cur.x, z: s });
      }
      car.target = opts[Math.floor(game.rng() * opts.length)] || cur;
    }
    let top = car.cruise;
    for (const other of game.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const ahead = dx * Math.cos(car.angle) + dz * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dz * Math.cos(car.angle));
      if (ahead > 0 && ahead < 34 && side < 7) {
        top = Math.min(top, Math.max(0, Math.hypot(other.vx, other.vz) * 0.8));
      }
    }
    const ctl = steerCarToward(car, car.target.x, car.target.z, top);
    driveCar(car, ctl, dt, game.island);
    syncCarMesh(car);
  }
  for (let i = 0; i < game.cars.length; i++) {
    for (let j = i + 1; j < game.cars.length; j++) {
      collideCars(game.cars[i], game.cars[j]);
    }
  }
}
