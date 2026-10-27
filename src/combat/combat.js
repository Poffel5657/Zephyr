// Rundenbasierter Kampf direkt in der Welt: Start (Rechtsklick oder Aggro), Reihenfolge nach AGI,
// Züge mit Bewegung + einer Aktion, Angriffe als Rhythmus-Combos (eigene) bzw. mit Block-Timing (Gegner),
// Gegner-KI und das Ende (Sieg, Niederlage, Flucht).
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
import { tickCooldowns, startCooldown, getCooldown, hasTechnique, getTechnique } from "./techniques.js";
import { startRhythm, stopRhythm } from "./rhythm.js";

const FLEE_DISTANCE = CHARACTER_DATA.combat.fleeDistance;
// Pausen im Gegner-Zug (Sekunden), damit man sieht, was passiert
const ENEMY_THINK_TIME = 0.4;
const ENEMY_AFTER_ACTION_TIME = 0.4;
// Pause nach dem eigenen Angriff (sonst verschwindet ein besiegter Gegner ohne sichtbaren Treffer)
const AFTER_ATTACK_TIME = 0.4;
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
// Schaden nach Block-Ergebnis (bei 1 Schaden blockt "gut" also auch alles, erst bei größeren Zahlen gibt es einen Unterschied)
const BLOCK_DAMAGE = {
  perfect: () => 0,
  good: (damage) => Math.floor(damage / 2),
  miss: (damage) => damage,
};

// Gibt zurück, ob gerade gekämpft wird.
export function isInCombat() {
  return combat !== null;
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

// Gibt den Zustand für die Anzeige zurück: Reihenfolge, wer dran ist, Runde, übrige Felder, Aktion verbraucht.
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

// Benutzt eine Technik auf einen Gegner (aus dem Aktions-Menü): daneben → sofort,
// sonst erst hinlaufen, wenn die Felder in diesem Zug reichen.
export function useTechnique(techniqueId, enemy) {
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
    if (combat !== null && enemy.alive) {
      playerCombo(enemy, techniqueId);
    }
  });
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

  // Im Kampf: Links- oder Rechtsklick auf einen Gegner öffnet das Aktions-Menü, Klick auf ein Feld = laufen
  on("enemyClicked", ({ enemy }) => openActionMenu(enemy));
  on("attackIntent", ({ enemy }) => openActionMenu(enemy));
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
  tickCooldowns(fighter);
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

// Klick auf einen Gegner im eigenen Zug: Aktions-Menü öffnen ("actionMenuOpened", die Anzeige baut es).
function openActionMenu(enemy) {
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

// Angriff des Spielers: Ausweichen würfeln, erster Schlag trifft sicher. Hat die Technik ein Muster (Cleave),
// folgt eine Rhythmus-Combo, jeder getroffene Takt hängt einen Zusatzschlag an. Der normale Angriff hat keins.
async function playerCombo(enemy, techniqueId) {
  const technique = getTechnique(techniqueId);
  const pattern = technique.pattern;
  combat.actionUsed = true;
  combat.busy = true;
  startCooldown(player, technique.id);
  faceTowards(player, enemy);
  emitTurnUpdated();

  const hits = [];
  const hit = (factor, index) => {
    const damage = getScaledDamage(player, factor);
    takeDamage(enemy, damage);
    hits.push(damage);
    emit("attackResolved", { attacker: player, target: enemy, damage, dodged: false, technique: technique.id, hit: index });
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

  emit("comboEnded", { attacker: player, target: enemy, technique: technique.id, results, hits, dodged });
  if (combat === null) {
    return;
  }
  combat.busy = false;
  if (enemy.hp === 0) {
    defeatEnemy(enemy);
  }
  emitTurnUpdated();
}

// Gegner ist besiegt: verschwindet, und wenn keiner mehr steht, ist der Kampf gewonnen.
function defeatEnemy(enemy) {
  removeEnemy(enemy);
  emit("enemyDefeated", { enemy });
  if (combat.enemies.every((other) => !other.alive)) {
    endCombat("victory", enemy);
  }
}

// Angriff eines Gegners mit Block-Timing: Ein zufälliges Muster aus attackPatterns, jeder Takt ist ein Schlag.
// Perfekt geblockt = 0 Schaden, gut = halber Schaden (abgerundet), daneben = voller Schaden.
async function enemyAttack(enemy) {
  combat.actionUsed = true;
  faceTowards(enemy, player);

  // Ausgewichen (AGI) = gar kein Schlag, kein Blocken nötig
  if (Math.random() < getDodgeChance(player)) {
    emit("attackResolved", { attacker: enemy, target: player, damage: 0, dodged: true });
    return;
  }

  const patterns = enemy.attackPatterns;
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  await startRhythm({
    pattern: pattern,
    target: player.mesh,
    stopAtMiss: false,
    onBeat: (index, result) => {
      const fullDamage = getScaledDamage(enemy, pattern[index].damage);
      const damage = BLOCK_DAMAGE[result](fullDamage);
      if (damage > 0) {
        takeDamage(player, damage);
      }
      emit("attackResolved", { attacker: enemy, target: player, damage, dodged: false, block: result });
      if (player.hp === 0) {
        stopRhythm();
      }
    },
  });

  if (combat !== null && player.hp === 0) {
    endCombat("defeat");
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
    await enemyAttack(enemy);
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
  stopRhythm();
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

// Ein Schlag mit diesem Anteil vom normalen Schaden (z. B. 0.5 für einen Zusatzschlag), mindestens 1.
function getScaledDamage(attacker, factor) {
  return Math.max(1, Math.round(getDamage(attacker) * factor));
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
