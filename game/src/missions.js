// missions.js — the story of Leo Marín and the five jobs that take him from a
// broke courier to the King of the Bay, plus repeatable courier runs in free roam.
import { clamp, dist, money } from './util.js';
import { driveCar, makeCar, CAR_MODELS } from './vehicles.js';
import { addHeat, setWanted } from './police.js';

export const STORY = {
  hero: 'Leo Marín',
  city: 'Solmar Bay',
  intro: 'Leo Marín came home to Solmar Bay with $40 and a dead phone. The Bay remembers him — and the Harbor Crew remembers what he owes.',
};

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 300,
    briefing: 'Rosa left a sedan by your safehouse. Get in it and bring the dock parcel to the Marina.',
    steps: [
      { type: 'enterCar', text: 'Get in the sedan by the safehouse' },
      { type: 'goto', place: 'docks', radius: 90, text: 'Drive to the Solmar Docks' },
      { type: 'goto', place: 'marina', radius: 80, text: 'Deliver the parcel to the Marina' },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    reward: 600,
    briefing: 'A Marina GT is parked at the Marina, keys in it. Take it — and take it fast — then bring it to Rosa\'s Garage.',
    steps: [
      { type: 'stealCar', model: 5, place: 'marina', radius: 60, text: 'Steal the Marina GT at the Marina' },
      { type: 'goto', place: 'garage', radius: 90, text: 'Deliver the GT to Rosa\'s Garage', inCar: true },
    ],
  },
  {
    id: 'heat-wave',
    title: 'Heat Wave',
    reward: 900,
    briefing: 'The parcel is hot and so are you: the PD is already rolling. Lose them or outrun them — just get the package to the Azure Penthouse.',
    steps: [
      { type: 'goto', place: 'penthouse', radius: 90, text: 'Reach the Azure Penthouse with the package' },
    ],
    onStart: (game) => setWanted(game.police, 2),
  },
  {
    id: 'harbor-hustle',
    title: 'Harbor Hustle',
    reward: 1200,
    briefing: 'Three crates on the docks, on foot, with the harbor patrol watching. Grab them all, then walk them to Rosa\'s Garage.',
    steps: [
      { type: 'collect', count: 3, place: 'docks', radius: 260, text: 'Collect the crates on the docks (0/3)' },
      { type: 'goto', place: 'garage', radius: 90, text: 'Bring the crates to Rosa\'s Garage' },
    ],
    onStart: (game) => setWanted(game.police, 1),
  },
  {
    id: 'king-of-the-bay',
    title: 'King of the Bay',
    reward: 2500,
    briefing: 'The Harbor Crew\'s courier is running the briefcase across town. Stop his car, take the case, and deliver it to the Azure Penthouse. The whole PD will be on you.',
    steps: [
      { type: 'chase', text: 'Stop the courier\'s car' },
      { type: 'goto', place: 'penthouse', radius: 90, text: 'Deliver the briefcase to the Azure Penthouse' },
    ],
    onStart: (game) => setWanted(game.police, 3),
  },
];

export function makeMissionState() {
  return {
    index: 0, // next mission to play
    step: 0,
    active: false,
    data: {},
    done: [], // completed mission ids
    sideJob: null,
    failed: null,
  };
}

export function startMission(game, index) {
  const def = MISSIONS[index];
  if (!def) return false;
  game.mission.active = true;
  game.mission.index = index;
  game.mission.step = 0;
  game.mission.data = {};
  game.mission.failed = null;
  setupStep(game, def, 0);
  if (def.onStart) def.onStart(game);
  return true;
}

function setupStep(game, def, stepIndex) {
  const step = def.steps[stepIndex];
  const data = game.mission.data;
  if (!step) return;
  if (step.type === 'stealCar') {
    const place = game.city.places[step.place];
    const model = CAR_MODELS[step.model];
    const car = makeCar(model, place.x + 40, place.y, 0, { driver: null, color: '#ffd60a' });
    game.cars.push(car);
    data.targetCar = car;
  }
  if (step.type === 'collect') {
    data.crates = [];
    data.collected = 0;
    const place = game.city.places[step.place];
    const spots = [
      { x: place.x - 120, y: place.y - 300 },
      { x: place.x + 60, y: place.y + 100 },
      { x: place.x - 60, y: place.y + 500 },
    ];
    for (const s of spots) data.crates.push({ x: s.x, y: s.y, taken: false });
  }
  if (step.type === 'chase') {
    const p = game.player;
    const car = makeCar(CAR_MODELS[1], p.x + 500, p.y - 200, Math.PI, { driver: 'rival', color: '#8338ec' });
    car.health = 100;
    game.cars.push(car);
    data.targetCar = car;
    data.fleeTarget = { x: p.x - 1200, y: p.y - 800 };
  }
}

export function currentObjective(game) {
  const m = game.mission;
  if (!m.active) {
    if (m.index >= MISSIONS.length) return 'Free roam — King of the Bay. Press J for a courier run.';
    return `Press J to start: ${MISSIONS[m.index].title}`;
  }
  const def = MISSIONS[m.index];
  const step = def.steps[m.step];
  if (!step) return def.title;
  let text = step.text;
  if (step.type === 'collect') {
    text = `Collect the crates on the docks (${m.data.collected || 0}/${step.count})`;
  }
  return text;
}

// Advance the active mission. Returns { type: 'step'|'complete'|'failed', ... }.
export function updateMission(game, dt) {
  const m = game.mission;
  if (!m.active) return null;
  const def = MISSIONS[m.index];
  const step = def.steps[m.step];
  if (!step) return null;
  const p = game.player;

  const advance = () => {
    m.step++;
    if (m.step >= def.steps.length) {
      completeMission(game, def);
      return { type: 'complete', mission: def };
    }
    setupStep(game, def, m.step);
    return { type: 'step', mission: def, step: def.steps[m.step] };
  };

  if (step.type === 'enterCar') {
    if (p.inCar) return advance();
  } else if (step.type === 'goto') {
    const place = game.city.places[step.place];
    if (dist(p.x, p.y, place.x, place.y) < step.radius) {
      if (step.inCar && !p.inCar) return null;
      return advance();
    }
  } else if (step.type === 'stealCar') {
    if (p.inCar && p.car === m.data.targetCar) {
      addHeat(game.police, 14);
      return advance();
    }
  } else if (step.type === 'collect') {
    if (!p.inCar) {
      for (const c of m.data.crates) {
        if (!c.taken && dist(p.x, p.y, c.x, c.y) < 46) {
          c.taken = true;
          m.data.collected++;
          game.audio.pickup();
          if (m.data.collected >= step.count) return advance();
          return { type: 'step', mission: def, step };
        }
      }
    }
  } else if (step.type === 'chase') {
    const car = m.data.targetCar;
    if (!car || car.dead || car.health <= 0) {
      return failMission(game, 'The courier got away.');
    }
    // The courier flees away from Leo; ramming it slows and damages it.
    const flee = m.data.fleeTarget;
    if (dist(car.x, car.y, flee.x, flee.y) < 200 || dist(car.x, car.y, p.x, p.y) < 500) {
      m.data.fleeTarget = {
        x: clamp(p.x + (p.x - car.x) * 2, 200, 3200),
        y: clamp(p.y + (p.y - car.y) * 2, 200, 3200),
      };
    }
    const want = Math.atan2(m.data.fleeTarget.y - car.y, m.data.fleeTarget.x - car.x);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    driveCar(car, dt, 1, clamp(diff * 2, -1, 1), false);
    if (dist(p.x, p.y, car.x, car.y) < 70 && p.inCar && Math.abs((p.car?.speed || 0)) > 120) {
      car.health -= 22 * dt * 4;
    }
    if (car.health <= 28) {
      car.speed = Math.max(0, car.speed - 200 * dt);
      if (dist(p.x, p.y, car.x, car.y) < 60 && !p.inCar) {
        return advance();
      }
    }
  }
  return null;
}

function completeMission(game, def) {
  const m = game.mission;
  m.active = false;
  m.done.push(def.id);
  m.index++;
  game.cash += def.reward;
  game.audio.jingle();
  game.audio.cash();
  game.stats.missions++;
  game.save();
}

export function failMission(game, reason) {
  const m = game.mission;
  m.active = false;
  m.failed = reason;
  game.audio.fail();
  // Clean up mission cars.
  if (m.data.targetCar) m.data.targetCar.dead = true;
  return { type: 'failed', reason };
}

// Repeatable courier runs after the story: pick a random place, pay on arrival.
export function startSideJob(game) {
  const places = Object.values(game.city.places);
  const from = game.player;
  let target = places[Math.floor(Math.random() * places.length)];
  if (dist(from.x, from.y, target.x, target.y) < 600) {
    target = places[(places.indexOf(target) + 3) % places.length];
  }
  game.mission.sideJob = { target, pay: 150 + Math.floor(Math.random() * 250) };
  return game.mission.sideJob;
}

export function updateSideJob(game) {
  const job = game.mission.sideJob;
  if (!job) return null;
  const p = game.player;
  if (dist(p.x, p.y, job.target.x, job.target.y) < 90) {
    game.cash += job.pay;
    game.stats.jobs++;
    game.audio.cash();
    game.mission.sideJob = null;
    game.save();
    return { type: 'jobDone', pay: job.pay };
  }
  return null;
}

export function missionTitle(game) {
  const m = game.mission;
  if (m.active) return MISSIONS[m.index].title;
  if (m.index < MISSIONS.length) return MISSIONS[m.index].title;
  return 'King of the Bay';
}
