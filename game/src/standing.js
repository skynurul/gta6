// standing.js — district standing: one reputation score per district, from
// -100 (hated) to +100 (loved). Missions and race wins raise it, crimes and
// police heat lower it. Standing changes how fast the PD responds, which
// races are open, and who will join Juno's crew.
import { DISTRICTS } from './terrain3d.js';
import { clamp } from './util.js';

export class Standing {
  constructor() {
    this.scores = {};
    for (const d of DISTRICTS) this.scores[d.id] = 0;
  }

  get(id) {
    return this.scores[id] || 0;
  }

  // Returns the new score. Reason is shown in the toast.
  change(game, id, delta, reason) {
    const before = this.scores[id];
    this.scores[id] = clamp(before + delta, -100, 100);
    const d = DISTRICTS.find((x) => x.id === id);
    const name = d ? d.name : id;
    if (delta > 0) game.hud.toast(`${name} standing +${delta} — ${reason}`, 'good');
    else if (delta < 0) game.hud.toast(`${name} standing ${delta} — ${reason}`, 'bad');
    return this.scores[id];
  }

  // Police response multiplier: loved districts are slow to send cruisers.
  response(id) {
    return clamp(1 - this.get(id) / 250, 0.6, 1.4);
  }

  // Can Juno enter this district's race? The volcano climb wants respect.
  raceOpen(id, minStanding) {
    return this.get(id) >= (minStanding || 0);
  }

  // For the HUD: districts with scores, best first.
  list() {
    return DISTRICTS.map((d) => ({ ...d, score: this.get(d.id) }));
  }
}
