// Gegner in der Welt: aus enemies.json (Werte) und der Karte (Startfelder) bauen, platzieren und auswählen.
// Gegner sind Daten-Objekte wie der Spieler (stats, level, hp, x, z, mesh), damit die gleichen Formeln gelten.
import * as THREE from "three";
import ENEMY_TYPES from "../data/enemies.json";
import { emit, on } from "../core/eventBus.js";
import { gridToWorld, setOccupied } from "../world/grid.js";
import { getMaxHp } from "../character/character.js";

// Wie hoch die Kugel über dem Feld schwebt
const FLOAT_HEIGHT = 0.45;
const RADIUS = 0.3;

const enemies = [];
let selectedEnemy = null;

// Baut alle Gegner aus der Karten-Liste ([{ type, x, z }]) und hängt ihre Meshes an die anklickbaren Teile.
export function createEnemies(scene, spawns, clickables) {
  for (const spawn of spawns ?? []) {
    const type = ENEMY_TYPES[spawn.type];
    if (type === undefined) {
      console.warn(`Unbekannter Gegner: "${spawn.type}"`);
      continue;
    }

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 16, 12),
      new THREE.MeshStandardMaterial({ color: type.color }),
    );
    mesh.castShadow = true;
    scene.add(mesh);

    const enemy = {
      type: spawn.type,
      name: type.name,
      stats: { ...type.stats },
      level: type.level,
      aggroRange: type.aggroRange,
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

// Gibt den ausgewählten Gegner zurück (oder null).
export function getSelectedEnemy() {
  return selectedEnemy;
}

// Wählt einen Gegner aus (null = keiner) und meldet "enemySelected".
export function selectEnemy(enemy) {
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
  enemy.mesh.position.y += FLOAT_HEIGHT;
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
