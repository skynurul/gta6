// missions.js — Ember Isle's story: three arcs, three stages each, plus
// repeatable courier runs when the story is done. Steps are small and
// checkable: go somewhere, steal a car, collect crates, chase a courier,
// win a race. Each stage has its own intro and outro.
import { PLACES, COASTAL_WAYPOINTS, CLIMB_WAYPOINTS, terrainHeight, districtFor } from './terrain3d.js';
import { createCar, steerCarToward, driveCar, syncCarMesh } from './vehicles3d.js';
import { addHeat } from './police.js';
import { dist } from './util.js';

export const ARCS = [
  {
    id: 'crown', title: 'Cinder Crown', district: 'sands',
    intro: 'Juno came home to race. The Coastal Ring decides who owns Ember Isle after dark.',
    stages: [
      {
        title: 'First Heat', brief: 'Win or place in the Coastal Ring Sprint.',
        reward: 400,
        intro: 'Mara: "The ring is fast and the locals are faster. Show them you are home."',
        outro: 'The crowd at Palma Sands chants Juno\'s name. The crown is in play.',
        steps: [
          { type: 'enterCar', label: 'Get in a car' },
          { type: 'goto', x: PLACES.raceCoastal.x, z: PLACES.raceCoastal.z, radius: 60, label: 'Reach the Coastal Ring start' },
          { type: 'race', route: 'coastal', needWin: false, label: 'Race the Coastal Ring (press R at the start)' },
        ],
      },
      {
        title: 'Coastal Ring', brief: 'Win the Coastal Ring Sprint outright.',
        reward: 700,
        intro: 'Vex holds the ring record. Beat him and the whole island will know.',
        outro: 'Vex shakes Juno\'s hand. "You are the real thing, Reyes."',
        steps: [
          { type: 'goto', x: PLACES.raceCoastal.x, z: PLACES.raceCoastal.z, radius: 60, label: 'Reach the Coastal Ring start' },
          { type: 'race', route: 'coastal', needWin: true, label: 'Win the Coastal Ring (press R at the start)' },
        ],
      },
      {
        title: 'King of the Climb', brief: 'Win the Volcano Climb Circuit.',
        reward: 1000,
        intro: 'The climb sorts the brave from the fast. Mount Cinder wants 10 standing before it lets you run.',
        outro: 'Juno Reyes, King of the Climb. The volcano itself seems to approve.',
        steps: [
          { type: 'goto', x: PLACES.raceClimb.x, z: PLACES.raceClimb.z, radius: 60, label: 'Reach the Volcano Climb start' },
          { type: 'race', route: 'climb', needWin: true, label: 'Win the Volcano Climb (press R at the start)' },
        ],
      },
    ],
  },
  {
    id: 'harbor', title: 'Ash Harbor', district: 'ash',
    intro: 'The docks of Port Ash answer to a rival crew. Juno is going to take them back.',
    stages: [
      {
        title: 'Hot Wheels', brief: 'Steal the Cinder GT at the docks and deliver it to the Slagworks garage.',
        reward: 600,
        intro: 'Dario: "There is a Cinder GT sitting on the docks, keys in it. Take it home."',
        outro: 'The GT purrs in the garage. The docks crew knows someone new is in town.',
        steps: [
          { type: 'goto', x: PLACES.docks.x, z: PLACES.docks.z, radius: 80, label: 'Reach the Port Ash docks' },
          { type: 'stealCar', model: 'gt', x: 3120, z: 1420, label: 'Steal the Cinder GT' },
          { type: 'goto', x: PLACES.garage.x, z: PLACES.garage.z, radius: 50, label: 'Deliver the GT to the Slagworks garage' },
        ],
      },
      {
        title: 'Crate Run', brief: 'Collect 3 crates on the docks on foot.',
        reward: 900,
        intro: 'Three crates of "machine parts" need legs, not wheels. Walk in, walk out.',
        outro: 'The crates are stashed. The harbor crew is starting to talk about Juno.',
        steps: [
          { type: 'goto', x: PLACES.docks.x, z: PLACES.docks.z, radius: 80, label: 'Reach the Port Ash docks' },
          {
            type: 'collect', count: 3, label: 'Collect the dock crates (walk over them)',
            points: [
              { x: 3080, z: 1000 }, { x: 3160, z: 1500 }, { x: 3100, z: 2000 },
            ],
          },
        ],
      },
      {
        title: 'The Courier', brief: 'Stop the rival courier, take the case, deliver it to the safehouse.',
        reward: 1500,
        intro: 'A rival courier is running the harbor loop with the week\'s take. Ram him, or shoot his car to a stop.',
        outro: 'The case is Juno\'s. Port Ash belongs to the crew now.',
        steps: [
          { type: 'chase', label: 'Stop the courier (ram or shoot his car)' },
          { type: 'collect', count: 1, label: 'Grab the case from the stopped courier', points: [] },
          { type: 'goto', x: PLACES.safehouse.x, z: PLACES.safehouse.z, radius: 50, label: 'Deliver the case to the safehouse' },
        ],
      },
    ],
  },
  {
    id: 'fire', title: 'Fire in the Mountain', district: 'cinder',
    intro: 'The volcano job: one last run up Mount Cinder, and the island is Juno\'s.',
    stages: [
      {
        title: 'The Ascent', brief: 'Deliver the package to the volcano base.',
        reward: 900,
        intro: 'Ilya: "The package goes to the base camp. The PD knows the road. Keep it under two stars."',
        outro: 'Package delivered. The mountain road is Juno\'s now.',
        steps: [
          { type: 'enterCar', label: 'Get in a car' },
          { type: 'goto', x: PLACES.volcanoBase.x, z: PLACES.volcanoBase.z, radius: 60, label: 'Reach the volcano base' },
        ],
      },
      {
        title: 'Ember Harvest', brief: 'Collect 4 ember crates on the volcano slopes, on foot. Mind the lava.',
        reward: 1200,
        intro: 'Ember crates glow on the slopes. They are worth a fortune — and the lava is not a joke.',
        outro: 'Four crates, no burns. The crew is rich and Juno is legend.',
        steps: [
          { type: 'goto', x: PLACES.emberField.x, z: PLACES.emberField.z, radius: 90, label: 'Reach the Ember Field' },
          {
            type: 'collect', count: 4, label: 'Collect the ember crates (walk over them)',
            points: [
              { x: 1480, z: 620 }, { x: 1840, z: 540 }, { x: 1560, z: 780 }, { x: 1920, z: 700 },
            ],
          },
        ],
      },
      {
        title: 'Summit Run', brief: 'Stop the rival runner on the climb road, take the case, deliver it to the summit.',
        reward: 2500,
        intro: 'The rival crew is running the climb with the summit case. Stop them on the mountain, take it to the top.',
        outro: 'Juno stands at the Summit Overlook, case in hand, the whole island below. Ember Isle is hers.',
        steps: [
          { type: 'chase', route: 'climb', label: 'Stop the runner on the climb road' },
          { type: 'collect', count: 1, label: 'Grab the case from the stopped runner', points: [] },
          { type: 'goto', x: PLACES.summit.x, z: PLACES.summit.z, radius: 50, label: 'Deliver the case to the Summit Overlook' },
        ],
      },
    ],
  },
];

export function createMission() {
  return {
    arc: 0,
    stage: 0,
    step: 0,
    done: [],
    active: false,
    target: null,
    courier: null,
    collectPoints: [],
    collected: 0,
    sideJob: null,
    storyDone: false,
  };
}

export function currentStageDef(m) {
  if (m.arc >= ARCS.length) return null;
  return ARCS[m.arc].stages[m.stage];
}

export function currentStepDef(m) {
  const stage = currentStageDef(m);
  if (!stage) return null;
  return stage.steps[m.step];
}

export function missionTitle(m) {
  const stage = currentStageDef(m);
  if (!stage) return m.sideJob ? 'Courier Run' : 'Free Roam';
  return `${ARCS[m.arc].title} — ${stage.title} (${m.stage + 1}/3)`;
}

export function startNext(game) {
  const m = game.mission;
  if (m.active) {
    game.hud.toast('A mission is already running', 'bad');
    return;
  }
  if (m.storyDone) {
    startSideJob(game);
    return;
  }
  const stage = currentStageDef(m);
  if (!stage) return;
  m.active = true;
  m.step = 0;
  m.collected = 0;
  m.collectPoints = [];
  const arc = ARCS[m.arc];
  game.hud.showStory(`${arc.title} — ${stage.title}`, stage.intro);
  game.audio.jingle();
  setupStep(game);
}

function setupStep(game) {
  const m = game.mission;
  const step = currentStepDef(m);
  if (!step) return;
  m.target = null;
  if (step.type === 'goto') {
    m.target = { x: step.x, z: step.z, label: step.label };
  } else if (step.type === 'collect') {
    m.collectPoints = (step.points || []).map((p) => ({ ...p, taken: false }));
    m.collected = 0;
    m.target = m.collectPoints[0]
      ? { x: m.collectPoints[0].x, z: m.collectPoints[0].z, label: step.label }
      : null;
  } else if (step.type === 'stealCar') {
    const car = createCar(step.model, step.x, step.z, 0.6, { stealTarget: true, parked: true });
    game.scene.add(car.mesh);
    game.cars.push(car);
    m.target = { x: step.x, z: step.z, label: step.label };
  } else if (step.type === 'chase') {
    spawnCourier(game, step.route === 'climb' ? CLIMB_WAYPOINTS : COASTAL_WAYPOINTS);
    m.target = { x: m.courier.x, z: m.courier.z, label: step.label, follow: true };
  } else if (step.type === 'race') {
    const start = step.route === 'climb' ? PLACES.raceClimb : PLACES.raceCoastal;
    m.target = { x: start.x, z: start.z, label: step.label };
  }
}

function spawnCourier(game, waypoints) {
  const m = game.mission;
  const start = waypoints[0];
  const courier = createCar('coupe', start.x, start.z, 0, { courier: true });
  courier.hp = 100;
  courier.waypoints = waypoints;
  courier.wp = 1;
  courier.stopped = false;
  game.scene.add(courier.mesh);
  game.cars.push(courier);
  m.courier = courier;
}

function removeCourier(game) {
  const m = game.mission;
  if (!m.courier) return;
  game.scene.remove(m.courier.mesh);
  const i = game.cars.indexOf(m.courier);
  if (i >= 0) game.cars.splice(i, 1);
  m.courier = null;
}

function completeStep(game) {
  const m = game.mission;
  m.step++;
  const stage = currentStageDef(m);
  if (m.step >= stage.steps.length) {
    completeStage(game);
    return;
  }
  setupStep(game);
}

function completeStage(game) {
  const m = game.mission;
  const stage = currentStageDef(m);
  const arc = ARCS[m.arc];
  game.cash += stage.reward;
  game.standing.change(game, arc.district, 15, `${stage.title} complete`);
  game.stats.missionsDone++;
  m.done.push(`${arc.id}:${m.stage}`);
  game.hud.showStory('Job Done', `${stage.outro} (+$${stage.reward})`);
  game.audio.jingle();
  m.active = false;
  m.target = null;
  removeCourier(game);
  m.stage++;
  if (m.stage >= arc.stages.length) {
    m.stage = 0;
    m.arc++;
    if (m.arc >= ARCS.length) {
      m.storyDone = true;
      game.hud.toast('Story complete — courier runs and races pay out in free roam', 'good');
    }
  }
  game.save();
}

function failStage(game, reason) {
  const m = game.mission;
  game.hud.showStory('Job Failed', reason);
  game.audio.fail();
  m.active = false;
  m.target = null;
  removeCourier(game);
}

function startSideJob(game) {
  const m = game.mission;
  const spots = [PLACES.docks, PLACES.marina, PLACES.garage, PLACES.safehouse, PLACES.volcanoBase];
  const a = spots[Math.floor(Math.random() * spots.length)];
  let b = spots[Math.floor(Math.random() * spots.length)];
  if (b === a) b = PLACES.safehouse;
  m.sideJob = { from: a, to: b, step: 0, reward: 200 + Math.floor(Math.random() * 150) };
  m.active = true;
  m.target = { x: a.x, z: a.z, label: `Pick up the package at ${a.name}` };
  game.hud.toast(`Courier run: ${a.name} → ${b.name} ($${m.sideJob.reward})`, 'good');
}

export function onEnterCar(game, car) {
  const m = game.mission;
  if (!m.active) return;
  const step = currentStepDef(m);
  if (!step) return;
  if (step.type === 'enterCar') {
    completeStep(game);
    return;
  }
  if (step.type === 'stealCar' && car.stealTarget) {
    game.police.lastCrime = game.time;
    addHeat(game, 20, 'stolen car');
    game.standing.change(game, 'ash', -5, 'car stolen in Port Ash');
    game.hud.toast('Stolen! Get it to the garage', 'bad');
    completeStep(game);
  }
}

export function updateMission(game, dt) {
  const m = game.mission;
  if (!m.active) return;
  const p = game.player;

  // Side job: pick up, then deliver.
  if (m.sideJob) {
    const job = m.sideJob;
    const dest = job.step === 0 ? job.from : job.to;
    if (dist(p.x, p.z, dest.x, dest.z) < 45) {
      if (job.step === 0) {
        job.step = 1;
        m.target = { x: job.to.x, z: job.to.z, label: `Deliver to ${job.to.name}` };
        game.hud.toast('Package picked up', 'good');
        game.audio.pickup();
      } else {
        game.cash += job.reward;
        game.standing.change(game, districtFor(job.to.x, job.to.z).id, 3, 'courier run');
        game.hud.toast(`Courier run done (+$${job.reward})`, 'good');
        game.audio.cash();
        m.sideJob = null;
        m.active = false;
        m.target = null;
        game.save();
      }
    }
    return;
  }

  const step = currentStepDef(m);
  if (!step) return;

  // The courier drives his loop until he is stopped.
  if (step.type === 'chase' && m.courier) {
    const c = m.courier;
    if (!c.stopped) {
      const wp = c.waypoints[c.wp % c.waypoints.length];
      const ctl = steerCarToward(c, wp.x, wp.z, 260);
      driveCar(c, ctl, dt, game.island);
      syncCarMesh(c);
      if (dist(c.x, c.z, wp.x, wp.z) < 40) c.wp++;
      if (c.hp <= 0) {
        c.stopped = true;
        c.speed = 0;
        c.vx = 0;
        c.vz = 0;
        game.combat.spawnParticles(c.x, terrainHeight(c.x, c.z) + 3, c.z, 20, 50, 50);
        game.hud.toast('Courier stopped — grab the case', 'good');
        const stage = currentStageDef(m);
        const nextStep = stage.steps[m.step + 1];
        if (nextStep && nextStep.type === 'collect') {
          nextStep.points = [{ x: c.x + 10, z: c.z }];
        }
        completeStep(game);
      }
      m.target = { x: c.x, z: c.z, label: step.label, follow: true };
    }
    return;
  }

  if (step.type === 'goto') {
    if (dist(p.x, p.z, step.x, step.z) < step.radius) {
      game.audio.pickup();
      completeStep(game);
    }
    return;
  }

  if (step.type === 'collect') {
    // On-foot collection: walk over the points.
    if (game.car) return;
    for (const pt of m.collectPoints) {
      if (pt.taken) continue;
      if (dist(p.x, p.z, pt.x, pt.z) < 10) {
        pt.taken = true;
        m.collected++;
        game.audio.pickup();
        game.combat.spawnParticles(pt.x, terrainHeight(pt.x, pt.z) + 2, pt.z, 10, 30, 30);
        const left = m.collectPoints.filter((q) => !q.taken);
        m.target = left[0] ? { x: left[0].x, z: left[0].z, label: step.label } : null;
        if (m.collected >= step.count) {
          game.hud.toast('All collected', 'good');
          completeStep(game);
          return;
        }
      }
    }
    return;
  }

  if (step.type === 'race') {
    const res = game.race.lastResult;
    if (res && !res.consumed && res.route === step.route) {
      res.consumed = true;
      if (step.needWin && res.place > 1) {
        game.hud.toast(`Need 1st place (got ${res.place}) — run it again`, 'bad');
        return;
      }
      completeStep(game);
    }
    return;
  }
}

// Ramming or shooting the courier wears his car down.
export function damageCourier(game, amount) {
  const m = game.mission;
  if (!m.courier || m.courier.stopped) return;
  m.courier.hp -= amount;
  game.combat.spawnParticles(m.courier.x, terrainHeight(m.courier.x, m.courier.z) + 3, m.courier.z, 6, 40, 30);
}

// Busted or wasted mid-mission: the stage restarts from its first step.
export function resetMissionOnFail(game) {
  const m = game.mission;
  if (!m.active) return;
  removeCourier(game);
  m.active = false;
  m.target = null;
  m.sideJob = null;
  failStage(game, 'The job fell apart. Press J to run it again.');
}
