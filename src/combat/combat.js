// Rundenbasierter Kampf direkt in der Welt: Start (Rechtsklick oder Aggro), Reihenfolge nach AGI,
// Züge mit Bewegung + einer Aktion, Gegner-KI und das Ende (Sieg, Niederlage, Flucht).
// Alles läuft über Events, damit UI, Speichern und Welt nur zuhören müssen.
import CHARACTER_DATA from "../data/characters.json";
import { emit, on } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { getTile, gridToWorld, setOccupied, getGridSize } from "../world/grid.js";
import { findPath, findPathToObject, MAX_STEP_UP } from "../world/pathfinding.js";
import { getDamage, getDodgeChance, getMoveRange, takeDamage } from "../character/character.js";
import { isMoving, walkPath, turnTowards } from "../player/movement.js";
import { getEnemies, removeEnemy, resetEnemy, setEnemyMeshPosition, placeEnemy } from "../enemies/enemies.js";
import { showMessage } from "../ui/messages.js";

const FLEE_DISTANCE = CHARACTER_DATA.combat.fleeDistance;
// Pausen im Gegner-Zug (Sekunden), damit man sieht, was passiert
const ENEMY_THINK_TIME = 0.4;
const ENEMY_AFTER_ACTION_TIME = 0.4;
// Gegner laufen genauso schnell wie der Spieler
const ENEMY_TILES_PER_SECOND = 3;
// Nach einer Flucht so lange keine Aggro, damit der Gegner nicht sofort wieder angreift
const AGGRO_COOLDOWN_AFTER_FLEE = 5;

let player = null;
// null = kein Kampf. Sonst: { enemies, order, turnIndex, round, current, moveLeft, actionUsed, busy, starting }
let combat = null;
// Wartende Pausen (laufen über den Spiel-Loop, nicht über setTimeout)
const waits = [];
// Laufender Gegner-Schritt: { enemy, from, to, progress, resolve }
let enemyStep = null;
let aggroCooldown = 0;

// Gibt zurück, ob gerade gekämpft wird.
export function isInCombat() {
  return combat !== null;
}

// Gibt zurück, wer gerade dran ist (null außerhalb vom Kampf).
export function getCurrentCombatant() {
  return combat === null ? null : combat.current;
}

// Gibt zurück, ob der Spieler gerade dran ist und nichts mehr läuft (dann darf er handeln).
export function isPlayerTurn() {
  return combat !== null && !combat.starting && combat.current === player && !combat.busy;
}

// Felder, die der Spieler in diesem Zug noch erreichen kann (leer, wenn er nicht dran ist).
export function getReachableTiles() {
  if (!isPlayerTurn() || combat.moveLeft === 0) {
    return [];
  }
  const reachable = [];
  const size = getGridSize();
  for (let z = 0; z < size.depth; z++) {
    for (let x = 0; x < size.width; x++) {
      if (getDistance(player, { x, z }) > combat.moveLeft) {
        continue;
      }
      const path = findPath({ x: player.x, z: player.z }, { x, z });
      if (path !== null && path.length > 0 && path.length <= combat.moveLeft) {
        reachable.push({ x, z });
      }
    }
  }
  return reachable;
}

// Gibt den Zustand für die Anzeige zurück: Reihenfolge, Runde, freie Felder, Aktion verbraucht.
export function getCombatState() {
  if (combat === null) {
    return null;
  }
  return {
    order: combat.order,
    current: combat.current,
    round: combat.round,
    moveLeft: combat.moveLeft,
    actionUsed: combat.actionUsed,
  };
}

// Prüft, ob der Charakter gerade essen darf (null = ja, sonst der Grund als Meldung). Für setupFood.
export function canEatInCombat(character) {
  if (combat === null) {
    return null;
  }
  if (character !== player || !isPlayerTurn()) {
    return "Wait for your turn";
  }
  if (combat.actionUsed) {
    return "You already acted this turn";
  }
  return null;
}

// Meldet den Kampf für den Spieler an (nach createEnemies aufrufen).
export function setupCombat(character) {
  player = character;

  // Start: Rechtsklick auf einen Gegner → hingelaufen → Kampf
  on("objectReached", (data) => {
    if (data.character === player && data.object === "enemy" && data.enemy.alive && combat === null) {
      startCombat(data.enemy);
    }
  });

  // Im Kampf: Rechtsklick auf Gegner = angreifen, Klick auf Feld = laufen
  on("attackIntent", ({ enemy }) => {
    if (combat !== null) {
      playerAttack(enemy);
    }
  });
  on("tileClicked", (tile) => {
    if (combat !== null) {
      playerMove(tile);
    }
  });
  on("endTurnRequested", () => {
    if (isPlayerTurn()) {
      endPlayerTurn();
    }
  });
  on("itemEaten", (data) => {
    if (combat !== null && data.character === player) {
      combat.actionUsed = true;
      emitTurnUpdated();
    }
  });

  addUpdate(updateCombat);
}

// Startet einen Kampf mit diesem Gegner und allen anderen, in deren Aggro-Reichweite der Spieler steht.
function startCombat(triggerEnemy) {
  const enemies = getEnemies().filter(
    (enemy) => enemy.alive && (enemy === triggerEnemy || getDistance(player, enemy) <= enemy.aggroRange),
  );
  combat = {
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
  showMessage(`${triggerEnemy.name} attacks!`);
}

// Läuft jedes Bild: Pausen, Gegner-Schritte, Kampfbeginn, außerhalb vom Kampf Aggro und Wiederkommen.
function updateCombat(deltaTime) {
  for (let i = waits.length - 1; i >= 0; i--) {
    waits[i].timeLeft -= deltaTime;
    if (waits[i].timeLeft <= 0) {
      const { resolve } = waits.splice(i, 1)[0];
      resolve();
    }
  }
  updateEnemyStep(deltaTime);

  if (combat === null) {
    aggroCooldown = Math.max(0, aggroCooldown - deltaTime);
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
  // Nach einer Niederlage wird gleich neu geladen, bis dahin kein neuer Kampf
  if (player.hp <= 0 || aggroCooldown > 0) {
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
  emit("turnStarted", { combatant: fighter, isPlayer: fighter === player, round: combat.round });
  emitTurnUpdated();

  if (fighter !== player) {
    // Fehler im Gegner-Zug sonst unsichtbar (async)
    runEnemyTurn(fighter).catch((error) => console.error("Fehler im Gegner-Zug:", error));
  }
}

// Spieler klickt im Kampf auf ein Feld: hinlaufen, wenn es in Reichweite ist.
function playerMove(tile) {
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

// Spieler greift einen Gegner an: direkt, wenn er daneben steht, sonst erst hinlaufen (wenn die Felder reichen).
function playerAttack(enemy) {
  if (!isPlayerTurn() || !enemy.alive || !combat.enemies.includes(enemy)) {
    return;
  }
  if (combat.actionUsed) {
    showMessage("You already acted this turn");
    return;
  }
  if (isAdjacent(player, enemy)) {
    attack(player, enemy);
    return;
  }

  const path = findPathToObject({ x: player.x, z: player.z }, { x: enemy.x, z: enemy.z });
  if (path === null || path.length > combat.moveLeft) {
    showMessage("Too far away");
    return;
  }
  walkPlayer(path, () => {
    if (combat !== null && enemy.alive) {
      attack(player, enemy);
    }
  });
}

// Lässt den Spieler einen Weg im Kampf laufen und zieht die Felder ab.
function walkPlayer(path, onDone) {
  combat.moveLeft -= path.length;
  combat.busy = true;
  setOccupied(player.x, player.z, false);
  emitTurnUpdated();
  walkPath(path, () => {
    if (combat === null) {
      return;
    }
    setOccupied(player.x, player.z, true);
    combat.busy = false;
    emitTurnUpdated();
    onDone();
  });
}

// Ein Angriff: erst Ausweichen würfeln, dann Schaden. Meldet "attackResolved" und prüft, ob jemand besiegt ist.
function attack(attacker, target) {
  combat.actionUsed = true;
  faceTowards(attacker, target);

  const dodged = Math.random() < getDodgeChance(target);
  const damage = dodged ? 0 : getDamage(attacker);
  if (!dodged) {
    takeDamage(target, damage);
  }
  emit("attackResolved", { attacker, target, damage, dodged });
  emitTurnUpdated();

  if (target.hp > 0) {
    return;
  }
  if (target === player) {
    endCombat("defeat");
    return;
  }

  removeEnemy(target);
  emit("enemyDefeated", { enemy: target });
  if (combat.enemies.every((enemy) => !enemy.alive)) {
    endCombat("victory", target);
  }
}

// "End Turn": Ist der Spieler weit genug von allen Gegnern weg, ist er geflohen. Sonst ist der Nächste dran.
function endPlayerTurn() {
  const farAway = combat.enemies.every((enemy) => !enemy.alive || getDistance(player, enemy) >= FLEE_DISTANCE);
  if (farAway) {
    endCombat("fled");
    return;
  }
  nextTurn();
}

// Gegner-KI: Steht er neben dem Spieler, greift er an. Sonst läuft er so weit er kann hin und greift dann an.
async function runEnemyTurn(enemy) {
  combat.busy = true;
  await wait(ENEMY_THINK_TIME);
  if (combat === null) {
    return;
  }

  if (!isAdjacent(enemy, player)) {
    const path = findPathToObject({ x: enemy.x, z: enemy.z }, { x: player.x, z: player.z });
    if (path !== null && path.length > 0) {
      const steps = path.slice(0, combat.moveLeft);
      combat.moveLeft -= steps.length;
      for (const step of steps) {
        await walkEnemyStep(enemy, step);
      }
    }
  }

  if (combat !== null && isAdjacent(enemy, player)) {
    attack(enemy, player);
    await wait(ENEMY_AFTER_ACTION_TIME);
  }
  if (combat !== null && combat.current === enemy) {
    nextTurn();
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

// Beendet den Kampf: "victory", "defeat" oder "fled". Danach läuft die Welt weiter.
function endCombat(result, lastEnemy = null) {
  const enemies = combat.enemies;
  combat = null;
  waits.length = 0;
  setOccupied(player.x, player.z, false);

  if (result === "fled") {
    // Überlebende Gegner gehen zurück auf ihr Startfeld und sind wieder heil
    for (const enemy of enemies) {
      if (enemy.alive) {
        resetEnemy(enemy);
      }
    }
    aggroCooldown = AGGRO_COOLDOWN_AFTER_FLEE;
    showMessage("You escaped");
  } else if (result === "victory") {
    showMessage(`You defeated ${lastEnemy.name}`);
  } else {
    showMessage("You were defeated");
  }
  emit("combatEnded", { result, player, enemies });
}

// Wartet so viele Sekunden Spielzeit.
function wait(seconds) {
  return new Promise((resolve) => waits.push({ timeLeft: seconds, resolve }));
}

// Meldet "combatTurnUpdated", damit die Anzeige (Felder, Knöpfe) neu zeichnet.
function emitTurnUpdated() {
  emit("combatTurnUpdated", getCombatState());
}

// Dreht Spieler oder Gegner zum Ziel.
function faceTowards(fighter, target) {
  if (fighter === player) {
    turnTowards(target);
  } else {
    fighter.mesh.rotation.y = Math.atan2(target.x - fighter.x, target.z - fighter.z);
  }
}

// Felder-Abstand (nur gerade Schritte).
function getDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

// Direkt nebeneinander und höchstens eine Stufe Höhenunterschied (wie beim Laufen).
function isAdjacent(a, b) {
  const heightA = getTile(a.x, a.z).height;
  const heightB = getTile(b.x, b.z).height;
  return getDistance(a, b) === 1 && Math.abs(heightA - heightB) <= MAX_STEP_UP;
}

// Spieler lebt, solange er HP hat; Gegner, solange sie nicht besiegt sind.
function isAlive(fighter) {
  return fighter === player ? fighter.hp > 0 : fighter.alive;
}
