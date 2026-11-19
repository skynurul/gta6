// render.js — paints Solmar Bay: sun-soaked streets, pastel buildings with
// long afternoon shadows, the turquoise shore, traffic, people, and the player.
// The camera follows Leo and eases out as he drives faster.
import { TAU, clamp, dist } from './util.js';
import { ROAD_W, WORLD } from './city.js';

export function makeCamera() {
  return { x: 0, y: 0, zoom: 1, shake: 0 };
}

export function updateCamera(cam, targetX, targetY, speed, dt, vw, vh) {
  const wantZoom = clamp(1.05 - speed / 2400, 0.82, 1.05);
  cam.zoom += (wantZoom - cam.zoom) * dt * 2;
  const tx = targetX - vw / 2 / cam.zoom;
  const ty = targetY - vh / 2 / cam.zoom;
  cam.x += (tx - cam.x) * Math.min(1, dt * 5);
  cam.y += (ty - cam.y) * Math.min(1, dt * 5);
  cam.shake = Math.max(0, cam.shake - dt * 2.2);
}

export function render(ctx, game, vw, vh) {
  const cam = game.camera;
  const shakeX = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 14 : 0;
  const shakeY = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 14 : 0;
  ctx.save();
  ctx.clearRect(0, 0, vw, vh);
  // Warm afternoon sky tint behind everything.
  ctx.fillStyle = '#ffe9b8';
  ctx.fillRect(0, 0, vw, vh);
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x - vw / 2 / cam.zoom + shakeX, -cam.y - vh / 2 / cam.zoom + shakeY);

  drawGround(ctx, game);
  drawRoads(ctx, game);
  drawDocks(ctx, game);
  drawPark(ctx, game);
  drawBuildings(ctx, game);
  drawTrees(ctx, game);
  drawCrates(ctx, game);
  drawObjectiveMarker(ctx, game);
  drawCars(ctx, game);
  drawPeds(ctx, game);
  drawPlayer(ctx, game);
  drawBullets(ctx, game);
  drawParticles(ctx, game);
  drawVignette(ctx, game, vw, vh);
  ctx.restore();
}

function drawGround(ctx, game) {
  // Grass base.
  ctx.fillStyle = '#8fc07a';
  ctx.fillRect(0, 0, WORLD, WORLD);
  // Beach and water along the south shore.
  ctx.fillStyle = '#ecd9a0';
  ctx.fillRect(0, 3140, WORLD, 120);
  ctx.fillStyle = '#2fa8a0';
  ctx.fillRect(0, 3260, WORLD, 140);
  ctx.fillStyle = '#57c4bd';
  ctx.fillRect(0, 3260, WORLD, 26);
  // Foam lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  for (let x = 0; x < WORLD; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, 3272 + Math.sin(game.time * 1.4 + x * 0.02) * 4);
    ctx.lineTo(x + 46, 3272 + Math.sin(game.time * 1.4 + x * 0.02) * 4);
    ctx.stroke();
  }
}

function drawRoads(ctx, game) {
  const city = game.city;
  ctx.fillStyle = '#43434f';
  for (const a of city.avenues) ctx.fillRect(a - ROAD_W / 2, 0, ROAD_W, WORLD);
  for (const s of city.streets) ctx.fillRect(0, s - ROAD_W / 2, WORLD, ROAD_W);
  // Sidewalks.
  ctx.fillStyle = '#c9c2b4';
  for (const a of city.avenues) {
    ctx.fillRect(a - ROAD_W / 2 - 10, 0, 10, WORLD);
    ctx.fillRect(a + ROAD_W / 2, 0, 10, WORLD);
  }
  for (const s of city.streets) {
    ctx.fillRect(0, s - ROAD_W / 2 - 10, WORLD, 10);
    ctx.fillRect(0, s + ROAD_W / 2, WORLD, 10);
  }
  // Centre dashes.
  ctx.fillStyle = '#f5d76e';
  for (const a of city.avenues) {
    for (let y = 0; y < WORLD; y += 64) ctx.fillRect(a - 2, y, 4, 34);
  }
  for (const s of city.streets) {
    for (let x = 0; x < WORLD; x += 64) ctx.fillRect(x, s - 2, 34, 4);
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const a of city.avenues) {
    for (const s of city.streets) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(a - 34 + i * 10, s - ROAD_W / 2 - 2, 6, 12);
        ctx.fillRect(a - 34 + i * 10, s + ROAD_W / 2 - 10, 6, 12);
      }
    }
  }
}

function drawDocks(ctx, game) {
  const d = game.city.docks;
  ctx.fillStyle = '#8a6d4b';
  ctx.fillRect(d.x, d.y, d.w, d.h);
  ctx.fillStyle = '#6b543a';
  for (let y = d.y + 60; y < d.y + d.h; y += 160) {
    ctx.fillRect(d.x, y, d.w, 8);
  }
  ctx.fillStyle = '#2fa8a0';
  ctx.fillRect(d.x + d.w, d.y, WORLD - d.x - d.w, d.h);
}

function drawPark(ctx, game) {
  ctx.fillStyle = '#6fae62';
  ctx.fillRect(662, 2400 - 38, 276, 276);
  ctx.fillStyle = '#57c4bd';
  ctx.beginPath();
  ctx.ellipse(800, 2540, 46, 30, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e8d8a0';
  ctx.beginPath();
  ctx.arc(700, 2440, 14, 0, TAU);
  ctx.fill();
}

function drawBuildings(ctx, game) {
  for (const b of game.city.buildings) {
    // Long afternoon shadow.
    ctx.fillStyle = 'rgba(60,40,20,0.18)';
    ctx.fillRect(b.x + 14, b.y + b.height + 8, b.w, b.h);
    // Height side (fake 2.5D).
    ctx.fillStyle = shade(b.wall, -28);
    ctx.fillRect(b.x, b.y + b.h, b.w, b.height);
    ctx.fillRect(b.x + b.w, b.y + 6, b.height * 0.7, b.h);
    // Walls and roof.
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    // Windows.
    ctx.fillStyle = 'rgba(30,60,90,0.55)';
    const cols = b.windows;
    const rows = Math.max(1, Math.floor(b.h / 52));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        ctx.fillRect(b.x + 12 + i * ((b.w - 24) / cols), b.y + 12 + j * ((b.h - 24) / rows), 10, 12);
      }
    }
    // Downtown towers get a rooftop box.
    if (b.downtown && b.height > 24) {
      ctx.fillStyle = shade(b.roof, -20);
      ctx.fillRect(b.x + b.w / 2 - 16, b.y + b.h / 2 - 12, 32, 24);
    }
  }
}

function drawTrees(ctx, game) {
  for (const t of game.city.trees) {
    ctx.fillStyle = 'rgba(60,40,20,0.15)';
    ctx.beginPath();
    ctx.ellipse(t.x + 6, t.y + 8, t.r, t.r * 0.6, 0, 0, TAU);
    ctx.fill();
    if (t.palm) {
      ctx.strokeStyle = '#7a5a36';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y + 6);
      ctx.lineTo(t.x, t.y - 6);
      ctx.stroke();
      ctx.fillStyle = '#3f9e4d';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.4;
        ctx.beginPath();
        ctx.ellipse(t.x + Math.cos(a) * t.r * 0.7, t.y - 6 + Math.sin(a) * t.r * 0.5, t.r * 0.75, 4, a, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#4c9a4c';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#66bb66';
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, TAU);
      ctx.fill();
    }
  }
  for (const l of game.city.lamps) {
    ctx.fillStyle = '#333';
    ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
  }
}

function drawCrates(ctx, game) {
  for (const c of game.city.crates) {
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x, c.y, c.w, c.h);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + c.w, c.y + c.h);
    ctx.stroke();
  }
  // Mission crates glow gold.
  const m = game.mission;
  if (m.active && m.data.crates) {
    for (const c of m.data.crates) {
      if (c.taken) continue;
      const pulse = 0.5 + Math.sin(game.time * 5) * 0.3;
      ctx.strokeStyle = `rgba(255,214,10,${pulse})`;
      ctx.lineWidth = 4;
      ctx.strokeRect(c.x - 8, c.y - 8, 36, 36);
    }
  }
}

function drawObjectiveMarker(ctx, game) {
  const target = objectiveTarget(game);
  if (!target) return;
  const p = game.player;
  const d = dist(p.x, p.y, target.x, target.y);
  // Ground beacon.
  const pulse = 0.6 + Math.sin(game.time * 5) * 0.25;
  ctx.strokeStyle = `rgba(255,214,10,${pulse})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 34 + Math.sin(game.time * 3) * 5, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,214,10,${0.25 + pulse * 0.2})`;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 22, 0, TAU);
  ctx.fill();
  // Distance label.
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(d)}m`, target.x, target.y - 46);
}

export function objectiveTarget(game) {
  const m = game.mission;
  if (m.active) {
    const def = game.missionDefs[m.index];
    if (!def) return null;
    const step = def.steps[m.step];
    if (!step) return null;
    if (step.place) return game.city.places[step.place];
    if (step.type === 'collect' && m.data.crates) {
      const next = m.data.crates.find((c) => !c.taken);
      if (next) return next;
    }
    if (step.type === 'chase' && m.data.targetCar) return m.data.targetCar;
    if (step.type === 'stealCar') return game.city.places[step.place];
  }
  if (m.sideJob) return m.sideJob.target;
  return null;
}

function drawCars(ctx, game) {
  for (const car of game.cars) {
    if (car.dead) continue;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const m = car.model;
    const L = m.len;
    const W = m.wid;
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
    // Body.
    ctx.fillStyle = car.color;
    roundRect(ctx, -L / 2, -W / 2, L, W, 7);
    ctx.fill();
    // Roof + windows.
    ctx.fillStyle = 'rgba(20,30,45,0.85)';
    roundRect(ctx, -L / 2 + 10, -W / 2 + 4, L * 0.42, W - 8, 4);
    ctx.fill();
    // Headlights and tail lights.
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(L / 2 - 2, -W / 2 + 3, 3, 5);
    ctx.fillRect(L / 2 - 2, W / 2 - 8, 3, 5);
    ctx.fillStyle = '#ff2e2e';
    ctx.fillRect(-L / 2 - 1, -W / 2 + 3, 3, 5);
    ctx.fillRect(-L / 2 - 1, W / 2 - 8, 3, 5);
    // Wheels.
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-L / 2 + 6, -W / 2 - 3, 10, 4);
    ctx.fillRect(-L / 2 + 6, W / 2 - 1, 10, 4);
    ctx.fillRect(L / 2 - 16, -W / 2 - 3, 10, 4);
    ctx.fillRect(L / 2 - 16, W / 2 - 1, 10, 4);
    if (car.driver === 'police') {
      // Light bar, flashing.
      const on = Math.floor(game.time * 6) % 2 === 0;
      ctx.fillStyle = on ? '#ff2e2e' : '#2e7dff';
      ctx.fillRect(-6, -W / 2 - 2, 12, 4);
      ctx.fillStyle = on ? '#2e7dff' : '#ff2e2e';
      ctx.fillRect(-6, W / 2 - 2, 12, 4);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PD', 0, 3);
    }
    if (car.taxi) {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    // Damage smoke.
    if (car.health < 40) {
      ctx.fillStyle = 'rgba(80,80,80,0.5)';
      ctx.beginPath();
      ctx.arc(-L / 2, 0, 6 + Math.sin(game.time * 9) * 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawPeds(ctx, game) {
  for (const ped of game.peds) {
    if (ped.dead) continue;
    const bob = Math.sin(ped.walkPhase) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(ped.x + 2, ped.y + 3, 7, 4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y + bob * 0.3, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y + 3 + bob * 0.3, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(ped.x, ped.y - 2 + bob * 0.3, 4.5, 0, TAU);
    ctx.fill();
  }
}

function drawPlayer(ctx, game) {
  const p = game.player;
  if (p.inCar) return;
  const bob = Math.sin(p.walkPhase) * 2;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(3, 4, 9, 5, 0, 0, TAU);
  ctx.fill();
  // Leo: teal jacket, dark jeans, unmistakable.
  ctx.fillStyle = '#0e7490';
  ctx.beginPath();
  ctx.arc(0, 2 + bob * 0.2, 8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(2, -1 + bob * 0.2, 5.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(2, -2 + bob * 0.2, 4.5, Math.PI, TAU);
  ctx.fill();
  // Pistol when armed.
  if (p.armed) {
    ctx.fillStyle = '#222';
    ctx.fillRect(6, -1, 9, 3);
  }
  ctx.restore();
  // Aim line while shooting.
  if (p.aiming) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.aimAngle) * 90, p.y + Math.sin(p.aimAngle) * 90);
    ctx.stroke();
  }
}

function drawBullets(ctx, game) {
  ctx.fillStyle = '#ffe66d';
  for (const b of game.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, TAU);
    ctx.fill();
  }
}

function drawParticles(ctx, game) {
  for (const pt of game.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Skid marks.
  ctx.strokeStyle = 'rgba(20,20,20,0.35)';
  ctx.lineWidth = 3;
  for (const s of game.skids) {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
}

function drawVignette(ctx, game, vw, vh) {
  // Soft warm grade over the whole frame.
  ctx.fillStyle = 'rgba(255,170,60,0.05)';
  ctx.fillRect(game.camera.x, game.camera.y, vw / game.camera.zoom, vh / game.camera.zoom);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255);
  const g = clamp(((n >> 8) & 0xff) + amt, 0, 255);
  const b = clamp((n & 0xff) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}
