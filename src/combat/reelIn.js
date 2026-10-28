// Reel In (Fishing-Technik): zieht einen Gegner in gerader Linie Feld für Feld zum Spieler heran.
// Kostet keine Aktion, nur die Abklingzeit. Ein zu hohes Feld, Wasser, ein Objekt oder ein anderer Gegner stoppt ihn
// davor. Liegt auf dem Weg ein Loch (kein Feld oder Inselrand), fällt er ins Nichts: besiegt, aber ohne Loot.
import { emit } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { getTile, gridToWorld, isInside, isWalkable } from "../world/grid.js";
import { MAX_STEP_UP } from "../world/pathfinding.js";
import { placeEnemy, setEnemyMeshPosition } from "../enemies/enemies.js";
import { showMessage } from "../ui/messages.js";
import { startCooldown } from "./techniques.js";
import { state, emitTurnUpdated, faceTowards } from "./combatState.js";
import { getDistance } from "./combatRules.js";
import { defeatEnemy } from "./combatEnd.js";

// So schnell wird der Gegner herangezogen (Felder pro Sekunde)
const PULL_TILES_PER_SECOND = 8;
// So lange und so tief fällt ein Gegner ins Nichts
const FALL_TIME = 0.6;
const FALL_DEPTH = 6;

// Laufende Animation: { enemy, from, to, time, duration, fall, resolve } (null = keine)
let motion = null;

// Meldet die Animation am Spiel-Loop an (einmal beim Start).
export function setupReelIn() {
  addUpdate(updateMotion);
}

// Warum Reel In auf diesen Gegner gerade nicht geht (null = geht).
export function getReelInBlock(player, enemy, technique) {
  if (player.x !== enemy.x && player.z !== enemy.z) {
    return "Not in a straight line";
  }
  const distance = getDistance(player, enemy);
  if (distance > technique.range) {
    return "Too far away";
  }
  if (distance <= 1) {
    return "Already next to you";
  }
  return null;
}

// Berechnet den Zug: die Felder, über die der Gegner gezogen wird, und ob er am Ende in ein Loch fällt.
// Gibt { steps: [{ x, z }], fallAt: { x, z } | null } zurück.
export function planPull(player, enemy) {
  const dx = Math.sign(player.x - enemy.x);
  const dz = Math.sign(player.z - enemy.z);
  const steps = [];
  let current = { x: enemy.x, z: enemy.z };
  while (getDistance(current, player) > 1) {
    const next = { x: current.x + dx, z: current.z + dz };
    const tile = isInside(next.x, next.z) ? getTile(next.x, next.z) : null;
    if (tile === null) {
      return { steps, fallAt: next };
    }
    // Nach oben nur eine Stufe (wie beim Laufen), nach unten rutscht er jede Kante hinunter
    const climb = tile.height - getTile(current.x, current.z).height;
    if (!isWalkable(next.x, next.z) || climb > MAX_STEP_UP) {
      break;
    }
    steps.push(next);
    current = next;
  }
  return { steps, fallAt: null };
}

// Benutzt Reel In: Abklingzeit starten, heranziehen, ggf. fallen lassen. Die Aktion bleibt frei.
export async function reelIn(enemy, technique) {
  const { combat, player } = state;
  combat.busy = true;
  startCooldown(player, technique.id);
  faceTowards(player, enemy);
  emitTurnUpdated();

  const { steps, fallAt } = planPull(player, enemy);
  for (const step of steps) {
    await moveEnemy(enemy, step, false);
    if (state.combat === null) {
      return;
    }
    placeEnemy(enemy, step.x, step.z);
  }

  let xp = technique.xp;
  if (fallAt !== null) {
    await moveEnemy(enemy, fallAt, true);
    if (state.combat === null) {
      return;
    }
    showMessage(`${enemy.name} falls into the void!`, "combat");
    xp += technique.fallXp ?? 0;
  } else if (steps.length === 0) {
    showMessage(`${enemy.name} doesn't budge`);
  }
  emit("xpGained", { character: player, skill: technique.skill, amount: xp });
  emit("reelInEnded", { enemy, pulled: steps.length, fell: fallAt !== null });

  state.combat.busy = false;
  if (fallAt !== null) {
    defeatEnemy(enemy, { fell: true });
  }
  if (state.combat !== null) {
    emitTurnUpdated();
  }
}

// Bewegt das Mesh des Gegners zu einem Nachbarfeld. Beim Fallen geht es über das Loch und dann nach unten.
function moveEnemy(enemy, to, fall) {
  return new Promise((resolve) => {
    const from = { x: enemy.x, z: enemy.z };
    const duration = 1 / PULL_TILES_PER_SECOND + (fall ? FALL_TIME : 0);
    motion = { enemy, from, to, time: 0, duration, fall, resolve };
  });
}

// Animation pro Bild: gleiten, beim Fallen danach in die Tiefe.
function updateMotion(deltaTime) {
  if (motion === null) {
    return;
  }
  motion.time = Math.min(motion.duration, motion.time + deltaTime);
  const { enemy, from, to, fall } = motion;
  const slideTime = 1 / PULL_TILES_PER_SECOND;
  const slide = Math.min(1, motion.time / slideTime);

  const start = gridToWorld(from.x, from.z);
  // Über einem Loch gibt es kein Feld: gleiche Höhe wie vorher, nur x / z versetzt
  const end = fall ? start.clone().setX(start.x + (to.x - from.x)).setZ(start.z + (to.z - from.z)) : gridToWorld(to.x, to.z);
  const position = start.lerp(end, slide);
  if (fall && motion.time > slideTime) {
    const t = (motion.time - slideTime) / FALL_TIME;
    position.y -= FALL_DEPTH * t * t;
  }
  setEnemyMeshPosition(enemy, position);

  if (motion.time >= motion.duration) {
    const { resolve } = motion;
    motion = null;
    resolve();
  }
}
