// Gegner in der Welt: aus enemies.json (Werte) und der Karte (Startfelder) bauen, platzieren und auswählen.
// Gegner sind Daten-Objekte wie der Spieler (stats, level, hp, x, z, mesh), damit die gleichen Formeln gelten.
import * as THREE from "three";
import ENEMY_TYPES from "../data/enemies.json";
import { emit, on } from "../core/eventBus.js";
import { gridToWorld, setOccupied } from "../world/grid.js";
import { getMaxHp } from "../character/character.js";

// Platzhalter-Formen je Gegner ("shape" in enemies.json): Mesh und wie hoch es über dem Feld sitzt
const SHAPES = {
  gust: { geometry: () => new THREE.SphereGeometry(0.3, 16, 12), height: 0.45 },
  wisp: { geometry: () => new THREE.SphereGeometry(0.18, 16, 12), height: 0.7 },
  crab: { geometry: () => new THREE.BoxGeometry(0.65, 0.25, 0.5), height: 0.125 },
};
// Pro Level über 1 steigen die Werte eines Gegners um diesen Anteil (Lv 2 = +30 %, Lv 3 = +60 %)
const STATS_PER_LEVEL = 0.3;

const enemies = [];
let selectedEnemy = null;

// Baut alle Gegner aus der Karten-Liste ([{ type, x, z, level }], level ist optional) und hängt ihre Meshes an die anklickbaren Teile.
export function createEnemies(scene, spawns, clickables) {
  for (const spawn of spawns ?? []) {
    const type = ENEMY_TYPES[spawn.type];
    if (type === undefined) {
      console.warn(`Unbekannter Gegner: "${spawn.type}"`);
      continue;
    }

    const shape = SHAPES[type.shape ?? "gust"];
    const mesh = new THREE.Mesh(shape.geometry(), new THREE.MeshStandardMaterial({ color: type.color }));
    mesh.castShadow = true;
    scene.add(mesh);

    const level = spawn.level ?? type.level;
    const enemy = {
      type: spawn.type,
      name: type.name,
      stats: scaleStats(type.stats, level),
      level: level,
      aggroRange: type.aggroRange,
      // 1 = Nahkampf (direkt daneben), mehr = Fernkampf aus so vielen Feldern
      attackRange: type.attackRange ?? 1,
      floatHeight: shape.height,
      attackPatterns: type.attackPatterns,
      respawnSeconds: type.respawnSeconds,
      home: { x: spawn.x, z: spawn.z },
      x: spawn.x,
      z: spawn.z,
      mesh: mesh,
      alive: true,
      respawnLeft: 0,
    };
    enemy.hp = getMaxHp(enemy);
    mesh.userData.enemy = enemy;
    placeEnemy(enemy, spawn.x, spawn.z);
    clickables.push(mesh);
    enemies.push(enemy);
  }

  // Linksklick auf einen Gegner wählt ihn aus, Klick auf ein Feld hebt die Auswahl auf
  on("enemyClicked", ({ enemy }) => selectEnemy(enemy));
  on("tileClicked", () => selectEnemy(null));
  return enemies;
}

// Gibt alle Gegner zurück (auch besiegte, die auf ihr Wiederkommen warten).
export function getEnemies() {
  return enemies;
}

// Wählt einen Gegner aus (null = keiner) und meldet "enemySelected".
function selectEnemy(enemy) {
  if (enemy === selectedEnemy) {
    return;
  }
  selectedEnemy = enemy;
  emit("enemySelected", { enemy });
}

// Stellt den Gegner auf ein Feld (Mesh schwebt darüber) und besetzt das Feld.
export function placeEnemy(enemy, x, z) {
  setOccupied(enemy.x, enemy.z, false);
  enemy.x = x;
  enemy.z = z;
  setOccupied(x, z, true);
  setEnemyMeshPosition(enemy, gridToWorld(x, z));
}

// Setzt nur das Mesh an eine Position (für die Lauf-Animation zwischen zwei Feldern).
export function setEnemyMeshPosition(enemy, position) {
  enemy.mesh.position.copy(position);
  enemy.mesh.position.y += enemy.floatHeight;
}

// Besiegt: unsichtbar, Feld frei, Wiederkommen in respawnSeconds.
export function removeEnemy(enemy) {
  enemy.alive = false;
  enemy.respawnLeft = enemy.respawnSeconds;
  enemy.mesh.visible = false;
  setOccupied(enemy.x, enemy.z, false);
  if (selectedEnemy === enemy) {
    selectEnemy(null);
  }
}

// Zurück aufs Startfeld mit vollen HP (nach dem Wiederkommen oder nach einer Flucht des Spielers).
export function resetEnemy(enemy) {
  enemy.alive = true;
  enemy.hp = getMaxHp(enemy);
  enemy.mesh.visible = true;
  placeEnemy(enemy, enemy.home.x, enemy.home.z);
  emit("hpChanged", { character: enemy });
}

// Werte für dieses Level: jeder Wert × (1 + STATS_PER_LEVEL × (Level − 1)), gerundet.
function scaleStats(stats, level) {
  const factor = 1 + STATS_PER_LEVEL * (level - 1);
  const scaled = {};
  for (const [stat, value] of Object.entries(stats)) {
    scaled[stat] = Math.round(value * factor);
  }
  return scaled;
}
