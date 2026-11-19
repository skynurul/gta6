// races.js — street racing on Ember Isle: two routes, a countdown, rival
// drivers chasing the same checkpoints, live position, and cash plus district
// standing for the podium.
import * as THREE from 'three';
import { createCar, steerCarToward, driveCar, syncCarMesh } from './vehicles3d.js';
import { COASTAL_WAYPOINTS, CLIMB_WAYPOINTS, terrainHeight, districtFor } from './terrain3d.js';
import { dist } from './util.js';

export const ROUTES = {
  coastal: {
    id: 'coastal',
    name: 'Coastal Ring Sprint',
    district: 'sands',
    minStanding: 0,
    waypoints: COASTAL_WAYPOINTS,
    prize: [800, 400, 200, 50],
    rivalTop: 330,
  },
  climb: {
    id: 'climb',
    name: 'Volcano Climb Circuit',
    district: 'cinder',
    minStanding: 10,
    waypoints: CLIMB_WAYPOINTS,
    prize: [1200, 600, 300, 100],
    rivalTop: 300,
  },
};

const RIVAL_MODELS = ['coupe', 'gt', 'sedan'];
const RIVAL_NAMES = ['Vex', 'Roxy', 'Kip'];

export class Race {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.route = null;
    this.countdown = 0;
    this.cp = 0;
    this.rivals = [];
    this.rings = [];
    this.position = 1;
    this.finished = false;
    this.finishT = 0;
    this.rivalFinish = [];
    this.lastBeep = 4;
  }

  // Line everyone up at the start and run the countdown.
  start(routeId) {
    const game = this.game;
    const route = ROUTES[routeId];
    if (!route || this.active) return false;
    if (!game.standing.raceOpen(route.district, route.minStanding)) {
      game.hud.toast(
        `${route.name} needs ${route.minStanding} standing in ${districtName(route.district)} (now ${game.standing.get(route.district)})`,
        'bad',
      );
      return false;
    }
    if (!game.car) {
      game.hud.toast('You need a car to race', 'bad');
      return false;
    }
    this.route = route;
    this.active = true;
    this.cp = 1; // the start line itself is already passed
    this.countdown = 3.4;
    this.lastBeep = 4;
    this.finished = false;
    this.finishT = 0;
    this.rivalFinish = [];
    // Player at the line, rivals staggered behind.
    const wps = route.waypoints;
    const start = wps[0];
    const next = wps[1];
    const dir = Math.atan2(next.z - start.z, next.x - start.x);
    game.car.x = start.x;
    game.car.z = start.z;
    game.car.angle = dir;
    game.car.speed = 0;
    game.car.vx = 0;
    game.car.vz = 0;
    game.player.x = start.x;
    game.player.z = start.z;
    game.player.angle = dir;
    syncCarMesh(game.car);
    this.rivals = [];
    for (let i = 0; i < 3; i++) {
      const back = 16 + i * 14;
      const side = (i % 2 === 0 ? 1 : -1) * 6;
      const rx = start.x - Math.cos(dir) * back - Math.sin(dir) * side;
      const rz = start.z - Math.sin(dir) * back + Math.cos(dir) * side;
      const rival = createCar(RIVAL_MODELS[i], rx, rz, dir, { rival: true, name: RIVAL_NAMES[i] });
      rival.nextCp = 1;
      rival.finished = false;
      game.scene.add(rival.mesh);
      game.cars.push(rival);
      this.rivals.push(rival);
    }
    // Checkpoint rings: the next one glows orange, the rest are dim.
    this.rings = [];
    const ringGeo = new THREE.TorusGeometry(15, 1.4, 8, 24);
    for (let i = 0; i < wps.length; i++) {
      const wp = wps[i];
      const mat = new THREE.MeshBasicMaterial({ color: i === 0 ? 0xff8a00 : 0x666666 });
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.set(wp.x, terrainHeight(wp.x, wp.z) + 9, wp.z);
      ring.rotation.y = Math.atan2(wps[(i + 1) % wps.length].z - wp.z, wps[(i + 1) % wps.length].x - wp.x);
      game.scene.add(ring);
      this.rings.push(ring);
    }
    game.hud.toast(`${route.name} — get ready`, 'good');
    return true;
  }

  abort() {
    const game = this.game;
    for (const r of this.rivals) {
      game.scene.remove(r.mesh);
      const i = game.cars.indexOf(r);
      if (i >= 0) game.cars.splice(i, 1);
    }
    for (const ring of this.rings) game.scene.remove(ring);
    this.rivals = [];
    this.rings = [];
    this.active = false;
    this.route = null;
  }

  update(dt) {
    const game = this.game;
    if (!this.active) return;
    const route = this.route;
    const wps = route.waypoints;

    if (this.countdown > 0) {
      this.countdown -= dt;
      const whole = Math.ceil(this.countdown);
      if (whole < this.lastBeep && whole > 0) {
        this.lastBeep = whole;
        game.audio.countBeep(false);
        game.hud.raceCount(whole);
      }
      if (this.countdown <= 0) {
        game.audio.countBeep(true);
        game.hud.raceCount('GO!');
        game.hud.toast('GO!', 'good');
      }
      return;
    }

    // Player checkpoints.
    const p = game.player;
    const target = wps[this.cp % wps.length];
    if (dist(p.x, p.z, target.x, target.z) < 40) {
      this.cp++;
      game.audio.pickup();
      game.combat.spawnParticles(target.x, terrainHeight(target.x, target.z) + 8, target.z, 12, 40, 40);
      if (this.cp >= wps.length) {
        this.finish();
        return;
      }
      this.rings.forEach((ring, i) => {
        ring.material.color.setHex(i === this.cp % wps.length ? 0xff8a00 : 0x666666);
      });
    }

    // Rivals chase the same checkpoints. They brake for sharp corners so
    // they turn on the road instead of cutting across the blocks.
    for (const rival of this.rivals) {
      if (rival.finished) continue;
      const wp = wps[rival.nextCp % wps.length];
      const after = wps[(rival.nextCp + 1) % wps.length];
      const leg = Math.atan2(wp.z - rival.z, wp.x - rival.x);
      const nextLeg = Math.atan2(after.z - wp.z, after.x - wp.x);
      const turn = Math.abs(((nextLeg - leg + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const dWp = dist(rival.x, rival.z, wp.x, wp.z);
      let top = route.rivalTop * (0.94 + rival.nextCp * 0.005);
      if (turn > 0.6 && dWp < 220) top = Math.min(top, 175);
      const ctl = steerCarToward(rival, wp.x, wp.z, top);
      driveCar(rival, ctl, dt, game.island);
      syncCarMesh(rival);
      if (dist(rival.x, rival.z, wp.x, wp.z) < 40) {
        rival.nextCp++;
        if (rival.nextCp >= wps.length) {
          rival.finished = true;
          this.rivalFinish.push(rival.name);
        }
      }
    }

    // Live position: checkpoints first, then distance to the next one.
    const myTarget = wps[this.cp % wps.length];
    const myScore = this.cp * 10000 - dist(p.x, p.z, myTarget.x, myTarget.z);
    let place = 1;
    for (const rival of this.rivals) {
      if (rival.finished) {
        place++;
        continue;
      }
      const rt = wps[rival.nextCp % wps.length];
      const rScore = rival.nextCp * 10000 - dist(rival.x, rival.z, rt.x, rt.z);
      if (rScore > myScore) place++;
    }
    this.position = place;
    this.finishT += dt;
    if (this.finishT > 300) {
      game.hud.toast('Race abandoned — too slow', 'bad');
      game.audio.fail();
      this.abort();
    }
  }

  finish() {
    const game = this.game;
    this.finished = true;
    const place = this.position;
    const prize = this.route.prize[place - 1] || 0;
    // Missions read this (and mark it consumed) on the next update.
    this.lastResult = { route: this.route.id, place, prize, consumed: false };
    game.cash += prize;
    game.stats.racesWon += place === 1 ? 1 : 0;
    if (place === 1) {
      game.standing.change(game, this.route.district, 20, `${this.route.name} win`);
      game.hud.showRaceResult(true, place, prize, this.route.name);
      game.audio.jingle();
    } else {
      game.standing.change(game, this.route.district, 6, `${this.route.name} finished ${place}`);
      game.hud.showRaceResult(false, place, prize, this.route.name);
      game.audio.cash();
    }
    game.save();
    this.abort();
  }

  // For missions: the active race route the mission is waiting on.
  isRacing(routeId) {
    return this.active && this.route && this.route.id === routeId;
  }
}

export function districtName(id) {
  const names = { ash: 'Port Ash', vieja: 'Caldera Vieja', sands: 'Palma Sands', cinder: 'Mount Cinder', slag: 'Slagworks' };
  return names[id] || id;
}
