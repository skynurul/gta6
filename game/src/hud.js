// hud.js — everything on screen that is not the 3D island: wanted stars,
// cash, health, the mission tracker, the live minimap, district standing,
// the crew strip, race position, toasts, and the menus (title, pause, story,
// race result, crew, busted, wasted). The minimap is its own small canvas so
// it stays crisp at any window size.
import { money, dist } from './util.js';
import { AVENUES, STREETS, VOLCANO, DISTRICTS } from './terrain3d.js';
import { missionTitle, currentStepDef } from './missions.js';

export function makeHud() {
  const $ = (id) => document.getElementById(id);
  const hud = {
    root: $('hud'),
    stars: $('stars'),
    cash: $('cash'),
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    missionTitle: $('mission-title'),
    missionText: $('mission-text'),
    toastEl: $('toast'),
    speed: $('speed'),
    carName: $('car-name'),
    minimap: $('minimap'),
    districtsEl: $('districts'),
    crewEl: $('crew-strip'),
    raceHud: $('race-hud'),
    racePos: $('race-pos'),
    raceCp: $('race-cp'),
    raceCountEl: $('race-count'),
    menu: $('menu'),
    menuTitle: $('menu-title'),
    menuBody: $('menu-body'),
    menuHint: $('menu-hint'),
    busted: $('busted'),
    crewPanel: $('crew-panel'),
    toastTimer: 0,
    toastQueue: [],
    mapCtx: null,
  };
  if (hud.minimap) hud.mapCtx = hud.minimap.getContext('2d');

  hud.toast = (text, kind) => {
    hud.toastQueue.push({ text, kind: kind || '' });
    if (hud.toastQueue.length > 3) hud.toastQueue.shift();
    hud.toastEl.innerHTML = hud.toastQueue.map((t) => `<div class="toast-line ${t.kind}">${t.text}</div>`).join('');
    hud.toastEl.classList.add('show');
    hud.toastTimer = 4;
  };

  hud.showStory = (title, text) => {
    hud.menuTitle.textContent = title;
    hud.menuBody.textContent = text;
    hud.menuHint.textContent = 'Press Enter or click to continue';
    hud.menu.classList.remove('hidden');
    hud.menu.dataset.kind = 'story';
  };

  hud.showRaceResult = (win, place, prize, name) => {
    hud.menuTitle.textContent = win ? 'Race Won!' : `Finished ${place}`;
    hud.menuBody.textContent = `${name} — ${place}${place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'} place. Prize ${money(prize)}.`;
    hud.menuHint.textContent = 'Press Enter or click to continue';
    hud.menu.classList.remove('hidden');
    hud.menu.dataset.kind = 'story';
  };

  hud.raceCount = (text) => {
    hud.raceCountEl.textContent = String(text);
    hud.raceCountEl.classList.remove('hidden');
    if (text === 'GO!') setTimeout(() => hud.raceCountEl.classList.add('hidden'), 800);
  };

  hud.hideMenu = () => {
    hud.menu.classList.add('hidden');
  };

  hud.showBusted = (fine) => {
    hud.busted.classList.remove('hidden');
    hud.busted.querySelector('.big').textContent = 'BUSTED';
    hud.busted.querySelector('.sub').textContent = `The Isle PD took ${money(fine)} and dropped you at the safehouse. Press Enter to continue.`;
  };

  hud.showWasted = () => {
    hud.busted.classList.remove('hidden');
    hud.busted.querySelector('.big').textContent = 'WASTED';
    hud.busted.querySelector('.sub').textContent = 'Juno is down. The crew dragged her to the safehouse. Press Enter to continue.';
  };

  hud.hideBusted = () => {
    hud.busted.classList.add('hidden');
  };

  hud.toggleCrewPanel = (game) => {
    const open = hud.crewPanel.classList.toggle('hidden');
    if (open) return;
    const rows = game.crew.members.map((m) => {
      const status = m.recruited
        ? (m.riding ? 'Riding with you' : 'Following')
        : `Needs: ${m.recruit.type === 'story' ? 'story' : `${m.recruit.min} standing in ${m.recruit.district}`}`;
      return `<div class="crew-row"><b style="color:#${m.color.toString(16).padStart(6, '0')}">${m.name}</b> — ${m.role}<br><span class="dim">${m.desc}</span><br><span class="dim">${status}</span></div>`;
    }).join('');
    hud.crewPanel.innerHTML = `<h3>Crew</h3>${rows}<div class="dim">Press C to close. Dario and Ilya join when your standing is high enough.</div>`;
  };

  hud.setScreen = (screen) => {
    const title = $('title');
    const paused = $('paused');
    if (title) title.classList.toggle('hidden', screen !== 'title');
    if (paused) paused.classList.toggle('hidden', screen !== 'paused');
    hud.root.classList.toggle('hidden', screen === 'title');
    if (screen === 'title') hud.hideBusted();
  };

  // Draw the island from above: sea, land, roads, volcano, districts, blips.
  hud.drawMinimap = (game) => {
    const ctx = hud.mapCtx;
    if (!ctx) return;
    const S = 180;
    const k = S / 3400;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#1e7a8a';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#5f7a4a';
    ctx.beginPath();
    ctx.arc(1700 * k, 1700 * k, 1650 * k, 0, Math.PI * 2);
    ctx.fill();
    // District tints.
    for (const d of DISTRICTS) {
      ctx.fillStyle = `#${d.color.toString(16).padStart(6, '0')}55`;
      ctx.beginPath();
      ctx.arc(d.center.x * k, d.center.y * k, 330 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    // Roads.
    ctx.strokeStyle = '#3d3a38';
    ctx.lineWidth = 2;
    for (const a of AVENUES) {
      ctx.beginPath();
      ctx.moveTo(a * k, 0);
      ctx.lineTo(a * k, S);
      ctx.stroke();
    }
    for (const s of STREETS) {
      ctx.beginPath();
      ctx.moveTo(0, s * k);
      ctx.lineTo(S, s * k);
      ctx.stroke();
    }
    // Volcano.
    ctx.fillStyle = '#ff5a00';
    ctx.beginPath();
    ctx.arc(VOLCANO.x * k, VOLCANO.z * k, 7, 0, Math.PI * 2);
    ctx.fill();
    // Mission target blip (pulsing).
    const t = game.mission.target;
    if (t) {
      const pulse = 5 + Math.sin(game.time * 5) * 2;
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath();
      ctx.arc(t.x * k, t.z * k, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffe14a';
      ctx.beginPath();
      ctx.arc(t.x * k, t.z * k, pulse + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Race checkpoints.
    if (game.race.active && game.race.route) {
      ctx.fillStyle = '#ff8a00';
      for (const wp of game.race.route.waypoints) {
        ctx.fillRect(wp.x * k - 2, wp.z * k - 2, 4, 4);
      }
    }
    // Crew (green), cruisers (red).
    ctx.fillStyle = '#4ad97a';
    for (const m of game.crew.members) {
      if (m.recruited && !m.riding && m.mesh) {
        ctx.beginPath();
        ctx.arc(m.x * k, m.z * k, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#ff2020';
    for (const c of game.cruisers) {
      ctx.beginPath();
      ctx.arc(c.x * k, c.z * k, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const p = game.player;
    ctx.save();
    ctx.translate(p.x * k, p.z * k);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -4);
    ctx.lineTo(-5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  hud.update = (game, dt) => {
    if (hud.toastTimer > 0) {
      hud.toastTimer -= dt;
      if (hud.toastTimer <= 0) hud.toastEl.classList.remove('show');
    }
    hud.cash.textContent = money(game.cash);
    hud.healthFill.style.width = `${Math.max(0, game.player.health)}%`;
    hud.healthText.textContent = `${Math.max(0, Math.round(game.player.health))}`;
    const stars = '★'.repeat(game.police.stars) + '☆'.repeat(5 - game.police.stars);
    hud.stars.textContent = stars;
    hud.stars.classList.toggle('hot', game.police.stars > 0);
    if (game.car) {
      hud.speed.textContent = `${Math.round(Math.abs(game.car.speed) * 0.36)}`;
      hud.carName.textContent = game.car.model.name;
    } else {
      hud.speed.textContent = '0';
      hud.carName.textContent = 'On foot';
    }
    // Mission tracker.
    const step = currentStepDef(game.mission);
    if (game.mission.active && step) {
      hud.missionTitle.textContent = missionTitle(game.mission);
      let text = step.label;
      if (step.type === 'collect') {
        text += ` — ${game.mission.collected}/${step.count}`;
      }
      if (game.mission.target) {
        const d = Math.round(dist(game.player.x, game.player.z, game.mission.target.x, game.mission.target.z));
        text += ` — ${d}m`;
      }
      hud.missionText.textContent = text;
    } else if (game.mission.active && game.mission.sideJob) {
      hud.missionTitle.textContent = missionTitle(game.mission);
      hud.missionText.textContent = game.mission.target ? game.mission.target.label : 'Courier run';
    } else {
      hud.missionTitle.textContent = 'FREE ROAM';
      hud.missionText.textContent = `Next job: ${missionTitle(game.mission)} — press J to start, R near a race start to race`;
    }
    // District standing strip.
    hud.districtsEl.innerHTML = game.standing.list().map((d) => {
      const pct = ((d.score + 100) / 200) * 100;
      const cls = d.score >= 20 ? 'good' : d.score <= -20 ? 'bad' : '';
      return `<div class="dist ${cls}"><span>${d.name}</span><div class="bar"><i style="width:${pct}%"></i></div><b>${d.score > 0 ? '+' : ''}${d.score}</b></div>`;
    }).join('');
    // Crew strip.
    hud.crewEl.innerHTML = game.crew.members.map((m) => {
      const cls = m.recruited ? (m.riding ? 'riding' : 'in') : 'out';
      return `<span class="crew-dot ${cls}" style="--c:#${m.color.toString(16).padStart(6, '0')}">${m.name.split(' ')[0]}</span>`;
    }).join('');
    // Race HUD.
    if (game.race.active) {
      hud.raceHud.classList.remove('hidden');
      hud.racePos.textContent = `${game.race.position}${game.race.position === 1 ? 'st' : game.race.position === 2 ? 'nd' : game.race.position === 3 ? 'rd' : 'th'}`;
      hud.raceCp.textContent = `Checkpoint ${Math.min(game.race.cp + 1, game.race.route.waypoints.length)}/${game.race.route.waypoints.length}`;
    } else {
      hud.raceHud.classList.add('hidden');
      hud.raceCountEl.classList.add('hidden');
    }
    hud.drawMinimap(game);
  };

  return hud;
}
