// Sucht mit A* den kürzesten Weg zwischen zwei Feldern (nur gerade Schritte, keine Diagonalen).
import { getTile, isWalkable } from "./grid.js";

// So viele Höhenstufen darf ein Schritt hoch oder runter gehen.
const MAX_STEP_UP = 1;
const DIRECTIONS = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];

// Gibt die Felder vom ersten Schritt bis zum Ziel zurück ([] wenn schon da, null wenn es keinen Weg gibt).
export function findPath(start, goal) {
  if (start.x === goal.x && start.z === goal.z) {
    return [];
  }
  if (!isWalkable(goal.x, goal.z)) {
    return null;
  }

  const openList = [{ x: start.x, z: start.z, g: 0, f: estimateDistance(start, goal) }];
  const cameFrom = new Map();
  const gScore = new Map();
  const closed = new Set();
  gScore.set(tileKey(start.x, start.z), 0);

  while (openList.length > 0) {
    const node = takeCheapest(openList);
    const key = tileKey(node.x, node.z);
    if (closed.has(key)) {
      continue;
    }
    if (node.x === goal.x && node.z === goal.z) {
      return buildPath(cameFrom, node);
    }
    closed.add(key);

    for (const direction of DIRECTIONS) {
      const nextX = node.x + direction.x;
      const nextZ = node.z + direction.z;
      const nextKey = tileKey(nextX, nextZ);
      if (closed.has(nextKey) || !canStep(node.x, node.z, nextX, nextZ)) {
        continue;
      }

      const newG = node.g + 1;
      if (gScore.has(nextKey) && newG >= gScore.get(nextKey)) {
        continue;
      }

      gScore.set(nextKey, newG);
      cameFrom.set(nextKey, { x: node.x, z: node.z });
      const f = newG + estimateDistance({ x: nextX, z: nextZ }, goal);
      openList.push({ x: nextX, z: nextZ, g: newG, f: f });
    }
  }

  return null;
}

// Sucht den kürzesten Weg zu einem Nachbarfeld des Objekts bei x / z (null, wenn keins erreichbar ist).
export function findPathToObject(start, objectTile) {
  const objectHeight = getTile(objectTile.x, objectTile.z).height;
  let bestPath = null;

  for (const direction of DIRECTIONS) {
    const standX = objectTile.x + direction.x;
    const standZ = objectTile.z + direction.z;
    const standTile = getTile(standX, standZ);
    // Nur von Feldern aus, die höchstens eine Stufe höher oder tiefer liegen (nicht von unter einer Klippe)
    if (standTile === null || Math.abs(standTile.height - objectHeight) > MAX_STEP_UP) {
      continue;
    }

    const path = findPath(start, { x: standX, z: standZ });
    if (path !== null && (bestPath === null || path.length < bestPath.length)) {
      bestPath = path;
    }
  }

  return bestPath;
}

// Macht aus x / z einen Text-Schlüssel für Map und Set.
function tileKey(x, z) {
  return `${x},${z}`;
}

// Schätzt die restlichen Schritte bis zum Ziel (Manhattan-Abstand).
function estimateDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

// Nimmt das Feld mit dem kleinsten f-Wert aus der Liste und gibt es zurück.
function takeCheapest(openList) {
  let cheapestIndex = 0;
  for (let i = 1; i < openList.length; i++) {
    if (openList[i].f < openList[cheapestIndex].f) {
      cheapestIndex = i;
    }
  }
  return openList.splice(cheapestIndex, 1)[0];
}

// Prüft, ob man von einem Feld auf das Nachbarfeld gehen kann (begehbar und nicht zu steil).
function canStep(fromX, fromZ, toX, toZ) {
  if (!isWalkable(toX, toZ)) {
    return false;
  }

  const from = getTile(fromX, fromZ);
  const to = getTile(toX, toZ);
  if (from === null) {
    return true;
  }
  return Math.abs(to.height - from.height) <= MAX_STEP_UP;
}

// Läuft vom Ziel über cameFrom zurück zum Start und gibt den Weg ohne das Startfeld zurück.
function buildPath(cameFrom, goalNode) {
  const path = [];
  let current = { x: goalNode.x, z: goalNode.z };
  while (cameFrom.has(tileKey(current.x, current.z))) {
    path.unshift(current);
    current = cameFrom.get(tileKey(current.x, current.z));
  }
  return path;
}
