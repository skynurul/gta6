// police.js — the wanted system: stars rise with crimes, fall when Leo stays
// clean and unseen, and the Solmar Bay PD answers with cruisers that chase, ram,
// and, on foot, try to bust him. Getting busted costs cash and the mission.
import { clamp, dist } from './util.js';
import { spawnPoliceCar } from './vehicles.js';

export const MAX_WANTED = 5;

export function makePolice() {
  return {
    wanted: 0,
    heat: 0, // 0..100, drives the star count
    unseen: 0, // seconds since a cop last saw Leo
    busted: 0, // bust timer while a cop is close on foot
    sirens: false,
  };
}

export function addHeat(police, amount) {
  police.heat = clamp(police.heat + amount, 0, 100);
  police.wanted = heatToStars(police.heat);
  police.unseen = 0;
}

export function heatToStars(heat) {
  if (heat < 8) return 0;
  if (heat < 25) return 1;
  if (heat < 45) return 2;
  if (heat < 65) return 3;
  if (heat < 85) return 4;
  return 5;
}

export function wantedForStars(stars) {
  return { 0: 0, 1: 12, 2: 30, 3: 50, 4: 70, 5: 90 }[stars] ?? 0;
}

export function setWanted(police, stars) {
  police.wanted = clamp(stars, 0, MAX_WANTED);
  police.heat = wantedForStars(police.wanted);
  police.unseen = 0;
}

// How many cruisers the current heat can field.
export function cruisersWanted(police) {
  return [0, 1, 2, 3, 4, 5][police.wanted];
}

// Update heat decay, bust logic and cruiser spawning. Returns events.
export function updatePolice(police, game, dt) {
  const events = [];
  const px = game.player.x;
  const py = game.player.y;
  const cops = game.cars.filter((c) => c.driver === 'police' && !c.dead);

  // A cop close by keeps the heat up; otherwise it cools off.
  let seen = false;
  for (const c of cops) {
    if (dist(c.x, c.y, px, py) < 620) { seen = true; break; }
  }
  if (seen) police.unseen = 0;
  else police.unseen += dt;

  if (police.wanted > 0 && police.unseen > 6) {
    police.heat = Math.max(0, police.heat - dt * 2.2);
    const stars = heatToStars(police.heat);
    if (stars < police.wanted) {
      police.wanted = stars;
      events.push({ type: 'heatDown', stars });
    }
  }
  if (police.wanted === 0) police.heat = Math.max(0, police.heat - dt * 4);

  // Spawn cruisers up to the wanted level; remove extras when the heat falls.
  const want = cruisersWanted(police);
  if (cops.length < want && game.time - (police.lastSpawn || 0) > 1.2) {
    police.lastSpawn = game.time;
    const car = spawnPoliceCar(game.rng, game.city, px, py);
    game.cars.push(car);
    events.push({ type: 'copSpawn' });
  }
  if (cops.length > want) {
    // Retire the farthest cruiser.
    let far = null;
    let fd = -1;
    for (const c of cops) {
      const d = dist(c.x, c.y, px, py);
      if (d > fd) { fd = d; far = c; }
    }
    if (far) far.dead = true;
  }

  // Busted: on foot, a cruiser bumper-to-bumper with Leo for a second.
  if (!game.player.inCar && police.wanted > 0) {
    let near = false;
    for (const c of cops) {
      if (dist(c.x, c.y, px, py) < 52) { near = true; break; }
    }
    if (near) {
      police.busted += dt;
      if (police.busted > 1.1) {
        events.push({ type: 'busted' });
        police.busted = 0;
      }
    } else {
      police.busted = 0;
    }
  } else {
    police.busted = 0;
  }

  police.sirens = police.wanted > 0;
  return events;
}
