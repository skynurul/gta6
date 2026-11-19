// combat3d.js — bullets and particles in 3D: a small pool of glowing tracer
// spheres, and one THREE.Points cloud for smoke, sparks and blood-red dust.
// No per-frame allocation: the pools are created once and reused.
import * as THREE from 'three';
import { terrainHeight, insideBuilding } from './terrain3d.js';
import { dist } from './util.js';

const MAX_BULLETS = 24;
const MAX_PARTICLES = 240;

export function createCombat(scene) {
  const bulletGeo = new THREE.SphereGeometry(0.32, 6, 5);
  const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  const bullets = [];
  for (let i = 0; i < MAX_BULLETS; i++) {
    const mesh = new THREE.Mesh(bulletGeo, bulletMat);
    mesh.visible = false;
    scene.add(mesh);
    bullets.push({ mesh, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, fromPlayer: true });
  }

  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pVel = new Float32Array(MAX_PARTICLES * 3);
  const pLife = new Float32Array(MAX_PARTICLES);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: 0xffc860, size: 2.2, transparent: true, opacity: 0.9, sizeAttenuation: true });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  let pCursor = 0;

  function spawnParticles(x, y, z, count, spread, up) {
    for (let i = 0; i < count; i++) {
      const idx = pCursor;
      pCursor = (pCursor + 1) % MAX_PARTICLES;
      pPos[idx * 3] = x;
      pPos[idx * 3 + 1] = y;
      pPos[idx * 3 + 2] = z;
      pVel[idx * 3] = (Math.random() - 0.5) * spread;
      pVel[idx * 3 + 1] = Math.random() * up;
      pVel[idx * 3 + 2] = (Math.random() - 0.5) * spread;
      pLife[idx] = 0.5 + Math.random() * 0.5;
    }
  }

  function fireBullet(from, dir, speed, fromPlayer) {
    for (const b of bullets) {
      if (b.active) continue;
      b.active = true;
      b.mesh.visible = true;
      b.x = from.x;
      b.y = from.y;
      b.z = from.z;
      b.vx = dir.x * speed;
      b.vy = dir.y * speed;
      b.vz = dir.z * speed;
      b.life = 1.6;
      b.fromPlayer = fromPlayer;
      return b;
    }
    return null;
  }

  // Move every bullet; returns an array of hit events for the game to resolve:
  // {type: 'car'|'ped'|'player'|'wall', x, y, z, target}
  function updateBullets(game, dt) {
    const hits = [];
    for (const b of bullets) {
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      const ground = terrainHeight(b.x, b.z);
      let dead = b.life <= 0 || b.y < ground || b.y > ground + 400;
      if (!dead && insideBuilding(b.x, b.z, game.island.buildings)) {
        const cx = b.x;
        const cz = b.z;
        const bb = game.island.buildings.find((bl) => cx >= bl.x && cx <= bl.x + bl.w && cz >= bl.z && cz <= bl.z + bl.d);
        if (bb && b.y < ground + bb.h + 2) dead = true;
      }
      if (!dead && !b.fromPlayer && game.player.alive) {
        if (dist(b.x, b.z, game.player.x, game.player.z) < 3.5 && Math.abs(b.y - (ground + 3)) < 4) {
          hits.push({ type: 'player', x: b.x, y: b.y, z: b.z });
          dead = true;
        }
      }
      if (!dead && b.fromPlayer) {
        for (const car of game.cars) {
          if (dist(b.x, b.z, car.x, car.z) < car.model.len * 0.55 && Math.abs(b.y - (ground + 2)) < 4) {
            hits.push({ type: 'car', x: b.x, y: b.y, z: b.z, target: car });
            dead = true;
            break;
          }
        }
      }
      if (!dead && b.fromPlayer) {
        for (const ped of game.peds) {
          if (dist(b.x, b.z, ped.x, ped.z) < 3 && Math.abs(b.y - (ground + 3)) < 4) {
            hits.push({ type: 'ped', x: b.x, y: b.y, z: b.z, target: ped });
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        b.active = false;
        b.mesh.visible = false;
        spawnParticles(b.x, b.y, b.z, 5, 26, 30);
      } else {
        b.mesh.position.set(b.x, b.y, b.z);
      }
    }
    return hits;
  }

  function updateParticles(dt) {
    let any = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      if (pLife[i] <= 0) {
        pPos[i * 3 + 1] = -1000;
        continue;
      }
      any = true;
      pVel[i * 3 + 1] -= 60 * dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    }
    if (any) pGeo.attributes.position.needsUpdate = true;
  }

  return { fireBullet, updateBullets, updateParticles, spawnParticles, bullets };
}
