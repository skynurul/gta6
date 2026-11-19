// police.js — the Isle PD: heat that turns into wanted stars, cruisers that
// spawn on the roads, chase, ram, and (at two stars and up) shoot. Getting
// busted on foot costs a fine and a trip back to the safehouse.
import { createCar, steerCarToward, driveCar, syncCarMesh } from './vehicles3d.js';
import { snapToRoad, terrainHeight, districtFor } from './terrain3d.js';
import { dist, clamp } from './util.js';
import { scarePeds } from './pedestrians3d.js';

export function starsFor(heat) {
  return Math.min(5, Math.floor(heat / 20));
}

export function addHeat(game, n, reason) {
  const before = game.police.stars;
  game.police.heat = clamp(game.police.heat + n, 0, 100);
  game.police.stars = starsFor(game.police.heat);
  if (game.police.stars > before) {
    game.hud.toast(`Wanted level ${game.police.stars} — Isle PD is on you`, 'bad');
    game.audio.blip(180, 0.3, 'sawtooth', 0.2, 90);
  }
  if (reason) game.stats.crimes++;
}

export function updatePolice(game, dt) {
  const pol = game.police;
  const p = game.player;

  // Heat cools when Juno keeps a low profile.
  if (pol.heat > 0 && game.time - pol.lastCrime > 6) {
    pol.heat = Math.max(0, pol.heat - 3.5 * dt);
    pol.stars = starsFor(pol.heat);
  }

  // How many cruisers the current heat can field (standing softens it).
  const d = districtFor(p.x, p.z);
  const response = game.standing.response(d.id);
  const want = Math.min(5, Math.round(pol.stars * response));
  pol.spawnT -= dt;
  if (game.cruisers.length < want && pol.spawnT <= 0 && pol.stars > 0) {
    pol.spawnT = 2.5;
    const a = Math.random() * Math.PI * 2;
    const s = snapToRoad(p.x + Math.cos(a) * 320, p.z + Math.sin(a) * 320);
    const cruiser = createCar('police', s.x, s.z, Math.random() * Math.PI * 2);
    cruiser.cruiser = true;
    cruiser.shootT = 1 + Math.random();
    game.scene.add(cruiser.mesh);
    game.cruisers.push(cruiser);
    game.cars.push(cruiser);
  }

  for (let i = game.cruisers.length - 1; i >= 0; i--) {
    const c = game.cruisers[i];
    const dp = dist(c.x, c.z, p.x, p.z);
    if (pol.stars === 0 || dp > 1300) {
      game.scene.remove(c.mesh);
      game.cars.splice(game.cars.indexOf(c), 1);
      game.cruisers.splice(i, 1);
      continue;
    }
    const ctl = steerCarToward(c, p.x, p.z, 300 + pol.stars * 18);
    const crash = driveCar(c, ctl, dt, game.island);
    if (crash > 60) game.audio.crash();
    syncCarMesh(c);
    // Ramming the player's car slows it down hard.
    if (game.car && dist(c.x, c.z, game.car.x, game.car.z) < 11) {
      game.car.speed *= 0.92;
      game.car.vx *= 0.9;
      game.car.vz *= 0.9;
      if (Math.abs(game.car.speed) > 120 && game.time - pol.lastBump > 1) {
        pol.lastBump = game.time;
        game.audio.crash();
        game.combat.spawnParticles(game.car.x, terrainHeight(game.car.x, game.car.z) + 2, game.car.z, 8, 40, 30);
      }
    }
    // On foot and cornered: the bust timer runs.
    if (!game.car && dp < 14 && Math.hypot(c.vx, c.vz) < 90) {
      pol.bustT += dt;
      if (pol.bustT > 0.1 && !pol.bustWarned) {
        pol.bustWarned = true;
        game.hud.toast('Isle PD is closing in — run!', 'bad');
      }
      if (pol.bustT > 2.6) {
        pol.bustT = 0;
        pol.bustWarned = false;
        game.busted();
        return;
      }
    } else {
      pol.bustT = 0;
      pol.bustWarned = false;
    }
    // At two stars and up, cruisers shoot at Juno on foot.
    if (pol.stars >= 2 && !game.car && dp < 260) {
      c.shootT -= dt;
      if (c.shootT <= 0) {
        c.shootT = 1.1 + Math.random() * 0.7;
        const gy = terrainHeight(c.x, c.z) + 2.5;
        const py = terrainHeight(p.x, p.z) + 3;
        const dx = p.x - c.x;
        const dy = py - gy;
        const dz = p.z - c.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        const spread = 0.08;
        game.combat.fireBullet(
          { x: c.x, y: gy, z: c.z },
          {
            x: dx / len + (Math.random() - 0.5) * spread,
            y: dy / len + (Math.random() - 0.5) * spread * 0.4,
            z: dz / len + (Math.random() - 0.5) * spread,
          },
          420, false,
        );
        game.audio.shot();
        scarePeds(game, p.x, p.z, 120);
      }
    }
  }

  if (pol.stars > 0) game.audio.siren(dt);
}
