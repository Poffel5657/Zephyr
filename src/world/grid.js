// Das Raster der Welt: merkt sich die geladene Map und beantwortet Fragen zu ihren Feldern.
import * as THREE from "three";
import TILE_TYPES from "../data/tileTypes.json";

export const TILE_SIZE = 1;
export const STEP_HEIGHT = 0.5;

let currentMap = null;
// Felder, auf denen gerade jemand steht (Gegner, im Kampf auch der Spieler): "x,z"
const occupiedTiles = new Set();

// Lädt eine Map, auf die sich ab jetzt alle Fragen beziehen.
export function loadGrid(mapData) {
  currentMap = mapData;
}

// Gibt Breite und Tiefe der Map zurück.
export function getGridSize() {
  return {
    width: currentMap.width,
    depth: currentMap.depth,
  };
}

// Prüft, ob x / z innerhalb der Map liegt.
export function isInside(x, z) {
  return x >= 0 && x < currentMap.width && z >= 0 && z < currentMap.depth;
}

// Gibt das Feld bei x / z zurück, oder null bei Luft oder außerhalb der Map.
export function getTile(x, z) {
  if (!isInside(x, z)) {
    return null;
  }
  return currentMap.tiles[z][x];
}

// Gibt die 3D-Position oben in der Mitte des Feldes zurück, oder null bei Luft.
export function gridToWorld(x, z) {
  const tile = getTile(x, z);
  if (tile === null) {
    return null;
  }

  return new THREE.Vector3(x * TILE_SIZE, tile.height * STEP_HEIGHT, z * TILE_SIZE);
}

// Markiert ein Feld als besetzt (true) oder wieder frei (false).
export function setOccupied(x, z, occupied) {
  if (occupied) {
    occupiedTiles.add(x + "," + z);
  } else {
    occupiedTiles.delete(x + "," + z);
  }
}

// Prüft, ob man auf das Feld bei x / z laufen kann (kein Wasser, keine Luft, kein Objekt oder Gegner im Weg).
export function isWalkable(x, z) {
  const tile = getTile(x, z);
  if (tile === null || tile.object || occupiedTiles.has(x + "," + z)) {
    return false;
  }
  return TILE_TYPES[tile.type].walkable;
}
