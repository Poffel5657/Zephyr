// Rundenbasierter Kampf direkt in der Welt: Start (Rechtsklick oder Aggro), Reihenfolge nach AGI,
// Runden und Züge, außerhalb vom Kampf Aggro und Wiederkommen besiegter Gegner.
// Die Teile stehen in eigenen Dateien: combatState (Zustand), combatRules (Regeln), playerActions (Spieler-Zug),
// enemyTurn (Gegner-Zug), combatEnd (Sieg, Niederlage, Flucht). Andere Module importieren nur diese Datei.
// Alles läuft über Events, damit UI, Speichern und Welt nur zuhören müssen.
import CHARACTER_DATA from "../data/characters.json";
import TECHNIQUES from "../data/techniques.json";
import { emit, on } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { setOccupied } from "../world/grid.js";
import { getMoveRange } from "../character/character.js";
import { isMoving } from "../player/movement.js";
import { getClickMode } from "../core/clickMode.js";
import { getEnemies, resetEnemy } from "../enemies/enemies.js";
import { showMessage } from "../ui/messages.js";
import { tickCooldowns, tickBuffs } from "./techniques.js";
import { state, isPlayerTurn, emitTurnUpdated, updateWaits } from "./combatState.js";
import { getDistance } from "./combatRules.js";
import { playerMove, openActionMenu } from "./playerActions.js";
import { runEnemyTurn, setupEnemyTurns } from "./enemyTurn.js";
import { setupReelIn } from "./reelIn.js";
import { setupRockThrow } from "./rockThrow.js";
import { endCombat } from "./combatEnd.js";

export { isInCombat, isPlayerTurn, getCombatState, getReachableTiles } from "./combatState.js";
export { useTechnique, canEatInCombat, playerJump, getTechniqueBlock } from "./playerActions.js";

const FLEE_DISTANCE = CHARACTER_DATA.combat.fleeDistance;
const QUICK_SNACK = TECHNIQUES.quick_snack;
// Gegner, die so nah beim auslösenden Gegner stehen, kämpfen mit (Gruppen)
const GROUP_RADIUS = 2;

// Meldet den Kampf für den Spieler an (nach createEnemies aufrufen).
export function setupCombat(character) {
  state.player = character;

  // Start: Rechtsklick auf einen Gegner → hingelaufen → Kampf
  on("objectReached", (data) => {
    if (data.character === character && data.object === "enemy" && data.enemy.alive && state.combat === null) {
      startCombat(data.enemy);
    }
  });

  // Im Kampf: Links- oder Rechtsklick auf einen Gegner öffnet das Aktions-Menü, Klick auf ein Feld = laufen
  on("enemyClicked", ({ enemy }) => openActionMenu(enemy));
  on("attackIntent", ({ enemy }) => openActionMenu(enemy));
  on("tileClicked", (tile) => {
    // Im Sprung-Modus gehört der Klick dem Sprung (Windriding)
    if (state.combat !== null && getClickMode() === null) {
      playerMove(tile);
    }
  });
  on("endTurnRequested", () => {
    if (isPlayerTurn()) {
      endPlayerTurn();
    }
  });
  // Essen im Kampf (Quick Snack) kostet die Aktion und gibt etwas Cooking-XP
  on("itemEaten", (data) => {
    if (state.combat !== null && data.character === character) {
      state.combat.actionUsed = true;
      emit("xpGained", { character, skill: QUICK_SNACK.skill, amount: QUICK_SNACK.xp });
      emitTurnUpdated();
    }
  });

  setupEnemyTurns();
  setupReelIn();
  setupRockThrow();
  addUpdate(updateCombat);
}

// Startet einen Kampf mit diesem Gegner und allen anderen, in deren Aggro-Reichweite der Spieler steht.
// Gruppen: Wer so nah beim auslösenden Gegner steht, kämpft auch mit.
function startCombat(triggerEnemy) {
  const { player } = state;
  const enemies = getEnemies().filter(
    (enemy) =>
      enemy.alive &&
      (enemy === triggerEnemy ||
        getDistance(player, enemy) <= enemy.aggroRange ||
        getDistance(triggerEnemy, enemy) <= GROUP_RADIUS),
  );
  state.combat = {
    enemies: enemies,
    order: [],
    turnIndex: -1,
    round: 0,
    current: null,
    moveLeft: 0,
    actionUsed: false,
    busy: false,
    // Erst loslegen, wenn der Spieler seinen angefangenen Schritt zu Ende gelaufen ist
    starting: true,
  };
  emit("actionCancelled", { character: player });
  emit("combatStarted", { player: player, enemies: enemies });
  showMessage(`${triggerEnemy.name} attacks!`, "combat");
}

// Läuft jedes Bild: Pausen, Kampfbeginn, außerhalb vom Kampf Aggro und Wiederkommen.
function updateCombat(deltaTime) {
  updateWaits(deltaTime);

  const { combat, player } = state;
  if (combat === null) {
    state.aggroCooldown = Math.max(0, state.aggroCooldown - deltaTime);
    checkAggro();
    updateRespawns(deltaTime);
    return;
  }
  if (combat.starting && !isMoving()) {
    combat.starting = false;
    setOccupied(player.x, player.z, true);
    startRound();
  }
}

// Kommt der Spieler einem Gegner zu nah, greift der an.
function checkAggro() {
  const { player } = state;
  // Nach einer Niederlage wird gleich neu geladen, bis dahin kein neuer Kampf
  if (player.hp <= 0 || state.aggroCooldown > 0) {
    return;
  }
  for (const enemy of getEnemies()) {
    if (enemy.alive && getDistance(player, enemy) <= enemy.aggroRange) {
      startCombat(enemy);
      return;
    }
  }
}

// Besiegte Gegner kommen nach respawnSeconds wieder (nur außerhalb vom Kampf, im Kampf ist die Welt eingefroren).
function updateRespawns(deltaTime) {
  const { player } = state;
  for (const enemy of getEnemies()) {
    if (enemy.alive) {
      continue;
    }
    enemy.respawnLeft -= deltaTime;
    // Nicht auf dem Spieler auftauchen
    const playerOnHome = player.x === enemy.home.x && player.z === enemy.home.z;
    if (enemy.respawnLeft <= 0 && !playerOnHome) {
      resetEnemy(enemy);
    }
  }
}

// Neue Runde: Reihenfolge nach AGI, bei Gleichstand Münzwurf.
function startRound() {
  const { combat, player } = state;
  combat.round += 1;
  const fighters = [player, ...combat.enemies.filter((enemy) => enemy.alive)];
  // Erst zufällig mischen, dann stabil nach AGI sortieren: Gleichstände bleiben zufällig (Münzwurf)
  const shuffled = fighters.map((fighter) => ({ fighter, coin: Math.random() }));
  shuffled.sort((a, b) => b.fighter.stats.agi - a.fighter.stats.agi || a.coin - b.coin);
  combat.order = shuffled.map(({ fighter }) => fighter);
  combat.turnIndex = -1;
  nextTurn();
}

// Gibt den Zug an den Nächsten in der Reihenfolge (besiegte werden übersprungen).
function nextTurn() {
  const { combat, player } = state;
  if (combat === null) {
    return;
  }
  do {
    combat.turnIndex += 1;
  } while (combat.turnIndex < combat.order.length && !isAlive(combat.order[combat.turnIndex]));

  if (combat.turnIndex >= combat.order.length) {
    startRound();
    return;
  }

  const fighter = combat.order[combat.turnIndex];
  combat.current = fighter;
  combat.moveLeft = getMoveRange(fighter);
  combat.actionUsed = false;
  combat.busy = false;
  tickCooldowns(fighter);
  tickBuffs(fighter);
  emit("turnStarted", { combatant: fighter, isPlayer: fighter === player, round: combat.round });
  emitTurnUpdated();

  if (fighter !== player) {
    // Fehler im Gegner-Zug sonst unsichtbar (async)
    runEnemyTurn(fighter, nextTurn).catch((error) => console.error("Fehler im Gegner-Zug:", error));
  }
}

// "End Turn": Ist der Spieler weit genug von allen Gegnern weg, ist er geflohen. Sonst ist der Nächste dran.
function endPlayerTurn() {
  const { combat, player } = state;
  const farAway = combat.enemies.every((enemy) => !enemy.alive || getDistance(player, enemy) >= FLEE_DISTANCE);
  if (farAway) {
    endCombat("fled");
    return;
  }
  nextTurn();
}

// Spieler lebt, solange er HP hat; Gegner, solange sie nicht besiegt sind.
function isAlive(fighter) {
  return fighter === state.player ? fighter.hp > 0 : fighter.alive;
}
