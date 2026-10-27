// Was der Spieler im eigenen Zug tun kann: laufen, angreifen (mit Rhythmus-Combo), springen, essen.
// Pro Zug Bewegung bis moveLeft Felder und eine Aktion.
import { emit } from "../core/eventBus.js";
import { setOccupied } from "../world/grid.js";
import { findPath, findPathToObject } from "../world/pathfinding.js";
import { getDodgeChance, takeDamage } from "../character/character.js";
import { walkPath, jumpTo } from "../player/movement.js";
import { showMessage } from "../ui/messages.js";
import { startCooldown, getCooldown, hasTechnique, getTechnique } from "./techniques.js";
import { startRhythm } from "./rhythm.js";
import { state, isPlayerTurn, emitTurnUpdated, wait, faceTowards } from "./combatState.js";
import { isAdjacent, isHigher, getScaledDamage } from "./combatRules.js";
import { defeatEnemy } from "./combatEnd.js";

// Pause nach dem eigenen Angriff (sonst verschwindet ein besiegter Gegner ohne sichtbaren Treffer)
const AFTER_ATTACK_TIME = 0.4;

// Benutzt eine Technik auf einen Gegner (aus dem Aktions-Menü): daneben → sofort,
// sonst erst hinlaufen, wenn die Felder in diesem Zug reichen.
export function useTechnique(techniqueId, enemy) {
  const { combat, player } = state;
  if (!isPlayerTurn() || !enemy.alive || !combat.enemies.includes(enemy)) {
    return;
  }
  if (combat.actionUsed) {
    showMessage("You already acted this turn");
    return;
  }
  if (!hasTechnique(player, techniqueId) || getCooldown(player, techniqueId) > 0) {
    return;
  }
  if (isAdjacent(player, enemy)) {
    playerCombo(enemy, techniqueId);
    return;
  }

  const path = findPathToObject({ x: player.x, z: player.z }, { x: enemy.x, z: enemy.z });
  if (path === null || path.length > combat.moveLeft) {
    showMessage("Too far away");
    return;
  }
  walkPlayer(path, () => {
    if (state.combat !== null && enemy.alive) {
      playerCombo(enemy, techniqueId);
    }
  });
}

// Prüft, ob der Charakter gerade essen darf (null = ja, sonst der Grund als Meldung). Für setupFood.
export function canEatInCombat(character) {
  if (state.combat === null) {
    return null;
  }
  if (character !== state.player || !isPlayerTurn()) {
    return "Wait for your turn";
  }
  if (state.combat.actionUsed) {
    return "You already acted this turn";
  }
  return null;
}

// Sprung im Kampf (Windriding): kostet moveCost Felder, Aktion bleibt frei. Gibt true zurück, wenn er startet.
export function playerJump(tile, moveCost, ability, onLanded) {
  const { combat, player } = state;
  if (!isPlayerTurn() || combat.moveLeft < moveCost) {
    return false;
  }
  combat.moveLeft -= moveCost;
  combat.busy = true;
  setOccupied(player.x, player.z, false);
  emitTurnUpdated();
  const started = jumpTo(tile, ability, () => {
    if (state.combat !== null) {
      setOccupied(player.x, player.z, true);
      state.combat.busy = false;
      emitTurnUpdated();
    }
    onLanded();
  });
  if (!started) {
    combat.moveLeft += moveCost;
    combat.busy = false;
    setOccupied(player.x, player.z, true);
    emitTurnUpdated();
  }
  return started;
}

// Spieler klickt im Kampf auf ein Feld: hinlaufen, wenn es in Reichweite ist.
export function playerMove(tile) {
  const { combat, player } = state;
  if (!isPlayerTurn()) {
    return;
  }
  const path = findPath({ x: player.x, z: player.z }, tile);
  if (path === null || path.length === 0) {
    return;
  }
  if (path.length > combat.moveLeft) {
    showMessage("Too far for this turn");
    return;
  }
  walkPlayer(path, () => {});
}

// Klick auf einen Gegner im eigenen Zug: Aktions-Menü öffnen ("actionMenuOpened", die Anzeige baut es).
export function openActionMenu(enemy) {
  const { combat } = state;
  if (!isPlayerTurn() || !enemy.alive || !combat.enemies.includes(enemy)) {
    return;
  }
  if (combat.actionUsed) {
    showMessage("You already acted this turn");
    return;
  }
  emit("actionMenuOpened", { enemy });
}

// Lässt den Spieler einen Weg im Kampf laufen und zieht die Felder ab.
function walkPlayer(path, onDone) {
  const { combat, player } = state;
  combat.moveLeft -= path.length;
  combat.busy = true;
  setOccupied(player.x, player.z, false);
  emitTurnUpdated();
  walkPath(path, () => {
    if (state.combat === null) {
      return;
    }
    setOccupied(player.x, player.z, true);
    state.combat.busy = false;
    emitTurnUpdated();
    onDone();
  });
}

// Angriff des Spielers: Ausweichen würfeln, erster Schlag trifft sicher. Hat die Technik ein Muster (Cleave),
// folgt eine Rhythmus-Combo, jeder getroffene Takt hängt einen Zusatzschlag an. Der normale Angriff hat keins.
async function playerCombo(enemy, techniqueId) {
  const { combat, player } = state;
  const technique = getTechnique(techniqueId);
  const pattern = technique.pattern;
  combat.actionUsed = true;
  combat.busy = true;
  startCooldown(player, technique.id);
  faceTowards(player, enemy);
  emitTurnUpdated();

  const hits = [];
  const highGround = isHigher(player, enemy);
  const hit = (factor, index) => {
    const damage = getScaledDamage(player, enemy, factor);
    takeDamage(enemy, damage);
    hits.push(damage);
    emit("attackResolved", { attacker: player, target: enemy, damage, dodged: false, technique: technique.id, hit: index, highGround });
  };

  // Ausweichen gilt für die ganze Combo
  const dodged = Math.random() < getDodgeChance(enemy);
  let results = [];
  if (dodged) {
    emit("attackResolved", { attacker: player, target: enemy, damage: 0, dodged: true, technique: technique.id, hit: 0 });
  } else {
    hit(technique.firstHit ?? 1, 0);
    // Die Combo läuft immer zu Ende, auch wenn schon der erste Schlag reicht (Zusatzschläge = Overkill).
    // Der Gegner verschwindet erst danach.
    if (pattern.length > 0) {
      results = await startRhythm({
        pattern: pattern,
        target: enemy.mesh,
        stopAtMiss: true,
        onBeat: (index, result) => {
          if (result !== "miss") {
            hit(pattern[index].damage, index + 1);
          }
        },
      });
    }
  }
  // Kurz warten, damit man den Treffer sieht, bevor der Gegner verschwindet
  await wait(AFTER_ATTACK_TIME);

  emit("comboEnded", { attacker: player, target: enemy, technique: technique.id, results, hits, dodged, highGround });
  if (state.combat === null) {
    return;
  }
  state.combat.busy = false;
  if (enemy.hp === 0) {
    defeatEnemy(enemy);
  }
  emitTurnUpdated();
}
