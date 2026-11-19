// main.js — Solmar Bay: boot, the fixed-step loop, the player on foot and
// behind the wheel, traffic and police around him, and every screen of the game.
// ?seed=N fixes the city. ?shot=start|chase|foot|docks stages a scene for a
// screenshot and sets window.__shotReady once it is painted.
import { TAU, clamp, dist, makeRng, pick } from './util.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { WORLD, collideWorld, generateCity, randomRoadPoint } from './city.js';
import {
  CAR_MODELS, collideCar, collideCars, driveCar, makeCar,
  spawnParkedCar, spawnTrafficCar, updatePoliceCar, updateTrafficCar,
} from './vehicles.js';
import { makePed, spawnPed, updatePed } from './pedestrians.js';
import { burst, makeBullet, makeParticles, updateBullets, updateParticles, bulletHits } from './combat.js';
import { addHeat, makePolice, setWanted, updatePolice } from './police.js';
import {
  MISSIONS, STORY, currentObjective, failMission, makeMissionState, missionTitle,
  startMission, startSideJob, updateMission, updateSideJob,
} from './missions.js';
import { clearSave, hasSave, loadGame, saveGame } from './save.js';
import {
  hideBusted, hideMenu, makeHud, setMissionText, showBusted, showMenu, showToast, updateHud,
} from './hud.js';
import { makeCamera, render, updateCamera } from './render.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261119;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
const hud = makeHud();

const city = generateCity(seed);
const rng = makeRng(seed + 7);

const game = {
  time: 0,
  seed,
  rng,
  city,
  missionDefs: MISSIONS,
  camera: makeCamera(),
  audio: new AudioSys(),
  police: makePolice(),
  mission: makeMissionState(),
  cash: 40,
  stats: { missions: 0, jobs: 0, carsStolen: 0, pedsHit: 0 },
  cars: [],
  peds: [],
  bullets: [],
  particles: makeParticles(),
  skids: [],
  screen: 'title', // title | play | paused | modal | busted | wasted
  modalKind: null,
  modalData: null,
  player: null,
  save() { saveGame(game); },
};

function makePlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    health: 100,
    inCar: false,
    car: null,
    armed: true,
    walkPhase: 0,
    aiming: false,
    aimAngle: 0,
    shootCd: 0,
    speed: 0,
  };
}

game.player = makePlayer(city.places.safehouse.x + 60, city.places.safehouse.y + 40);

function populateWorld() {
  game.cars = [];
  game.peds = [];
  // Parked cars around town, one sedan by the safehouse for mission 1.
  const sedan = makeCar(CAR_MODELS[0], city.places.safehouse.x + 120, city.places.safehouse.y + 40, 0, { driver: null });
  game.cars.push(sedan);
  for (let i = 0; i < 11; i++) game.cars.push(spawnParkedCar(rng, city));
  for (let i = 0; i < 13; i++) game.cars.push(spawnTrafficCar(rng, city));
  for (let i = 0; i < 20; i++) game.peds.push(spawnPed(rng, city));
}

populateWorld();

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
}
window.addEventListener('resize', resize);
resize();

function vw() { return canvas.width; }
function vh() { return canvas.height; }

function mouseWorld() {
  const cam = game.camera;
  return {
    x: cam.x + (input.mouse.x * (canvas.width / window.innerWidth) - vw() / 2) / cam.zoom + vw() / 2 / cam.zoom,
    y: cam.y + (input.mouse.y * (canvas.height / window.innerHeight) - vh() / 2) / cam.zoom + vh() / 2 / cam.zoom,
  };
}

function nearestCar(x, y, maxD) {
  let best = null;
  let bd = maxD;
  for (const c of game.cars) {
    if (c.dead) continue;
    const d = dist(x, y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function enterCar(car) {
  const p = game.player;
  if (car.driver === 'rival') {
    showToast(hud, 'Locked — stop the courier first.');
    return;
  }
  if (car.driver === 'traffic') {
    // The driver bails and runs; stealing a car with a driver is a crime.
    const driver = makePed(rng, car.x, car.y);
    driver.panic = 2;
    driver.panicX = p.x;
    driver.panicY = p.y;
    game.peds.push(driver);
    addHeat(game.police, 10);
    game.stats.carsStolen++;
    showToast(hud, 'Car stolen! The PD noticed.');
  }
  car.driver = 'player';
  p.inCar = true;
  p.car = car;
  game.audio.setEngine(0, true);
}

function exitCar() {
  const p = game.player;
  const car = p.car;
  if (!car) return;
  car.driver = null;
  car.speed *= 0.2;
  const side = Math.PI / 2;
  p.x = car.x + Math.cos(car.angle + side) * 34;
  p.y = car.y + Math.sin(car.angle + side) * 34;
  const res = collideWorld(game.city, p.x, p.y, 12);
  p.x = res.x;
  p.y = res.y;
  p.inCar = false;
  p.car = null;
  game.audio.setEngine(0, false);
}

function explodeCar(car) {
  car.dead = true;
  burst(game.particles, car.x, car.y, '#ff7b00', 26, 260);
  burst(game.particles, car.x, car.y, '#666', 18, 140);
  burst(game.particles, car.x, car.y, '#ffd60a', 12, 200);
  game.audio.crash();
  game.camera.shake = 1;
  if (car.driver === 'player') {
    const p = game.player;
    p.health -= 25;
    p.x = car.x + 40;
    p.y = car.y + 40;
    p.inCar = false;
    p.car = null;
  }
}

function shootPlayer() {
  const p = game.player;
  if (p.shootCd > 0 || p.inCar) return;
  p.shootCd = 0.28;
  const mw = mouseWorld();
  const angle = Math.atan2(mw.y - p.y, mw.x - p.x);
  p.aimAngle = angle;
  p.aiming = true;
  game.bullets.push(makeBullet(p.x + Math.cos(angle) * 16, p.y + Math.sin(angle) * 16, angle, 'player'));
  game.audio.shot();
  addHeat(game.police, 3);
  burst(game.particles, p.x + Math.cos(angle) * 20, p.y + Math.sin(angle) * 20, '#ffe66d', 4, 120);
}

function copShoot(cop) {
  const p = game.player;
  const angle = Math.atan2(p.y - cop.y, p.x - cop.x) + (Math.random() - 0.5) * 0.14;
  game.bullets.push(makeBullet(cop.x, cop.y, angle, 'cop', 620));
  game.audio.shot();
}

function updatePlayer(dt) {
  const p = game.player;
  p.shootCd = Math.max(0, p.shootCd - dt);
  if (p.aiming && p.shootCd <= 0) p.aiming = false;

  if (p.inCar) {
    const car = p.car;
    if (!car || car.dead) {
      p.inCar = false;
      p.car = null;
      return;
    }
    const up = input.down('w', 'arrowup') ? 1 : 0;
    const down = input.down('s', 'arrowdown') ? 1 : 0;
    const throttle = up - down * 0.7;
    const steer = (input.down('a', 'arrowleft') ? -1 : 0) + (input.down('d', 'arrowright') ? 1 : 0);
    const handbrake = input.down(' ');
    const prevX = car.x;
    const prevY = car.y;
    driveCar(car, dt, throttle, steer, handbrake);
    if (collideCar(game.city, car)) {
      game.audio.crash();
      game.camera.shake = 0.7;
      burst(game.particles, car.x, car.y, '#aaa', 6, 90);
    }
    if (car.skid > 0) {
      game.skids.push({ x1: prevX, y1: prevY, x2: car.x, y2: car.y });
      if (game.skids.length > 220) game.skids.shift();
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = car.speed;
    game.audio.setEngine(Math.abs(car.speed) / car.model.top, true);
    if (car.health <= 0) explodeCar(car);
    if (input.pressed('e')) {
      input.consume('e');
      exitCar();
    }
    return;
  }

  // On foot.
  game.audio.setEngine(0, false);
  const mx = (input.down('d', 'arrowright') ? 1 : 0) - (input.down('a', 'arrowleft') ? 1 : 0);
  const my = (input.down('s', 'arrowdown') ? 1 : 0) - (input.down('w', 'arrowup') ? 1 : 0);
  const sprint = input.down('shift');
  const speed = sprint ? 265 : 175;
  let vx = 0;
  let vy = 0;
  if (mx !== 0 || my !== 0) {
    const len = Math.hypot(mx, my);
    vx = (mx / len) * speed;
    vy = (my / len) * speed;
    p.angle = Math.atan2(vy, vx);
    p.walkPhase += dt * 10;
  }
  p.x += vx * dt;
  p.y += vy * dt;
  const res = collideWorld(game.city, p.x, p.y, 12);
  p.x = res.x;
  p.y = res.y;
  p.speed = Math.hypot(vx, vy);

  // Aim at the mouse while shooting.
  const mw = mouseWorld();
  if (input.mouse.down || input.down('f')) {
    p.aimAngle = Math.atan2(mw.y - p.y, mw.x - p.x);
    p.angle = p.aimAngle;
    shootPlayer();
  }
  if (input.pressed('f')) {
    input.consume('f');
    shootPlayer();
  }

  if (input.pressed('e')) {
    input.consume('e');
    const car = nearestCar(p.x, p.y, 84);
    if (car) enterCar(car);
  }
  // Slow health regen.
  p.health = Math.min(100, p.health + dt * 1.5);
}

function updateCars(dt) {
  const p = game.player;
  for (const car of game.cars) {
    if (car.dead) continue;
    if (car.driver === 'traffic') {
      updateTrafficCar(car, game.city, rng, dt);
      collideCar(game.city, car);
    } else if (car.driver === 'police') {
      updatePoliceCar(car, p.x, p.y, dt);
      collideCar(game.city, car);
      // Cops shoot at Leo on foot when close and the heat is high.
      car.shootCd = (car.shootCd || 0) - dt;
      if (game.police.wanted >= 2 && !p.inCar && dist(car.x, car.y, p.x, p.y) < 380 && car.shootCd <= 0) {
        car.shootCd = 1.4;
        copShoot(car);
      }
      if (car.health <= 0) explodeCar(car);
    }
  }
  // Car-car bumps.
  for (let i = 0; i < game.cars.length; i++) {
    const a = game.cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < game.cars.length; j++) {
      const b = game.cars[j];
      if (b.dead) continue;
      if (collideCars(a, b)) {
        if (a.driver === 'player' || b.driver === 'player') {
          game.audio.crash();
          game.camera.shake = 0.6;
          const pc = a.driver === 'player' ? a : b;
          pc.health -= 4;
          if (pc.health <= 0) explodeCar(pc);
        }
        if ((a.driver === 'police' && b.driver === 'player') || (b.driver === 'police' && a.driver === 'player')) {
          const pc = a.driver === 'player' ? a : b;
          pc.health -= 2;
        }
      }
    }
  }
  // Player's car vs pedestrians.
  if (p.inCar && p.car && Math.abs(p.car.speed) > 70) {
    for (const ped of game.peds) {
      if (ped.dead) continue;
      if (dist(p.x, p.y, ped.x, ped.y) < 26) {
        ped.dead = true;
        game.stats.pedsHit++;
        addHeat(game.police, 12);
        burst(game.particles, ped.x, ped.y, '#e63946', 10, 130);
        game.audio.hit();
        showToast(hud, 'Pedestrian down! The PD saw that.');
      }
    }
  }
  // Traffic cars vs pedestrians on foot: peds get out of the way.
  game.cars = game.cars.filter((c) => !c.dead || c.driver === 'player');
  // Recycle: keep the streets busy near Leo.
  const traffic = game.cars.filter((c) => c.driver === 'traffic');
  if (traffic.length < 12) {
    const car = spawnTrafficCar(rng, game.city);
    car.x = p.x + (rng() < 0.5 ? -1 : 1) * (700 + rng() * 500);
    car.y = p.y + (rng() < 0.5 ? -1 : 1) * (700 + rng() * 500);
    car.x = clamp(car.x, 120, WORLD - 120);
    car.y = clamp(car.y, 120, WORLD - 120);
    game.cars.push(car);
  }
  const parked = game.cars.filter((c) => !c.driver);
  if (parked.length < 8) game.cars.push(spawnParkedCar(rng, game.city));
}

function updateBulletsAndCombat(dt) {
  const p = game.player;
  game.bullets = updateBullets(game.bullets, game.city, dt, (kind, x, y) => {
    burst(game.particles, x, y, '#ccc', 3, 60);
  });
  for (const b of game.bullets) {
    if (b.from === 'player') {
      for (const car of game.cars) {
        if (car.dead || car.driver === 'player') continue;
        if (bulletHits(b, car.x, car.y, 22)) {
          b.dead = true;
          car.health -= 12;
          car.flash = 0.1;
          game.audio.hit();
          burst(game.particles, b.x, b.y, '#ffd60a', 5, 110);
          if (car.driver === 'police') addHeat(game.police, 6);
          if (car.health <= 0) explodeCar(car);
          break;
        }
      }
      if (b.dead) continue;
      for (const ped of game.peds) {
        if (ped.dead) continue;
        if (bulletHits(b, ped.x, ped.y, 10)) {
          b.dead = true;
          ped.dead = true;
          addHeat(game.police, 12);
          burst(game.particles, ped.x, ped.y, '#e63946', 8, 120);
          game.audio.hit();
          break;
        }
      }
    } else if (b.from === 'cop') {
      if (!p.inCar && bulletHits(b, p.x, p.y, 12)) {
        b.dead = true;
        p.health -= 8;
        game.audio.hit();
        game.camera.shake = 0.4;
        burst(game.particles, p.x, p.y, '#e63946', 6, 110);
      }
    }
  }
  game.bullets = game.bullets.filter((b) => !b.dead);
}

function updatePeds(dt) {
  const p = game.player;
  const dangerCar = p.inCar && Math.abs(p.car?.speed || 0) > 120 ? { x: p.x, y: p.y, r: 130 } : null;
  const dangerShot = game.bullets.length > 0 ? { x: p.x, y: p.y, r: 220 } : null;
  for (const ped of game.peds) {
    updatePed(ped, game.city, rng, dt, dangerCar || dangerShot);
  }
  game.peds = game.peds.filter((ped) => !ped.dead);
  if (game.peds.length < 16) game.peds.push(spawnPed(rng, game.city));
}

function respawnAtSafehouse(reason) {
  const p = game.player;
  const fine = Math.min(game.cash, Math.max(100, Math.round(game.cash * 0.1)));
  game.cash -= fine;
  p.health = 100;
  p.inCar = false;
  p.car = null;
  p.x = game.city.places.safehouse.x + 60;
  p.y = game.city.places.safehouse.y + 40;
  setWanted(game.police, 0);
  if (game.mission.active) {
    failMission(game, reason);
    game.mission.failed = reason;
  }
  game.save();
}

function update(dt) {
  game.time += dt;
  updatePlayer(dt);
  updateCars(dt);
  updatePeds(dt);
  updateBulletsAndCombat(dt);
  game.particles = updateParticles(game.particles, dt);

  const policeEvents = updatePolice(game.police, game, dt);
  for (const ev of policeEvents) {
    if (ev.type === 'busted') {
      game.screen = 'busted';
      showBusted(hud, 'busted');
      game.audio.fail();
      return;
    }
    if (ev.type === 'heatDown') showToast(hud, `Heat cooling off — ${ev.stars} star${ev.stars === 1 ? '' : 's'}.`);
  }

  const missionEvent = updateMission(game, dt);
  if (missionEvent) {
    if (missionEvent.type === 'step') {
      showToast(hud, missionEvent.step.text, 3.5);
      game.audio.pickup();
    } else if (missionEvent.type === 'complete') {
      const def = missionEvent.mission;
      const next = MISSIONS[game.mission.index];
      game.screen = 'modal';
      game.modalKind = 'complete';
      game.modalData = { title: def.title, reward: def.reward, next: next ? next.title : null };
      showMenu(hud, 'complete', game.modalData);
    } else if (missionEvent.type === 'failed') {
      game.screen = 'modal';
      game.modalKind = 'failed';
      game.modalData = { reason: missionEvent.reason };
      showMenu(hud, 'failed', game.modalData);
    }
  }
  const jobEvent = updateSideJob(game);
  if (jobEvent) showToast(hud, `Courier run done — earned ${'$' + jobEvent.pay}.`);

  // Player down.
  if (game.player.health <= 0) {
    game.screen = 'wasted';
    showBusted(hud, 'wasted');
    game.audio.fail();
    return;
  }

  // Audio: sirens and the groove.
  if (game.police.sirens) game.audio.siren(dt);
  game.audio.music(dt, game.player.inCar ? 0.8 : 0.4);

  const speed = game.player.inCar ? Math.abs(game.player.car?.speed || 0) : game.player.speed;
  updateCamera(game.camera, game.player.x, game.player.y, speed, dt, vw(), vh());
  setMissionText(hud, missionTitle(game), currentObjective(game));
  updateHud(hud, game, dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  handleKeys();
  if (game.screen === 'play') {
    // A persistent accumulator: on a fast display a frame can be shorter than
    // one step, and dropping the leftover would freeze the world entirely.
    accumulator += dt;
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
      if (game.screen !== 'play') break;
    }
    if (game.screen !== 'play') accumulator = 0;
  } else if (game.screen === 'title') {
    // The city idles behind the title: traffic drifts, peds stroll.
    game.time += dt;
    for (const car of game.cars) {
      if (car.driver === 'traffic') updateTrafficCar(car, game.city, rng, dt);
    }
    for (const ped of game.peds) updatePed(ped, game.city, rng, dt, null);
    updateCamera(game.camera, 1700, 1700, 0, dt, vw(), vh());
    setMissionText(hud, 'SOLMAR BAY', 'An open-world crime story in the sun.');
    updateHud(hud, game, dt);
  }
  render(ctx, game, vw(), vh());
  input.endFrame();
}

let last = performance.now();
let accumulator = 0;

function handleKeys() {
  const p = game.player;
  if (input.pressed('m')) {
    const muted = game.audio.toggleMute();
    showToast(hud, muted ? 'Sound off.' : 'Sound on.');
  }
  if (game.screen === 'title') {
    if (input.pressed('enter', ' ') || input.mouse.clicked) {
      game.audio.unlock();
      startPlaying();
    }
    return;
  }
  if (game.screen === 'modal') {
    if (input.pressed('enter', ' ') || input.mouse.clicked) {
      hideMenu(hud);
      game.screen = 'play';
    }
    return;
  }
  if (game.screen === 'busted' || game.screen === 'wasted') {
    if (input.pressed('enter', ' ') || input.mouse.clicked) {
      hideBusted(hud);
      respawnAtSafehouse(game.screen === 'busted' ? 'Busted by the PD.' : 'Leo went down.');
      game.screen = 'play';
    }
    return;
  }
  if (game.screen === 'paused') {
    if (input.pressed('p', 'escape')) {
      hideMenu(hud);
      game.screen = 'play';
    }
    if (input.pressed('s')) {
      game.save();
      showToast(hud, 'Game saved.');
    }
    if (input.pressed('r') && game.mission.active) {
      const idx = game.mission.index;
      hideMenu(hud);
      startMission(game, idx);
      game.screen = 'play';
      showToast(hud, `Restarted: ${MISSIONS[idx].title}`);
    }
    return;
  }
  // Playing.
  if (input.pressed('p', 'escape')) {
    game.screen = 'paused';
    showMenu(hud, 'paused');
    return;
  }
  if (input.pressed('j')) {
    if (!game.mission.active) {
      if (game.mission.index < MISSIONS.length) {
        const def = MISSIONS[game.mission.index];
        startMission(game, game.mission.index);
        showToast(hud, `${def.title}: ${def.briefing}`, 5);
      } else {
        const job = startSideJob(game);
        showToast(hud, `Courier run: deliver to ${job.target.label} for $${job.pay}.`, 4);
      }
    }
  }
}

function startPlaying() {
  hideMenu(hud);
  if (hasSave() && !game.loadedSave) {
    const data = loadGame();
    if (data) {
      game.loadedSave = true;
      game.cash = data.cash;
      game.mission.done = data.missionsDone;
      game.mission.index = data.nextMission;
      game.player.x = data.x;
      game.player.y = data.y;
      game.player.health = data.health || 100;
      game.stats = { ...game.stats, ...data.stats };
      showToast(hud, `Welcome back to Solmar Bay, Leo. ${money(data.cash)} in your pocket.`, 4);
    }
  }
  game.screen = 'play';
  if (game.mission.index < MISSIONS.length && !game.mission.active) {
    showToast(hud, `Press J to start: ${MISSIONS[game.mission.index].title}`, 4);
  }
}

function money(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ---- Screenshot staging (?shot=...) ----
function stageShot(name) {
  game.audio.unlock();
  if (name === 'start') {
    game.screen = 'title';
    showMenu(hud, 'title', { hasSave: hasSave() });
    setMissionText(hud, 'SOLMAR BAY', 'An open-world crime story in the sun.');
    updateHud(hud, game, 0);
    return;
  }
  game.screen = 'play';
  hideMenu(hud);
  if (name === 'chase') {
    // Leo driving downtown, wanted level 3, three cruisers on his tail.
    const car = makeCar(CAR_MODELS[5], 1800, 1800, 0, { driver: 'player' });
    car.speed = 260;
    game.cars.push(car);
    game.player.x = 1800;
    game.player.y = 1800;
    game.player.inCar = true;
    game.player.car = car;
    startMission(game, 2); // Heat Wave
    setWanted(game.police, 3); // after startMission: its onStart sets 2 stars
    for (let i = 0; i < 3; i++) {
      const cop = makeCar(CAR_MODELS[7], 1800 - 260 - i * 90, 1800 + (i - 1) * 80, 0, { driver: 'police' });
      cop.speed = 200;
      game.cars.push(cop);
    }
    showToast(hud, 'Heat Wave: reach the Azure Penthouse — the PD is on you.', 5);
  } else if (name === 'foot') {
    // On foot in Plaza del Sol, peds and traffic all around.
    game.player.x = 1800;
    game.player.y = 1800;
    game.player.inCar = false;
    game.player.armed = true;
    for (let i = 0; i < 8; i++) game.peds.push(spawnPed(rng, game.city));
    startMission(game, 0);
    game.mission.step = 1; // already has wheels, heading to the docks
    showToast(hud, 'First Wheels: drive to the Solmar Docks.', 5);
  } else if (name === 'docks') {
    // The Harbor Hustle: crates on the docks, a cruiser watching.
    game.player.x = 3180;
    game.player.y = 1300;
    game.player.inCar = false;
    startMission(game, 3);
    const cop = makeCar(CAR_MODELS[7], 3060, 1500, Math.PI / 2, { driver: 'police' });
    game.cars.push(cop);
    setWanted(game.police, 1);
    showToast(hud, 'Harbor Hustle: collect the crates on the docks (0/3).', 5);
  }
  // Let the world settle for a few simulated seconds so traffic and peds spread.
  for (let i = 0; i < 200; i++) {
    game.time += STEP;
    for (const car of game.cars) {
      if (car.driver === 'traffic') updateTrafficCar(car, game.city, rng, STEP);
      if (car.driver === 'police') updatePoliceCar(car, game.player.x, game.player.y, STEP);
    }
    for (const ped of game.peds) updatePed(ped, game.city, rng, STEP, null);
    const speed = game.player.inCar ? Math.abs(game.player.car?.speed || 0) : 0;
    updateCamera(game.camera, game.player.x, game.player.y, speed, STEP, vw(), vh());
  }
  setMissionText(hud, missionTitle(game), currentObjective(game));
  updateHud(hud, game, 0);
}

if (shot) {
  stageShot(shot);
  // Paint twice, then signal readiness for the screenshot.
  let painted = 0;
  (function paint() {
    render(ctx, game, vw(), vh());
    painted++;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  })();
} else {
  showMenu(hud, 'title', { hasSave: hasSave() });
  window.__game = game;
  window.__STORY__ = STORY;
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.screen === 'play') {
    game.screen = 'paused';
    showMenu(hud, 'paused');
  }
});
