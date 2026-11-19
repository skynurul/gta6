// combat.js — shooting, bullets, damage and the little explosions that make a
// chase feel like one. Leo carries a pistol; police shoot back when the heat is on.
import { dist } from './util.js';

export function makeBullet(x, y, angle, from, speed = 720) {
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    from, // 'player' | 'cop'
    life: 0.9,
    dead: false,
  };
}

export function updateBullets(bullets, city, dt, onHit) {
  for (const b of bullets) {
    if (b.dead) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    // A bullet dies on the first building it meets.
    for (const r of city.buildings) {
      if (b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h) {
        b.dead = true;
        onHit && onHit('wall', b.x, b.y);
        break;
      }
    }
    if (b.x < 20 || b.x > 3380 || b.y < 20 || b.y > 3380) b.dead = true;
  }
  return bullets.filter((b) => !b.dead);
}

// A bullet against a circle target (ped, player, car). Returns true on a hit.
export function bulletHits(b, tx, ty, radius) {
  return dist(b.x, b.y, tx, ty) < radius + 4;
}

export function makeParticles() {
  return [];
}

export function burst(particles, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (0.3 + Math.random() * 0.7) * (speed || 160);
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.4 + Math.random() * 0.5,
      max: 0.9,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

export function updateParticles(particles, dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;
  }
  return particles.filter((p) => p.life > 0);
}
