// crew.js — Juno's crew. Mara drives, Dario shoots, Ilya watches. They follow
// Juno on foot, ride along in the car, and lend their bonus while they ride.
// Mara joins in the story; Dario and Ilya need district standing to sign on.
import { buildPedMesh } from './pedestrians3d.js';
import { terrainHeight, collideWorld } from './terrain3d.js';
import { dist, clamp } from './util.js';

export const CREW_DEFS = [
  {
    id: 'mara', name: 'Mara Voss', role: 'Driver',
    desc: 'Ex-rally driver. While she rides, the car is faster and grips harder.',
    color: 0xd95a4a, recruit: { type: 'story' },
  },
  {
    id: 'dario', name: 'Dario Kett', role: 'Gunner',
    desc: 'Dock muscle. While he rides, he shoots back at PD cruisers.',
    color: 0x4a7ad9, recruit: { type: 'standing', district: 'slag', min: 20 },
  },
  {
    id: 'ilya', name: 'Ilya Sorren', role: 'Lookout',
    desc: 'Old-town eyes. While he rides, heat builds slower and cops hesitate.',
    color: 0x4ad97a, recruit: { type: 'standing', district: 'vieja', min: 20 },
  },
];

export class Crew {
  constructor(game) {
    this.game = game;
    this.members = CREW_DEFS.map((d, i) => ({
      ...d,
      recruited: d.id === 'mara',
      riding: false,
      x: 0, z: 0,
      angle: 0,
      mesh: null,
      slot: i,
    }));
  }

  get(id) {
    return this.members.find((m) => m.id === id);
  }

  recruitedCount() {
    return this.members.filter((m) => m.recruited).length;
  }

  // Riding bonuses, applied while the member is in the car with Juno.
  speedBonus() {
    const mara = this.get('mara');
    return mara.recruited && mara.riding ? 1.08 : 1;
  }

  gripBonus() {
    const mara = this.get('mara');
    return mara.recruited && mara.riding ? 1.15 : 1;
  }

  heatFactor() {
    const ilya = this.get('ilya');
    return ilya.recruited && ilya.riding ? 0.7 : 1;
  }

  tryRecruit(id) {
    const m = this.get(id);
    const game = this.game;
    if (!m || m.recruited) return false;
    if (m.recruit.type === 'story') {
      m.recruited = true;
    } else if (m.recruit.type === 'standing') {
      const s = game.standing.get(m.recruit.district);
      if (s < m.recruit.min) {
        game.hud.toast(
          `${m.name} wants more standing first (${m.recruit.min} in ${districtName(m.recruit.district)}, now ${s})`,
          'bad',
        );
        return false;
      }
      m.recruited = true;
    }
    game.hud.toast(`${m.name} joined the crew — ${m.role}`, 'good');
    game.audio.jingle();
    game.save();
    this.spawnMesh(m);
    return true;
  }

  districtName(id) {
    return districtName(id);
  }

  spawnMesh(m) {
    if (m.mesh) return;
    const game = this.game;
    m.x = game.player.x + 6 + m.slot * 4;
    m.z = game.player.z + 6;
    m.mesh = buildPedMesh(m.color, 0xe8b890);
    m.mesh.position.set(m.x, terrainHeight(m.x, m.z), m.z);
    game.scene.add(m.mesh);
  }

  removeMesh(m) {
    if (!m.mesh) return;
    this.game.scene.remove(m.mesh);
    m.mesh = null;
  }

  // On foot the crew walks in formation behind Juno; in the car they ride.
  update(dt) {
    const game = this.game;
    const p = game.player;
    for (const m of this.members) {
      if (!m.recruited) continue;
      if (game.car) {
        const near = dist(m.x, m.z, p.x, p.z) < 60;
        if (near && !m.riding) {
          m.riding = true;
          this.removeMesh(m);
          game.hud.toast(`${m.name} rides with you`, 'good');
        }
        continue;
      }
      if (m.riding) {
        m.riding = false;
        this.spawnMesh(m);
      }
      if (!m.mesh) this.spawnMesh(m);
      // Formation slot behind the player.
      const behind = p.angle + Math.PI;
      const off = (m.slot - 1) * 7;
      const tx = p.x + Math.cos(behind) * 10 + Math.cos(p.angle + Math.PI / 2) * off;
      const tz = p.z + Math.sin(behind) * 10 + Math.sin(p.angle + Math.PI / 2) * off;
      const d = dist(m.x, m.z, tx, tz);
      const want = Math.atan2(tz - m.z, tx - m.x);
      let da = want - m.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      m.angle += clamp(da, -4 * dt, 4 * dt);
      const speed = d > 30 ? 210 : d > 8 ? 130 : 0;
      m.x += Math.cos(m.angle) * speed * dt;
      m.z += Math.sin(m.angle) * speed * dt;
      const pushed = collideWorld(m.x, m.z, 2, game.island.buildings);
      m.x = pushed.x;
      m.z = pushed.z;
      m.mesh.position.set(m.x, terrainHeight(m.x, m.z), m.z);
      m.mesh.rotation.y = -m.angle;
    }
  }

  // Dario fires back at the nearest cruiser while riding.
  updateGunner(dt) {
    const game = this.game;
    const dario = this.get('dario');
    if (!dario.recruited || !dario.riding || !game.car) return;
    if (game.cruisers.length === 0) return;
    this.gunT = (this.gunT || 0) - dt;
    if (this.gunT > 0) return;
    this.gunT = 1.4;
    let best = null;
    let bd = Infinity;
    for (const c of game.cruisers) {
      const d = dist(c.x, c.z, game.car.x, game.car.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (!best || bd > 320) return;
    const gy = terrainHeight(game.car.x, game.car.z) + 3;
    const ty = terrainHeight(best.x, best.z) + 2;
    const dx = best.x - game.car.x;
    const dy = ty - gy;
    const dz = best.z - game.car.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    game.combat.fireBullet(
      { x: game.car.x, y: gy, z: game.car.z },
      { x: dx / len, y: dy / len, z: dz / len },
      460, true,
    );
    game.audio.shot();
  }

  // Everyone regroups at the safehouse after a bust.
  regroupAt(x, z) {
    for (const m of this.members) {
      if (!m.recruited) continue;
      m.riding = false;
      this.removeMesh(m);
      m.x = x + m.slot * 6;
      m.z = z + 4;
      this.spawnMesh(m);
    }
  }
}

export function districtName(id) {
  const names = { ash: 'Port Ash', vieja: 'Caldera Vieja', sands: 'Palma Sands', cinder: 'Mount Cinder', slag: 'Slagworks' };
  return names[id] || id;
}
