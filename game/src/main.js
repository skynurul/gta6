// main.js — Ember Isle: boot, the fixed-step loop, Juno on foot and behind
// the wheel, traffic and police around her, and every screen of the game.
// ?seed=N fixes the island. ?shot=race|street|docks|start stages a scene for
// a screenshot and sets window.__shotReady once it is painted.
import * as THREE from 'three';
import { clamp, dist, makeRng, angleLerp } from './util.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { makeHud } from './hud.js';
import {
  WORLD, VOLCANO, generateIsland, terrainHeight, districtFor, inLava, PLACES,
  nearestIntersection, randomRoadPoint, snapToRoad, collideWorld, onRoad,
} from './terrain3d.js';
import { buildIslandMeshes } from './city3d.js';
import {
  createRenderer, resizeRenderer, createPlayerMesh, syncPlayerMesh,
  createBeacon, updateBeacon, createSkids, ChaseCamera,
} from './render3d.js';
import {
  createCar, driveCar, syncCarMesh, updateTraffic, spawnTrafficCar, collideCars,
} from './vehicles3d.js';
import { spawnPeds, updatePeds, scarePeds } from './pedestrians3d.js';
import { createCombat } from './combat3d.js';
import { updatePolice, addHeat } from './police.js';
import { Standing } from './standing.js';
import { Crew } from './crew.js';
import { Race, ROUTES } from './races.js';
import {
  createMission, startNext, updateMission, onEnterCar, damageCourier, resetMissionOnFail,
} from './missions.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';

const params = new URLSearchParams(window.location.search);
const seed = parseInt(params.get('seed') || '20261119', 10);
const shot = params.get('shot') || '';

const canvas = document.getElementById('game');
const { renderer, scene } = createRenderer(canvas);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 6000);
const input = new Input(canvas);
const audio = new AudioSys();
const hud = makeHud();

const island = generateIsland(seed);
const world = buildIslandMeshes(island);
scene.add(world.group);
const chaseCam = new ChaseCamera(camera);
const beacon = createBeacon();
scene.add(beacon);
const skids = createSkids(scene);
const combat = createCombat(scene);

const game = {
  time: 0,
  rng: makeRng(seed),
  island,
  scene,
  renderer,
  camera,
  input,
  audio,
  hud,
  combat,
  player: {
    x: PLACES.safehouse.x, z: PLACES.safehouse.z, angle: 0,
    health: 100, alive: true, speed: 0, bob: 0, lastHurt: -99,
  },
  car: null,
  cars: [],
  cruisers: [],
  peds: [],
  cash: 150,
  police: { heat: 0, stars: 0, lastCrime: -99, spawnT: 0, bustT: 0, bustWarned: false, lastBump: -99 },
  standing: new Standing(),
  crew: null,
  race: null,
  mission: createMission(),
  stats: { missionsDone: 0, racesWon: 0, crimes: 0, carsStolen: 0, pedsHit: 0 },
  screen: 'title',
  saveT: 0,
  fireT: 0,
  lavaWarnT: 0,
};
game.crew = new Crew(game);
game.race = new Race(game);
game.save = () => saveGame(game);

const playerMesh = createPlayerMesh();
scene.add(playerMesh);

// Parked cars around the island, waiting to be borrowed.
const PARKED = [
  { model: 'sedan', x: PLACES.safehouse.x + 24, z: PLACES.safehouse.z, angle: 0 },
  { model: 'coupe', x: PLACES.marina.x - 20, z: PLACES.marina.z, angle: 1.5 },
  { model: 'taxi', x: 1800, z: 2200, angle: 0 },
  { model: 'van', x: 600, z: 2200, angle: -1.5 },
  { model: 'pickup', x: 2600, z: 1000, angle: 3.1 },
  { model: 'sedan', x: 1000, z: 2600, angle: 0 },
  { model: 'coupe', x: 2200, z: 1800, angle: -1.5 },
  { model: 'gt', x: 2600, z: 3000, angle: 0 },
];
for (const p of PARKED) {
  const car = createCar(p.model, p.x, p.z, p.angle, { parked: true });
  scene.add(car.mesh);
  game.cars.push(car);
}
for (let i = 0; i < 10; i++) spawnTrafficCar(game);
spawnPeds(game, 16);
game.crew.spawnMesh(game.crew.get('mara'));

function nearestCar(x, z, maxD) {
  let best = null;
  let bd = maxD;
  for (const car of game.cars) {
    const d = dist(x, z, car.x, car.z);
    if (d < bd) {
      bd = d;
      best = car;
    }
  }
  return best;
}

function enterCar(car) {
  game.car = car;
  car.parked = false;
  car.traffic = false;
  playerMesh.visible = false;
  game.player.x = car.x;
  game.player.z = car.z;
  game.player.angle = car.angle;
  audio.blip(300, 0.08, 'square', 0.15);
  hud.toast(`Driving the ${car.model.name}`, 'good');
  onEnterCar(game, car);
}

function exitCar() {
  const car = game.car;
  if (!car) return;
  const side = car.angle + Math.PI / 2;
  const px = car.x + Math.cos(side) * (car.model.wid / 2 + 3);
  const pz = car.z + Math.sin(side) * (car.model.wid / 2 + 3);
  const pushed = collideWorld(px, pz, 2, island.buildings);
  game.player.x = pushed.x;
  game.player.z = pushed.z;
  game.player.angle = car.angle;
  game.car = null;
  playerMesh.visible = true;
  audio.blip(240, 0.08, 'square', 0.15);
}

// A crime: heat (softened by Ilya), standing loss where it happened.
function commitCrime(heat, districtId, standingDelta, reason) {
  game.police.lastCrime = game.time;
  addHeat(game, heat * game.crew.heatFactor(), reason);
  if (districtId) game.standing.change(game, districtId, standingDelta, reason);
}

function respawnAtSafehouse() {
  const s = PLACES.safehouse;
  game.player.x = s.x;
  game.player.z = s.z;
  game.player.angle = 0;
  game.player.health = 100;
  game.player.alive = true;
  if (game.car) {
    game.car = null;
    playerMesh.visible = true;
  }
  game.police.heat = 0;
  game.police.stars = 0;
  game.police.bustT = 0;
  for (const c of game.cruisers) {
    scene.remove(c.mesh);
    game.cars.splice(game.cars.indexOf(c), 1);
  }
  game.cruisers = [];
  game.crew.regroupAt(s.x, s.z);
  resetMissionOnFail(game);
  game.save();
}

game.busted = () => {
  const fine = Math.min(game.cash, 200 + game.police.stars * 100);
  game.cash -= fine;
  hud.showBusted(fine);
  game.screen = 'busted';
  audio.fail();
  respawnAtSafehouse();
};

game.wasted = () => {
  game.player.alive = false;
  game.cash = Math.max(0, Math.round(game.cash * 0.9));
  hud.showWasted();
  game.screen = 'busted';
  audio.fail();
  respawnAtSafehouse();
};

function applySave(data) {
  game.cash = data.cash;
  game.mission.done = data.missionsDone || [];
  game.mission.arc = data.nextArc || 0;
  game.mission.stage = data.nextStage || 0;
  game.mission.storyDone = game.mission.arc >= 3;
  if (data.standing) game.standing.scores = data.standing;
  if (data.crew) {
    for (const c of data.crew) {
      const m = game.crew.get(c.id);
      if (m && c.recruited && !m.recruited) {
        m.recruited = true;
        game.crew.spawnMesh(m);
      }
    }
  }
  game.player.x = data.x || PLACES.safehouse.x;
  game.player.z = data.z || PLACES.safehouse.z;
  game.player.health = data.health || 100;
  if (data.stats) game.stats = { ...game.stats, ...data.stats };
}

// --- Shooting -------------------------------------------------------------
function playerAimPoint() {
  const r = canvas.getBoundingClientRect();
  const nx = ((input.mouse.x - r.left) / r.width) * 2 - 1;
  const ny = -(((input.mouse.y - r.top) / r.height) * 2 - 1);
  const gy = terrainHeight(game.player.x, game.player.z);
  return chaseCam.screenToGround(nx, ny, gy);
}

function firePlayerShot() {
  const aim = playerAimPoint();
  const p = game.player;
  const gy = terrainHeight(p.x, p.z) + 2.6;
  let dx;
  let dy = 0;
  let dz;
  if (aim) {
    dx = aim.x - p.x;
    dz = aim.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    p.angle = Math.atan2(dz, dx);
  } else {
    dx = Math.cos(p.angle);
    dz = Math.sin(p.angle);
  }
  combat.fireBullet({ x: p.x, y: gy, z: p.z }, { x: dx, y: dy, z: dz }, 520, true);
  combat.spawnParticles(p.x + dx * 3, gy, p.z + dz * 3, 3, 14, 10);
  audio.shot();
  scarePeds(game, p.x, p.z, 160);
  commitCrime(1, null, 0, '');
}

function resolveBulletHits(hits) {
  for (const hit of hits) {
    if (hit.type === 'player') {
      const p = game.player;
      p.health -= 9;
      p.lastHurt = game.time;
      audio.hit();
      chaseCam.addShake(0.25);
      if (p.health <= 0 && p.alive) game.wasted();
    } else if (hit.type === 'car') {
      const car = hit.target;
      audio.hit();
      combat.spawnParticles(hit.x, hit.y, hit.z, 8, 30, 30);
      if (car.cruiser) {
        car.speed *= 0.7;
      } else if (game.mission.courier === car) {
        damageCourier(game, 20);
      } else {
        commitCrime(4, districtFor(car.x, car.z).id, -2, 'shot fired at a car');
      }
    } else if (hit.type === 'ped') {
      const ped = hit.target;
      scene.remove(ped.mesh);
      game.peds.splice(game.peds.indexOf(ped), 1);
      combat.spawnParticles(hit.x, hit.y, hit.z, 10, 30, 30);
      commitCrime(8, districtFor(ped.x, ped.z).id, -4, 'pedestrian hit');
      scarePeds(game, ped.x, ped.z, 200);
    }
  }
}

// --- Screens ---------------------------------------------------------------
function startGame(fromSave) {
  audio.unlock();
  if (fromSave) {
    const data = loadGame();
    if (data) applySave(data);
  }
  hud.hideMenu();
  hud.hideBusted();
  hud.setScreen('play');
  game.screen = 'play';
  hud.toast('Ember Isle — press J for the next job', 'good');
}

function togglePause() {
  if (game.screen === 'play') {
    game.screen = 'paused';
    hud.setScreen('paused');
  } else if (game.screen === 'paused') {
    game.screen = 'play';
    hud.setScreen('play');
  }
}

document.getElementById('title').addEventListener('click', (e) => {
  audio.unlock();
  if (e.target.id === 'new-game') {
    clearSave();
    startGame(false);
  } else {
    startGame(true);
  }
});
// No save yet: hide the Continue button so the choice is honest.
if (!hasSave()) {
  const cb = document.getElementById('continue-btn');
  if (cb) cb.style.display = 'none';
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && game.screen === 'title') startGame(true);
  if (e.key === 'Enter' && game.screen === 'busted') {
    hud.hideBusted();
    game.screen = 'play';
    hud.setScreen('play');
  }
  if (e.key === 'Enter' && game.screen === 'play' && !hud.menu.classList.contains('hidden')) {
    hud.hideMenu();
  }
  if (e.key === 'Enter' && game.screen === 'paused') togglePause();
  // P lives here (not in update) so it works while paused, when update stops.
  if (e.key.toLowerCase() === 'p' && (game.screen === 'play' || game.screen === 'paused')) togglePause();
});

window.addEventListener('resize', () => resizeRenderer(renderer, camera));
resizeRenderer(renderer, camera);

// --- The fixed-step update --------------------------------------------------
function update(dt) {
  game.time += dt;
  world.update(dt, game.player);

  if (game.screen === 'title') {
    // Slow orbit over the island behind the title screen.
    const t = game.time * 0.03;
    camera.position.set(
      1700 + Math.cos(t) * 1500,
      620,
      1700 + Math.sin(t) * 1500,
    );
    camera.lookAt(VOLCANO.x, 120, VOLCANO.z);
    input.endFrame();
    return;
  }
  if (game.screen !== 'play') {
    input.endFrame();
    return;
  }

  const p = game.player;
  const orbit = input.takeOrbit();

  // Global keys.
  if (input.pressed('m')) {
    const muted = audio.toggleMute();
    hud.toast(muted ? 'Sound off' : 'Sound on');
  }
  if (input.pressed('j')) startNext(game);
  if (input.pressed('c')) hud.toggleCrewPanel(game);
  if (input.pressed('1', '2', '3') && !hud.crewPanel.classList.contains('hidden')) {
    const idx = parseInt(input.justPressed.has('1') ? '1' : input.justPressed.has('2') ? '2' : '3', 10) - 1;
    const m = game.crew.members[idx];
    if (m) game.crew.tryRecruit(m.id);
  }

  // Race starts: R near a route start, in a car.
  if (input.pressed('r') && game.car && !game.race.active) {
    const dCoast = dist(p.x, p.z, PLACES.raceCoastal.x, PLACES.raceCoastal.z);
    const dClimb = dist(p.x, p.z, PLACES.raceClimb.x, PLACES.raceClimb.z);
    if (dCoast < 90) game.race.start('coastal');
    else if (dClimb < 90) game.race.start('climb');
    else hud.toast('Drive to a race start (check the minimap)', 'bad');
  }

  // Enter / exit a car.
  if (input.pressed('e')) {
    if (game.car) exitCar();
    else {
      const car = nearestCar(p.x, p.z, 14);
      if (car) enterCar(car);
    }
    input.consume('e');
  }

  if (game.car) {
    // Driving.
    const car = game.car;
    car.topMul = game.crew.speedBonus();
    car.gripMul = game.crew.gripBonus();
    const locked = game.race.active && game.race.countdown > 0;
    const ctl = locked
      ? { up: false, down: false, left: false, right: false, handbrake: false }
      : {
        up: input.down('w', 'arrowup'),
        down: input.down('s', 'arrowdown'),
        left: input.down('a', 'arrowleft'),
        right: input.down('d', 'arrowright'),
        handbrake: input.down(' '),
      };
    const crash = driveCar(car, ctl, dt, island);
    if (crash > 80) {
      audio.crash();
      chaseCam.addShake(0.4);
      combat.spawnParticles(car.x, terrainHeight(car.x, car.z) + 2, car.z, 10, 40, 30);
    }
    // Drift leaves skid marks.
    const lateral = Math.abs(-car.vx * Math.sin(car.angle) + car.vz * Math.cos(car.angle));
    if (ctl.handbrake && Math.abs(car.speed) > 100) {
      const bx = car.x - Math.cos(car.angle) * car.model.len * 0.32;
      const bz = car.z - Math.sin(car.angle) * car.model.len * 0.32;
      skids.add(bx, bz, car.angle);
    }
    // Running over a pedestrian is a crime.
    for (let i = game.peds.length - 1; i >= 0; i--) {
      const ped = game.peds[i];
      if (dist(ped.x, ped.z, car.x, car.z) < car.model.len * 0.5 && Math.abs(car.speed) > 60) {
        scene.remove(ped.mesh);
        game.peds.splice(i, 1);
        game.stats.pedsHit++;
        combat.spawnParticles(ped.x, terrainHeight(ped.x, ped.z) + 2, ped.z, 12, 40, 40);
        commitCrime(10, districtFor(ped.x, ped.z).id, -4, 'pedestrian run over');
        audio.crash();
        scarePeds(game, ped.x, ped.z, 200);
      }
    }
    syncCarMesh(car);
    p.x = car.x;
    p.z = car.z;
    p.angle = car.angle;
    p.speed = car.speed;
    audio.setEngine(Math.abs(car.speed) / car.model.top, true);
  } else {
    // On foot: move relative to the camera, sprint with Shift, shoot with mouse/F.
    const camFwd = chaseCam.yaw + Math.PI;
    let mx = 0;
    let mz = 0;
    if (input.down('w', 'arrowup')) { mx += Math.cos(camFwd); mz += Math.sin(camFwd); }
    if (input.down('s', 'arrowdown')) { mx -= Math.cos(camFwd); mz -= Math.sin(camFwd); }
    // Left of the camera's forward is camFwd - PI/2 (left of north is west).
    if (input.down('a', 'arrowleft')) { mx += Math.cos(camFwd - Math.PI / 2); mz += Math.sin(camFwd - Math.PI / 2); }
    if (input.down('d', 'arrowright')) { mx += Math.cos(camFwd + Math.PI / 2); mz += Math.sin(camFwd + Math.PI / 2); }
    const moving = mx !== 0 || mz !== 0;
    const sprint = input.down('shift');
    const speed = sprint ? 215 : 130;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      p.angle = angleLerp(p.angle, Math.atan2(mz, mx), 1 - Math.exp(-12 * dt));
      p.x += mx * speed * dt;
      p.z += mz * speed * dt;
      const pushed = collideWorld(p.x, p.z, 2, island.buildings);
      p.x = pushed.x;
      p.z = pushed.z;
    }
    p.speed = moving ? speed : 0;
    // Lava on the volcano slopes burns.
    if (inLava(p.x, p.z)) {
      p.health -= 14 * dt;
      p.lastHurt = game.time;
      chaseCam.addShake(0.1);
      if (game.time - game.lavaWarnT > 3) {
        game.lavaWarnT = game.time;
        hud.toast('Lava! Get off the flow', 'bad');
      }
      if (p.health <= 0 && p.alive) game.wasted();
    }
    // Shooting: hold the mouse button or F.
    game.fireT -= dt;
    if ((input.mouse.down || input.down('f')) && game.fireT <= 0) {
      game.fireT = 0.18;
      firePlayerShot();
    }
    audio.setEngine(0, false);
  }

  // Health slowly recovers when Juno has been safe for a while.
  if (game.time - p.lastHurt > 6 && p.health < 100 && p.alive) {
    p.health = Math.min(100, p.health + 1.5 * dt);
  }

  // Camera follows the player (or the car).
  chaseCam.update(dt, { x: p.x, z: p.z, angle: p.angle, speed: p.speed || 0 }, !!game.car, orbit);
  syncPlayerMesh(playerMesh, p, dt, !game.car && p.speed > 0);

  // The world around Juno.
  updateTraffic(game, dt);
  updatePolice(game, dt);
  updatePeds(game, dt);
  game.crew.update(dt);
  game.crew.updateGunner(dt);
  game.race.update(dt);
  updateMission(game, dt);
  const hits = combat.updateBullets(game, dt);
  resolveBulletHits(hits);
  combat.updateParticles(dt);

  // Objective beacon.
  updateBeacon(beacon, game.mission.target, game.time);

  // Music: the groove gets busier with wanted stars.
  audio.music(dt, game.police.stars > 0 ? 1 : 0.5);

  // Autosave every 15 seconds.
  game.saveT += dt;
  if (game.saveT > 15) {
    game.saveT = 0;
    game.save();
  }

  hud.update(game, dt);
  input.endFrame();
}

// --- The render loop --------------------------------------------------------
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
let frames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  while (acc >= STEP) {
    update(STEP);
    acc -= STEP;
  }
  renderer.render(scene, camera);
  frames++;
  if (frames === 5) {
    window.__ready = true;
    if (shot) stageShot();
  }
}
requestAnimationFrame(frame);

// --- Screenshot staging -----------------------------------------------------
// ?shot=race|street|docks|start puts the game in a photogenic state and sets
// window.__shotReady once it has settled.
let shotStaged = false;
function stageShot() {
  if (shotStaged) return;
  shotStaged = true;
  const p = game.player;
  if (shot === 'start') {
    hud.setScreen('title');
    game.screen = 'title';
    window.__shotReady = true;
    return;
  }
  game.screen = 'play';
  hud.setScreen('play');
  if (shot === 'race') {
    // Mid-race on the Coastal Ring: the pack is already up the first leg,
    // the volcano ahead, the Isle PD behind.
    const startCar = nearestCar(PLACES.raceCoastal.x, PLACES.raceCoastal.z, 400) || game.cars[0];
    enterCar(startCar);
    game.race.start('coastal');
    game.race.countdown = 0.01;
    game.car.x = 2600;
    game.car.z = 2100;
    game.car.angle = -Math.PI / 2;
    game.car.speed = 300;
    game.car.vx = 0;
    game.car.vz = -300;
    game.player.x = 2600;
    game.player.z = 2100;
    game.player.angle = -Math.PI / 2;
    game.race.cp = 2;
    game.race.rivals.forEach((r, i) => {
      r.x = 2592 + (i % 2) * 16;
      r.z = 2075 - i * 25;
      r.angle = -Math.PI / 2;
      r.speed = 300;
      r.vx = 0;
      r.vz = -300;
      r.nextCp = 2;
      syncCarMesh(r);
    });
    syncCarMesh(game.car);
    game.police.heat = 60;
    game.police.stars = 3;
    game.police.lastCrime = game.time;
    setTimeout(() => { window.__shotReady = true; }, 1500);
    return;
  }
  if (shot === 'street') {
    // On avenue 1800, facing north up the street toward the volcano.
    p.x = 1800;
    p.z = 1500;
    p.angle = -Math.PI / 2;
    chaseCam.yaw = p.angle + Math.PI;
    chaseCam.yawOffset = 0;
    // A taxi and a pedestrian on the avenue for life.
    const taxi = game.cars.find((c) => c.model.id === 'taxi');
    if (taxi) {
      taxi.x = 1800;
      taxi.z = 1420;
      taxi.angle = -Math.PI / 2;
      syncCarMesh(taxi);
    }
    setTimeout(() => { window.__shotReady = true; }, 1200);
    return;
  }
  if (shot === 'docks') {
    p.x = 3120;
    p.z = 1560;
    p.angle = -0.25; // facing east-north, pier and sea ahead
    chaseCam.yaw = p.angle + Math.PI;
    chaseCam.yawOffset = 0;
    // A GT parked on the docks, right in front of Juno, sunlit side to camera.
    const gt = game.cars.find((c) => c.model.id === 'gt');
    if (gt) {
      gt.x = 3149;
      gt.z = 1553;
      gt.angle = 0.2;
      syncCarMesh(gt);
    }
    setTimeout(() => { window.__shotReady = true; }, 1200);
    return;
  }
  if (shot === 'vista') {
    // Cover shot: the GT on avenue 1800 heading north, the detailed city
    // ahead and Mount Cinder smoking behind it, 3 stars on the run.
    const gt = game.cars.find((c) => c.model.id === 'gt');
    if (gt) {
      enterCar(gt);
      gt.x = 1800;
      gt.z = 1900;
      gt.angle = -Math.PI / 2;
      gt.speed = 0;
      gt.vx = 0;
      gt.vz = 0;
      syncCarMesh(gt);
    }
    p.x = 1800;
    p.z = 1900;
    p.angle = -Math.PI / 2;
    chaseCam.yaw = p.angle + Math.PI;
    chaseCam.yawOffset = 0;
    const taxi = game.cars.find((c) => c.model.id === 'taxi');
    if (taxi) {
      taxi.x = 1800;
      taxi.z = 1750;
      taxi.angle = -Math.PI / 2;
      syncCarMesh(taxi);
    }
    game.police.heat = 60;
    game.police.stars = 3;
    game.police.lastCrime = game.time;
    setTimeout(() => { window.__shotReady = true; }, 1500);
    return;
  }
  window.__shotReady = true;
}

// Expose the game for debugging and for the automated play-tests.
window.__game = game;
window.__hud = hud;
