// Kampf-Regeln ohne eigenen Zustand: Abstand, nebeneinander, Reichweite, Höhe und Schaden mit Faktoren.
import CHARACTER_DATA from "../data/characters.json";
import { getTile } from "../world/grid.js";
import { findPath, MAX_STEP_UP } from "../world/pathfinding.js";
import { getDamage } from "../character/character.js";

// Wer höher steht als sein Ziel, macht so viel mehr Schaden (0.25 = +25 %)
const HEIGHT_BONUS = CHARACTER_DATA.combat.heightBonus;

// Schaden nach Block-Ergebnis (bei 1 Schaden blockt "gut" also auch alles, erst bei größeren Zahlen gibt es einen Unterschied)
export const BLOCK_DAMAGE = {
  perfect: () => 0,
  good: (damage) => Math.floor(damage / 2),
  miss: (damage) => damage,
};

// Felder-Abstand (nur gerade Schritte).
export function getDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

// Direkt nebeneinander und höchstens eine Stufe Höhenunterschied (wie beim Laufen).
export function isAdjacent(a, b) {
  const heightA = getTile(a.x, a.z).height;
  const heightB = getTile(b.x, b.z).height;
  return getDistance(a, b) === 1 && Math.abs(heightA - heightB) <= MAX_STEP_UP;
}

// Steht a auf einem höheren Feld als b?
export function isHigher(a, b) {
  return getTile(a.x, a.z).height > getTile(b.x, b.z).height;
}

// Nahkampf: direkt daneben. Fernkampf (attackRange > 1): höchstens attackRange Felder entfernt.
export function isInAttackRange(enemy, target) {
  return enemy.attackRange > 1 ? getDistance(enemy, target) <= enemy.attackRange : isAdjacent(enemy, target);
}

// Ein Schlag mit diesem Anteil vom normalen Schaden (z. B. 0.5 für einen Zusatzschlag), mindestens 1.
// Von oben (Angreifer steht höher als das Ziel) gibt es den Höhen-Bonus.
export function getScaledDamage(attacker, target, factor) {
  const heightFactor = isHigher(attacker, target) ? 1 + HEIGHT_BONUS : 1;
  return Math.max(1, Math.round(getDamage(attacker) * factor * heightFactor));
}

// Ein Nachbarfeld, das weiter vom Ziel weg ist (zum Zurückweichen), oder null, wenn keins frei ist.
export function findRetreatStep(enemy, target) {
  let best = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const step = { x: enemy.x + dx, z: enemy.z + dz };
    const path = findPath({ x: enemy.x, z: enemy.z }, step);
    if (path !== null && path.length === 1 && getDistance(step, target) > getDistance(enemy, target)) {
      best = step;
    }
  }
  return best;
}
