// hud.js — everything on screen that is not the city: wanted stars, health,
// cash, the mission tracker, the minimap, message toasts, and the menus
// (title, pause, mission complete, busted, wasted). The minimap is its own
// small canvas so it stays crisp at any window size.
import { money } from './util.js';

export function makeHud() {
  const hud = {
    root: document.getElementById('hud'),
    stars: document.getElementById('stars'),
    cash: document.getElementById('cash'),
    healthFill: document.getElementById('health-fill'),
    healthText: document.getElementById('health-text'),
    missionTitle: document.getElementById('mission-title'),
    missionText: document.getElementById('mission-text'),
    toast: document.getElementById('toast'),
    speed: document.getElementById('speed'),
    carName: document.getElementById('car-name'),
    minimap: document.getElementById('minimap'),
    menu: document.getElementById('menu'),
    menuTitle: document.getElementById('menu-title'),
    menuBody: document.getElementById('menu-body'),
    menuHint: document.getElementById('menu-hint'),
    busted: document.getElementById('busted'),
    toastTimer: 0,
  };
  hud.mapCtx = hud.minimap.getContext('2d');
  return hud;
}

export function showToast(hud, text, seconds = 3.2) {
  hud.toast.textContent = text;
  hud.toast.classList.add('show');
  hud.toastTimer = seconds;
}

export function updateHud(hud, game, dt) {
  if (hud.toastTimer > 0) {
    hud.toastTimer -= dt;
    if (hud.toastTimer <= 0) hud.toast.classList.remove('show');
  }
  // Wanted stars.
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < game.police.wanted ? '★' : '☆';
  if (hud.stars.textContent !== stars) hud.stars.textContent = stars;
  hud.stars.classList.toggle('hot', game.police.wanted > 0);
  const cashText = money(game.cash);
  if (hud.cash.textContent !== cashText) hud.cash.textContent = cashText;
  const hp = Math.max(0, Math.round(game.player.health));
  hud.healthFill.style.width = hp + '%';
  hud.healthFill.classList.toggle('low', hp < 30);
  hud.healthText.textContent = hp;
  const inCar = game.player.inCar;
  hud.speed.textContent = inCar ? Math.round(Math.abs(game.player.car.speed) * 0.36) + ' km/h' : '';
  hud.carName.textContent = inCar ? game.player.car.model.name : 'On foot';
  drawMinimap(hud, game);
}

export function setMissionText(hud, title, text) {
  hud.missionTitle.textContent = title;
  hud.missionText.textContent = text;
}

function drawMinimap(hud, game) {
  const ctx = hud.mapCtx;
  const S = 180;
  const scale = S / 3400;
  ctx.clearRect(0, 0, S, S);
  // Water and sand.
  ctx.fillStyle = '#3aa7a3';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#e8d8a0';
  ctx.fillRect(0, S - 14, S, 14);
  // City ground.
  ctx.fillStyle = '#7fae6e';
  ctx.fillRect(0, 0, S, S - 14);
  // Roads.
  ctx.fillStyle = '#3d3d4d';
  for (const a of game.city.avenues) ctx.fillRect(a * scale - 2, 0, 4, S);
  for (const s of game.city.streets) ctx.fillRect(0, s * scale - 2, S, 4);
  // Buildings, as darker blocks, so the map reads as a city.
  ctx.fillStyle = 'rgba(60,70,60,0.55)';
  for (const b of game.city.buildings) {
    ctx.fillRect(b.x * scale, b.y * scale, Math.max(1.5, b.w * scale), Math.max(1.5, b.h * scale));
  }
  // Docks.
  ctx.fillStyle = '#8a6d4b';
  ctx.fillRect(3120 * scale, 400 * scale, 240 * scale, 2200 * scale);
  // Mission / job blip.
  const blip = missionBlip(game);
  if (blip) {
    const pulse = 5 + Math.sin(game.time * 6) * 2;
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(blip.x * scale, blip.y * scale, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Player arrow.
  const p = game.player;
  ctx.save();
  ctx.translate(p.x * scale, p.y * scale);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  // Police dots.
  ctx.fillStyle = '#4cc9f0';
  for (const c of game.cars) {
    if (c.driver === 'police' && !c.dead) {
      ctx.beginPath();
      ctx.arc(c.x * scale, c.y * scale, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function missionBlip(game) {
  const m = game.mission;
  if (m.active) {
    const def = missionDef(game);
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
  if (!m.active && m.index < game.missionDefs.length) return game.city.places.safehouse;
  return null;
}

function missionDef(game) {
  const idx = game.mission.index;
  return idx >= 0 && idx < game.missionDefs.length ? game.missionDefs[idx] : null;
}

export function showMenu(hud, kind, data) {
  hud.menu.classList.remove('hidden');
  hud.busted.classList.add('hidden');
  if (kind === 'title') {
    hud.menuTitle.textContent = 'SOLMAR BAY';
    hud.menuBody.innerHTML =
      '<p class="tagline">An open-world crime story in the sun.</p>' +
      '<p>Leo Marín is home — broke, wanted, and one job away from everything.</p>' +
      '<p class="controls">WASD / Arrows — walk &amp; drive &nbsp;·&nbsp; E — enter / exit car<br>' +
      'Mouse / F — shoot &nbsp;·&nbsp; Space — handbrake &nbsp;·&nbsp; J — start mission &nbsp;·&nbsp; P — pause</p>' +
      (data?.hasSave ? '<p class="save-note">A save was found — press Enter to continue it.</p>' : '');
    hud.menuHint.textContent = 'Press Enter or click to play';
  } else if (kind === 'paused') {
    hud.menuTitle.textContent = 'PAUSED';
    hud.menuBody.innerHTML =
      '<p>Solmar Bay waits for no one — except right now.</p>' +
      '<p class="controls">M — mute &nbsp;·&nbsp; S — save now &nbsp;·&nbsp; R — restart the current mission</p>';
    hud.menuHint.textContent = 'Press P or Esc to keep playing';
  } else if (kind === 'complete') {
    hud.menuTitle.textContent = 'JOB DONE';
    hud.menuBody.innerHTML =
      `<p class="big">${data.title}</p><p>You earned <b>${money(data.reward)}</b>.</p>` +
      (data.next
        ? `<p>Next up: <b>${data.next}</b> — press J when you are ready.</p>`
        : '<p class="big">You are the King of the Bay.</p><p>Free roam is yours. Courier runs pay cash — press J.</p>');
    hud.menuHint.textContent = 'Press Enter to keep playing';
  } else if (kind === 'failed') {
    hud.menuTitle.textContent = 'JOB FAILED';
    hud.menuBody.innerHTML = `<p>${data.reason}</p><p>Press J to try the job again.</p>`;
    hud.menuHint.textContent = 'Press Enter to keep playing';
  }
}

export function hideMenu(hud) {
  hud.menu.classList.add('hidden');
}

export function showBusted(hud, kind) {
  hud.busted.classList.remove('hidden');
  hud.busted.querySelector('h1').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  hud.busted.querySelector('p').textContent =
    kind === 'busted'
      ? 'The Solmar Bay PD caught up with Leo. The fine stings, the story goes on.'
      : 'Leo is down — but the Bay never keeps a good driver down for long.';
}

export function hideBusted(hud) {
  hud.busted.classList.add('hidden');
}
