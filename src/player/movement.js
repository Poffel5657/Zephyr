// Lässt den Spieler per Klick Feld für Feld zum Ziel laufen (Weg kommt aus findPath).
// Bei einem Objekt (z. B. Baum) oder Gegner (Rechtsklick) läuft er daneben und meldet "objectReached".
// Im Kampf läuft er nicht selbst los, sondern nur, wenn der Kampf walkPath aufruft.
import { emit, on } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { getTile, gridToWorld } from "../world/grid.js";
import { findPath, findPathToObject } from "../world/pathfinding.js";

// Wie viele Felder der Spieler pro Sekunde läuft.
const TILES_PER_SECOND = 3;

let player = null;
let standOffset = 0;
let path = [];
let target = null;
let progress = 0;
let targetObject = null;
let inCombat = false;
// Wird aufgerufen, wenn ein Weg aus walkPath zu Ende gelaufen ist
let onPathDone = null;

// Meldet den Spieler für Klicks und beim Loop an (erst nach loadGrid und createPlayer aufrufen).
export function setupPlayerMovement(movingPlayer) {
  player = movingPlayer;
  standOffset = player.mesh.position.y - gridToWorld(player.x, player.z).y;
  on("tileClicked", onTileClicked);
  on("attackIntent", onAttackIntent);
  // Kampfstart: den angefangenen Schritt noch zu Ende laufen, dann stehen bleiben
  on("combatStarted", () => {
    inCombat = true;
    path = [];
    targetObject = null;
  });
  on("combatEnded", () => {
    inCombat = false;
  });
  addUpdate(updateMovement);
}

// Gibt zurück, ob der Spieler gerade läuft.
export function isMoving() {
  return target !== null;
}

// Läuft einen fertigen Weg ab (für den Kampf) und ruft danach onDone auf.
export function walkPath(newPath, onDone) {
  path = [...newPath];
  onPathDone = onDone;
  if (target === null) {
    startNextStep();
  }
}

// Rechtsklick auf einen Gegner (außerhalb vom Kampf): daneben laufen, dann "objectReached" mit dem Gegner.
function onAttackIntent({ enemy }) {
  if (inCombat) {
    return;
  }
  const from = target !== null ? target : { x: player.x, z: player.z };
  const newPath = findPathToObject(from, { x: enemy.x, z: enemy.z });
  if (newPath === null) {
    return;
  }
  emit("actionCancelled", { character: player });
  targetObject = { x: enemy.x, z: enemy.z, object: "enemy", enemy: enemy };
  path = newPath;
  if (target === null) {
    startNextStep();
  }
}

// Sucht einen neuen Weg zum geklickten Feld (beim Laufen ab dem Feld, auf das er gerade zuläuft).
// Steht ein Objekt auf dem Feld, geht der Weg zum nächsten erreichbaren Nachbarfeld.
function onTileClicked(tile) {
  if (inCombat) {
    return;
  }
  const from = target !== null ? target : { x: player.x, z: player.z };
  const object = getTile(tile.x, tile.z).object;
  const newPath = object ? findPathToObject(from, tile) : findPath(from, tile);
  if (newPath === null) {
    return;
  }

  // Ein neuer Weg bricht ab, was der Spieler gerade macht (z. B. Fällen)
  emit("actionCancelled", { character: player });
  targetObject = object ? { x: tile.x, z: tile.z, object: object } : null;
  path = newPath;
  if (target === null) {
    startNextStep();
  }
}

// Nimmt das nächste Feld aus dem Weg als neues Ziel, oder bleibt stehen, wenn der Weg leer ist.
function startNextStep() {
  if (path.length === 0) {
    target = null;
    if (targetObject !== null) {
      reachObject();
    }
    if (onPathDone !== null) {
      const done = onPathDone;
      onPathDone = null;
      done();
    }
    return;
  }

  target = path.shift();
  progress = 0;
  turnTowards(target);
}

// Bewegt den Spieler jedes Bild ein Stück zum Ziel-Feld, samt Höhe beim Hoch- und Runterlaufen.
function updateMovement(deltaTime) {
  if (target === null) {
    return;
  }

  progress += TILES_PER_SECOND * deltaTime;
  if (progress >= 1) {
    player.x = target.x;
    player.z = target.z;
    placeMesh(gridToWorld(target.x, target.z));
    startNextStep();
    return;
  }

  const fromPosition = gridToWorld(player.x, player.z);
  const toPosition = gridToWorld(target.x, target.z);
  placeMesh(fromPosition.lerp(toPosition, progress));
}

// Dreht den Spieler zum Objekt und meldet, dass er davor steht.
function reachObject() {
  turnTowards(targetObject);
  emit("objectReached", {
    character: player,
    x: targetObject.x,
    z: targetObject.z,
    object: targetObject.object,
    enemy: targetObject.enemy,
  });
  targetObject = null;
}

// Stellt das Mesh an eine Position oben auf dem Feld.
function placeMesh(position) {
  player.mesh.position.copy(position);
  player.mesh.position.y += standOffset;
}

// Dreht den Spieler in Richtung eines Feldes (auch für den Kampf).
export function turnTowards(tile) {
  player.mesh.rotation.y = Math.atan2(tile.x - player.x, tile.z - player.z);
}
