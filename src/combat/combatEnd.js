// Kampfende: besiegte Gegner entfernen und den Kampf mit "victory", "defeat" oder "fled" beenden.
import { emit } from "../core/eventBus.js";
import { setOccupied } from "../world/grid.js";
import { removeEnemy, resetEnemy } from "../enemies/enemies.js";
import { showMessage } from "../ui/messages.js";
import { stopRhythm } from "./rhythm.js";
import { state, clearWaits } from "./combatState.js";

// Nach einer Flucht so lange keine Aggro, damit der Gegner nicht sofort wieder angreift
const AGGRO_COOLDOWN_AFTER_FLEE = 5;

// Gegner ist besiegt: verschwindet, und wenn keiner mehr steht, ist der Kampf gewonnen.
// details kommt mit ins Event, z. B. { fell: true }, wenn er ins Nichts gefallen ist (dann ohne Loot).
export function defeatEnemy(enemy, details = {}) {
  removeEnemy(enemy);
  emit("enemyDefeated", { enemy, ...details });
  if (state.combat.enemies.every((other) => !other.alive)) {
    endCombat("victory", enemy);
  }
}

// Beendet den Kampf. Danach läuft die Welt weiter.
export function endCombat(result, lastEnemy = null) {
  const { player } = state;
  const enemies = state.combat.enemies;
  state.combat = null;
  stopRhythm();
  clearWaits();
  setOccupied(player.x, player.z, false);

  if (result === "fled") {
    // Überlebende Gegner gehen zurück auf ihr Startfeld und sind wieder heil
    for (const enemy of enemies) {
      if (enemy.alive) {
        resetEnemy(enemy);
      }
    }
    state.aggroCooldown = AGGRO_COOLDOWN_AFTER_FLEE;
    showMessage("You escaped", "combat");
  } else if (result === "victory") {
    showMessage(`You defeated ${lastEnemy.name}`, "combat");
  } else {
    showMessage("You were defeated", "warning");
  }
  emit("combatEnded", { result, player, enemies });
}
