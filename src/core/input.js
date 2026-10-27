// Macht aus Mausklicks und Mausbewegungen Feld-Events ("tileClicked", "tileHovered").
// Gegner: Linksklick = "enemyClicked" (auswählen), Rechtsklick oder lange drücken (Handy) = "attackIntent".
import * as THREE from "three";
import { emit } from "./eventBus.js";

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const MAX_CLICK_MOVE = 6;
// So lange muss man am Handy auf einen Gegner drücken, um anzugreifen
const LONG_PRESS_MS = 500;
const LEFT_BUTTON = 0;
const RIGHT_BUTTON = 2;

let camera = null;
let canvas = null;
let clickables = [];
let pressPosition = null;
let rightPressPosition = null;
let longPressTimer = null;
// true, wenn das lange Drücken schon angegriffen hat (dann kein Klick beim Loslassen)
let longPressDone = false;
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

// Merkt sich, wo gedrückt wurde. Am Handy startet das lange Drücken.
function onPointerDown(event) {
  if (event.button === RIGHT_BUTTON) {
    rightPressPosition = { x: event.clientX, y: event.clientY };
    return;
  }
  if (event.button !== LEFT_BUTTON) {
    return;
  }
  pressPosition = { x: event.clientX, y: event.clientY };
  longPressDone = false;

  if (event.pointerType === "touch") {
    const press = { clientX: event.clientX, clientY: event.clientY };
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      const hit = findHitAt(press);
      if (hit !== null && hit.enemy !== undefined) {
        longPressDone = true;
        emit("attackIntent", { enemy: hit.enemy });
      }
    }, LONG_PRESS_MS);
  }
}

// Beim Loslassen ohne Bewegung (also kein Kamera-Drehen): Links = Feld oder Gegner anklicken, Rechts = angreifen.
function onPointerUp(event) {
  if (event.button === RIGHT_BUTTON && rightPressPosition !== null) {
    const moved = Math.hypot(event.clientX - rightPressPosition.x, event.clientY - rightPressPosition.y);
    rightPressPosition = null;
    const hit = moved > MAX_CLICK_MOVE ? null : findHitAt(event);
    if (hit !== null && hit.enemy !== undefined) {
      emit("attackIntent", { enemy: hit.enemy });
    }
    return;
  }
  if (event.button !== LEFT_BUTTON || pressPosition === null) {
    return;
  }

  clearTimeout(longPressTimer);
  const moved = Math.hypot(event.clientX - pressPosition.x, event.clientY - pressPosition.y);
  pressPosition = null;
  if (moved > MAX_CLICK_MOVE || longPressDone) {
    return;
  }

  const hit = findHitAt(event);
  if (hit === null) {
    return;
  }
  if (hit.enemy !== undefined) {
    emit("enemyClicked", { enemy: hit.enemy });
  } else {
    emit("tileClicked", hit.tile);
  }
}

// Meldet "tileHovered", sobald die Maus über ein anderes Feld fährt (null = über keinem Feld).
function onPointerMove(event) {
  // Finger bewegt (Kamera drehen) → kein langes Drücken
  if (pressPosition !== null && Math.hypot(event.clientX - pressPosition.x, event.clientY - pressPosition.y) > MAX_CLICK_MOVE) {
    clearTimeout(longPressTimer);
  }

  const hit = findHitAt(event);
  const tile = hit === null ? null : hit.tile;
  const sameTile =
    tile !== null && hoveredTile !== null && tile.x === hoveredTile.x && tile.z === hoveredTile.z;

  if (sameTile || (tile === null && hoveredTile === null)) {
    return;
  }

  hoveredTile = tile;
  emit("tileHovered", tile);
}

// Schießt einen Strahl von der Kamera durch die Maus und gibt zurück, was getroffen wurde:
// { tile } bei einem Feld oder Objekt, { tile, enemy } bei einem Gegner, oder null.
function findHitAt(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(clickables, true);
  for (const hit of hits) {
    let object = hit.object;
    while (object !== null && object.userData.tile === undefined && object.userData.enemy === undefined) {
      object = object.parent;
    }
    if (object === null) {
      continue;
    }

    const enemy = object.userData.enemy;
    if (enemy === undefined) {
      return { tile: object.userData.tile };
    }
    // Der Strahl trifft auch unsichtbare Meshes: besiegte Gegner überspringen
    if (enemy.alive) {
      return { tile: { x: enemy.x, z: enemy.z }, enemy: enemy };
    }
  }
  return null;
}
