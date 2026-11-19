// save.js — Solmar Bay saves to localStorage: cash, missions done, and where
// Leo was standing. Loading restores the story exactly where it was left.
const KEY = 'solmarbay.save.v1';

export function saveGame(game) {
  try {
    const data = {
      cash: game.cash,
      missionsDone: game.mission.done,
      nextMission: game.mission.index,
      x: Math.round(game.player.x),
      y: Math.round(game.player.y),
      health: Math.round(game.player.health),
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
