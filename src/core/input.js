// Macht aus Mausklicks und Mausbewegungen Feld-Events ("tileClicked", "tileHovered").
import * as THREE from "three";
import { emit } from "./eventBus.js";

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const MAX_CLICK_MOVE = 6;

let camera = null;
let canvas = null;
let clickables = [];
let pressPosition = null;
let hoveredTile = null;

// Richtet die Maus-Eingabe ein: Kamera, Zeichenfläche und die Liste der anklickbaren Objekte.
export function setupInput(activeCamera, drawingCanvas, clickableObjects) {
  camera = activeCamera;
  canvas = drawingCanvas;
  clickables = clickableObjects;

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
}

// Meldet "tileHovered" mit null, wenn die Maus das Spielfeld verlässt (z. B. aufs Inventar-Fenster).
function onPointerLeave() {
  if (hoveredTile !== null) {
    hoveredTile = null;
    emit("tileHovered", null);
  }
}

// Merkt sich, wo die linke Maustaste gedrückt wurde.
function onPointerDown(event) {
  if (event.button !== 0) {
    return;
  }
  pressPosition = { x: event.clientX, y: event.clientY };
}

// Meldet "tileClicked", wenn die Maus beim Loslassen kaum bewegt wurde (also kein Kamera-Drehen war).
function onPointerUp(event) {
  if (event.button !== 0 || pressPosition === null) {
    return;
  }

  const moved = Math.hypot(event.clientX - pressPosition.x, event.clientY - pressPosition.y);
  pressPosition = null;
  if (moved > MAX_CLICK_MOVE) {
    return;
  }

  const tile = findTileAt(event);
  if (tile !== null) {
    emit("tileClicked", tile);
  }
}

// Meldet "tileHovered", sobald die Maus über ein anderes Feld fährt (null = über keinem Feld).
function onPointerMove(event) {
  const tile = findTileAt(event);
  const sameTile =
    tile !== null && hoveredTile !== null && tile.x === hoveredTile.x && tile.z === hoveredTile.z;

  if (sameTile || (tile === null && hoveredTile === null)) {
    return;
  }

  hoveredTile = tile;
  emit("tileHovered", tile);
}

// Schießt einen Strahl von der Kamera durch die Maus und gibt das getroffene Feld zurück, oder null.
function findTileAt(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(clickables, true);
  if (hits.length === 0) {
    return null;
  }

  let object = hits[0].object;
  while (object !== null && object.userData.tile === undefined) {
    object = object.parent;
  }

  return object === null ? null : object.userData.tile;
}
