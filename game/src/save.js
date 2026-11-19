// save.js — Ember Isle saves to localStorage: cash, the story's place in the
// three arcs, district standing, the crew, and where Juno was standing.
// Loading restores the story exactly where it was left.
const KEY = 'emberisle.save.v1';

export function saveGame(game) {
  try {
    const data = {
      cash: game.cash,
      missionsDone: game.mission.done,
      nextArc: game.mission.arc,
      nextStage: game.mission.stage,
      standing: game.standing.scores,
      crew: game.crew.members.map((m) => ({ id: m.id, recruited: m.recruited })),
      x: Math.round(game.player.x),
      z: Math.round(game.player.z),
      health: Math.round(game.player.health),
      racesWon: game.stats.racesWon,
      stats: game.stats,
      time: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || !Array.isArray(data.missionsDone)) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Storage may be off; nothing to clear.
  }
}
