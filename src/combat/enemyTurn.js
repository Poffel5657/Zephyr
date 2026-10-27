// Gegner-Zug: KI (hinlaufen, Fernkämpfer weichen zurück) und Angriff mit Block-Timing für den Spieler.
import { emit } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { gridToWorld } from "../world/grid.js";
import { findPathToObject } from "../world/pathfinding.js";
import { getDodgeChance, takeDamage } from "../character/character.js";
import { setEnemyMeshPosition, placeEnemy } from "../enemies/enemies.js";
import { startRhythm, stopRhythm } from "./rhythm.js";
import { state, wait, faceTowards } from "./combatState.js";
import { BLOCK_DAMAGE, getDistance, isHigher, isInAttackRange, getScaledDamage, findRetreatStep } from "./combatRules.js";
import { endCombat } from "./combatEnd.js";

// Pausen im Gegner-Zug (Sekunden), damit man sieht, was passiert
const ENEMY_THINK_TIME = 0.4;
const ENEMY_AFTER_ACTION_TIME = 0.4;
// Gegner laufen genauso schnell wie der Spieler
const ENEMY_TILES_PER_SECOND = 3;

// Laufender Gegner-Schritt: { enemy, from, to, progress, resolve }
let enemyStep = null;

// Meldet die Lauf-Animation der Gegner am Spiel-Loop an (einmal beim Start).
export function setupEnemyTurns() {
  addUpdate(updateEnemyStep);
}

// Gegner-KI: Ist der Spieler in Reichweite, greift er an. Sonst läuft er hin, bis er in Reichweite ist.
// Fernkämpfer (attackRange > 1) weichen erst ein Feld zurück, wenn der Spieler direkt neben ihnen steht.
// onDone wird am Ende des Zuges aufgerufen (dann ist der Nächste dran).
export async function runEnemyTurn(enemy, onDone) {
  const { player } = state;
  state.combat.busy = true;
  await wait(ENEMY_THINK_TIME);
  if (state.combat === null) {
    return;
  }

  if (enemy.attackRange > 1 && getDistance(enemy, player) === 1) {
    const away = findRetreatStep(enemy, player);
    if (away !== null) {
      state.combat.moveLeft -= 1;
      await walkEnemyStep(enemy, away);
    }
  } else if (!isInAttackRange(enemy, player)) {
    const path = findPathToObject({ x: enemy.x, z: enemy.z }, { x: player.x, z: player.z });
    if (path !== null && path.length > 0) {
      const steps = path.slice(0, state.combat.moveLeft);
      for (const step of steps) {
        if (state.combat === null || isInAttackRange(enemy, player)) {
          break;
        }
        state.combat.moveLeft -= 1;
        await walkEnemyStep(enemy, step);
      }
    }
  }

  if (state.combat !== null && isInAttackRange(enemy, player)) {
    await enemyAttack(enemy);
    await wait(ENEMY_AFTER_ACTION_TIME);
  }
  if (state.combat !== null && state.combat.current === enemy) {
    onDone();
  }
}

// Angriff eines Gegners mit Block-Timing: Ein zufälliges Muster aus attackPatterns, jeder Takt ist ein Schlag.
// Perfekt geblockt = 0 Schaden, gut = halber Schaden (abgerundet), daneben = voller Schaden.
async function enemyAttack(enemy) {
  const { player } = state;
  state.combat.actionUsed = true;
  faceTowards(enemy, player);

  // Ausgewichen (AGI) = gar kein Schlag, kein Blocken nötig
  if (Math.random() < getDodgeChance(player)) {
    emit("attackResolved", { attacker: enemy, target: player, damage: 0, dodged: true });
    return;
  }

  const patterns = enemy.attackPatterns;
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  const highGround = isHigher(enemy, player);
  await startRhythm({
    pattern: pattern,
    target: player.mesh,
    stopAtMiss: false,
    onBeat: (index, result) => {
      const fullDamage = getScaledDamage(enemy, player, pattern[index].damage);
      const damage = BLOCK_DAMAGE[result](fullDamage);
      if (damage > 0) {
        takeDamage(player, damage);
      }
      emit("attackResolved", { attacker: enemy, target: player, damage, dodged: false, block: result, highGround });
      if (player.hp === 0) {
        stopRhythm();
      }
    },
  });

  if (state.combat !== null && player.hp === 0) {
    endCombat("defeat");
  }
}

// Lässt den Gegner ein Feld weiterlaufen (mit Animation) und wartet, bis er da ist.
function walkEnemyStep(enemy, to) {
  return new Promise((resolve) => {
    faceTowards(enemy, to);
    enemyStep = { enemy, from: { x: enemy.x, z: enemy.z }, to, progress: 0, resolve };
    // Das Zielfeld gleich besetzen, damit niemand anderes es nimmt
    placeEnemy(enemy, to.x, to.z);
    setEnemyMeshPosition(enemy, gridToWorld(enemyStep.from.x, enemyStep.from.z));
  });
}

// Bewegt das Gegner-Mesh weich zum nächsten Feld.
function updateEnemyStep(deltaTime) {
  if (enemyStep === null) {
    return;
  }
  enemyStep.progress = Math.min(1, enemyStep.progress + ENEMY_TILES_PER_SECOND * deltaTime);
  const from = gridToWorld(enemyStep.from.x, enemyStep.from.z);
  const to = gridToWorld(enemyStep.to.x, enemyStep.to.z);
  setEnemyMeshPosition(enemyStep.enemy, from.lerp(to, enemyStep.progress));
  if (enemyStep.progress === 1) {
    const { resolve } = enemyStep;
    enemyStep = null;
    resolve();
  }
}
