// Lässt den Spieler per Klick Feld für Feld zum Ziel laufen (Weg kommt aus findPath).
import { on } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { gridToWorld } from "../world/grid.js";
import { findPath } from "../world/pathfinding.js";

// Wie viele Felder der Spieler pro Sekunde läuft.
const TILES_PER_SECOND = 3;

let player = null;
let standOffset = 0;
let path = [];
let target = null;
let progress = 0;

// Meldet den Spieler für Klicks und beim Loop an (erst nach loadGrid und createPlayer aufrufen).
export function setupPlayerMovement(movingPlayer) {
  player = movingPlayer;
  standOffset = player.mesh.position.y - gridToWorld(player.x, player.z).y;
  on("tileClicked", onTileClicked);
  addUpdate(updateMovement);
}

// Sucht einen neuen Weg zum geklickten Feld (beim Laufen ab dem Feld, auf das er gerade zuläuft).
function onTileClicked(tile) {
  const from = target !== null ? target : { x: player.x, z: player.z };
  const newPath = findPath(from, tile);
  if (newPath === null) {
    return;
  }

  path = newPath;
  if (target === null) {
    startNextStep();
  }
}

// Nimmt das nächste Feld aus dem Weg als neues Ziel, oder bleibt stehen, wenn der Weg leer ist.
function startNextStep() {
  if (path.length === 0) {
    target = null;
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

// Stellt das Mesh an eine Position oben auf dem Feld.
function placeMesh(position) {
  player.mesh.position.copy(position);
  player.mesh.position.y += standOffset;
}

// Dreht den Spieler in Richtung des nächsten Feldes.
function turnTowards(tile) {
  player.mesh.rotation.y = Math.atan2(tile.x - player.x, tile.z - player.z);
}
