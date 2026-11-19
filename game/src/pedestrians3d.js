// pedestrians3d.js — the people of Ember Isle: strollers on the sidewalks,
// market crowds in Caldera Vieja, beachgoers in Palma Sands. They walk their
// own routes, and they run from gunfire and from speeding cars.
import * as THREE from 'three';
import { terrainHeight, randomRoadPoint, collideWorld } from './terrain3d.js';
import { clamp, dist, randRange } from './util.js';

const SHIRTS = [0xd95a4a, 0x4a7ad9, 0x4ad97a, 0xe8c860, 0x9a5ad9, 0xffffff, 0x2a2d33, 0xd97a4a];
const PANTS = [0x2e4a6a, 0x3a3f46, 0x5a4a3a, 0x2a2d33, 0x6a6a5a];

// An articulated walker: legs and arms swing from hip/shoulder pivots.
export function buildPedMesh(shirt, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: PANTS[Math.floor(Math.random() * PANTS.length)], roughness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.85 });

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 0.58), pantsMat);
  hips.position.y = 1.02;
  hips.castShadow = true;
  g.add(hips);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.66), shirtMat);
  torso.position.y = 1.45;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), skinMat);
  head.position.y = 2.06;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), darkMat);
  hair.position.y = 2.1;
  g.add(hair);

  function limb(mat, w, h, d, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.y = -h / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  }
  const legL = limb(pantsMat, 0.22, 0.95, 0.26, 0, 0.98, 0.19);
  const legR = limb(pantsMat, 0.22, 0.95, 0.26, 0, 0.98, -0.19);
  const armL = limb(shirtMat, 0.18, 0.68, 0.22, 0, 1.72, 0.4);
  const armR = limb(shirtMat, 0.18, 0.68, 0.22, 0, 1.72, -0.4);
  g.add(legL);
  g.add(legR);
  g.add(armL);
  g.add(armR);
  g.userData.limbs = { legL, legR, armL, armR };
  return g;
}

export function spawnPed(game, x, z) {
  const shirt = SHIRTS[Math.floor(game.rng() * SHIRTS.length)];
  const skin = [0xe8b890, 0xc89060, 0x8a5a3a, 0xf0c8a0][Math.floor(game.rng() * 4)];
  const ped = {
    x, z,
    angle: game.rng() * Math.PI * 2,
    speed: 0,
    state: 'walk',
    panic: 0,
    target: null,
    mesh: buildPedMesh(shirt, skin),
    bob: game.rng() * 6,
  };
  ped.mesh.position.set(x, terrainHeight(x, z), z);
  game.scene.add(ped.mesh);
  game.peds.push(ped);
  return ped;
}

export function spawnPeds(game, n) {
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(game.rng);
    spawnPed(game, p.x + randRange(game.rng, -30, 30), p.z + randRange(game.rng, -30, 30));
  }
}

// Something loud or dangerous happened at (x, z): nearby peds run from it.
export function scarePeds(game, x, z, radius) {
  for (const ped of game.peds) {
    if (dist(ped.x, ped.z, x, z) < radius) {
      ped.state = 'flee';
      ped.panic = 3 + game.rng() * 2;
      const away = Math.atan2(ped.z - z, ped.x - x);
      ped.target = {
        x: ped.x + Math.cos(away) * 220,
        z: ped.z + Math.sin(away) * 220,
      };
    }
  }
}

function pickWalkTarget(game, ped) {
  const p = randomRoadPoint(game.rng);
  return { x: p.x + randRange(game.rng, -26, 26), z: p.z + randRange(game.rng, -26, 26) };
}

export function updatePeds(game, dt) {
  const p = game.player;
  for (let i = game.peds.length - 1; i >= 0; i--) {
    const ped = game.peds[i];
    if (dist(ped.x, ped.z, p.x, p.z) > 1000) {
      game.scene.remove(ped.mesh);
      game.peds.splice(i, 1);
      const q = randomRoadPoint(game.rng);
      spawnPed(game, q.x, q.z);
      continue;
    }
    // A car bearing down scares a ped out of the road.
    if (game.car) {
      const carSpeed = Math.hypot(game.car.vx, game.car.vz);
      if (carSpeed > 120 && dist(ped.x, ped.z, game.car.x, game.car.z) < 55) {
        ped.state = 'flee';
        ped.panic = 2;
        const away = Math.atan2(ped.z - game.car.z, ped.x - game.car.x);
        ped.target = { x: ped.x + Math.cos(away) * 160, z: ped.z + Math.sin(away) * 160 };
      }
    }
    if (ped.state === 'flee') {
      ped.panic -= dt;
      if (ped.panic <= 0) ped.state = 'walk';
    }
    if (!ped.target || dist(ped.x, ped.z, ped.target.x, ped.target.z) < 14) {
      ped.target = ped.state === 'flee' ? pickWalkTarget(game, ped) : pickWalkTarget(game, ped);
      if (ped.state === 'flee') ped.state = 'walk';
    }
    const want = Math.atan2(ped.target.z - ped.z, ped.target.x - ped.x);
    let d = want - ped.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    ped.angle += clamp(d, -3 * dt, 3 * dt);
    const speed = ped.state === 'flee' ? 150 : 55;
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.z += Math.sin(ped.angle) * speed * dt;
    const pushed = collideWorld(ped.x, ped.z, 2, game.island.buildings);
    ped.x = pushed.x;
    ped.z = pushed.z;
    ped.bob += dt * (ped.state === 'flee' ? 14 : 7);
    const h = terrainHeight(ped.x, ped.z);
    ped.mesh.position.set(ped.x, h + Math.abs(Math.sin(ped.bob)) * 0.12, ped.z);
    ped.mesh.rotation.y = -ped.angle;
    // Walk cycle: legs and arms swing opposite, faster when fleeing.
    const limbs = ped.mesh.userData.limbs;
    if (limbs) {
      const s = Math.sin(ped.bob);
      const amp = ped.state === 'flee' ? 0.85 : 0.55;
      limbs.legL.rotation.z = s * amp;
      limbs.legR.rotation.z = -s * amp;
      limbs.armL.rotation.z = -s * amp * 0.75;
      limbs.armR.rotation.z = s * amp * 0.75;
    }
  }
}
