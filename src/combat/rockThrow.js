// Rock Throw (Mining-Technik): Liegt neben dem Spieler ein loser Felsbrocken ("rock" auf der Karte), wirft er ihn auf
// einen Gegner in gerader Linie bis "range" Felder weit. Kostet die Aktion. Der Brocken ist danach weg (das Feld wird
// frei) und liegt nach dem Kampf wieder da, sobald niemand mehr auf seinem Feld steht.
import * as THREE from "three";
import { emit, on } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { getTile, gridToWorld, isInside, isWalkable } from "../world/grid.js";
import { getDodgeChance, takeDamage } from "../character/character.js";
import { startCooldown } from "./techniques.js";
import { state, emitTurnUpdated, faceTowards, wait } from "./combatState.js";
import { getDistance, getScaledDamage } from "./combatRules.js";
import { defeatEnemy } from "./combatEnd.js";
import { logMessage } from "../ui/chatLog.js";

// Das Karten-Objekt, das man werfen kann
const BOULDER = "rock";
// So lange fliegt der Brocken und so hoch ist sein Bogen
const FLIGHT_TIME = 0.45;
const ARC_HEIGHT = 1.2;
const AFTER_THROW_TIME = 0.3;

// Geworfene Brocken, die noch zurückkommen: [{ x, z }]
const thrown = [];
// Fliegender Brocken: { mesh, from, to, time, resolve } (null = keiner)
let flight = null;

// Meldet Animation und das Zurücklegen der Brocken an (einmal beim Start).
export function setupRockThrow() {
  addUpdate(updateFlight);
  addUpdate(restoreBoulders);
  // Endet der Kampf mitten im Flug, den fliegenden Brocken wegräumen
  on("combatEnded", () => {
    flight?.scene.remove(flight.mesh);
    flight = null;
  });
}

// Gibt die Felder neben dem Charakter zurück, auf denen gerade ein Brocken liegt.
export function getBouldersNextTo(character) {
  const boulders = [];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = character.x + dx;
    const z = character.z + dz;
    if (isInside(x, z) && getTile(x, z)?.object === BOULDER) {
      boulders.push({ x, z });
    }
  }
  return boulders;
}

// Warum Rock Throw auf diesen Gegner gerade nicht geht (null = geht).
export function getRockThrowBlock(player, enemy, technique) {
  if (getBouldersNextTo(player).length === 0) {
    return "No boulder next to you";
  }
  if (player.x !== enemy.x && player.z !== enemy.z) {
    return "Not in a straight line";
  }
  if (getDistance(player, enemy) > technique.range) {
    return "Too far away";
  }
  return null;
}

// Wirft den Brocken: Aktion und Abklingzeit, Flug, Schaden (der Gegner kann ausweichen), XP.
export async function throwRock(enemy, technique) {
  const { combat, player } = state;
  const boulder = getBouldersNextTo(player)[0];
  combat.actionUsed = true;
  combat.busy = true;
  startCooldown(player, technique.id);
  faceTowards(player, enemy);
  emitTurnUpdated();

  // Der Brocken verlässt sein Feld: Objekt weg (Feld frei), Mesh versteckt
  delete getTile(boulder.x, boulder.z).object;
  thrown.push(boulder);
  emit("boulderThrown", boulder);
  await fly(player.mesh.parent, boulder, enemy);
  if (state.combat === null) {
    return;
  }

  const dodged = Math.random() < getDodgeChance(enemy);
  const damage = dodged ? 0 : getScaledDamage(player, enemy, technique.damage);
  if (!dodged) {
    takeDamage(enemy, damage);
  }
  emit("attackResolved", { attacker: player, target: enemy, damage, dodged, technique: technique.id, hit: 0 });
  if (!dodged) {
    logMessage(`${player.name}'s ${technique.name} hits ${enemy.name} for ${damage}`, "combat");
  }
  emit("xpGained", { character: player, skill: technique.skill, amount: technique.xp });
  await wait(AFTER_THROW_TIME);
  if (state.combat === null) {
    return;
  }
  state.combat.busy = false;
  if (enemy.hp === 0) {
    defeatEnemy(enemy);
  }
  if (state.combat !== null) {
    emitTurnUpdated();
  }
}

// Lässt einen Brocken in einem Bogen vom Feld des Brockens zum Gegner fliegen.
function fly(scene, from, enemy) {
  return new Promise((resolve) => {
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: "#7a8087" }));
    mesh.castShadow = true;
    scene.add(mesh);
    const start = gridToWorld(from.x, from.z);
    start.y += 0.3;
    const end = enemy.mesh.position.clone();
    flight = { scene, mesh, start, end, time: 0, resolve };
    updateFlight(0);
  });
}

// Animation pro Bild: gerade Linie plus Bogen nach oben, am Ziel verschwindet der Brocken.
function updateFlight(deltaTime) {
  if (flight === null) {
    return;
  }
  flight.time = Math.min(FLIGHT_TIME, flight.time + deltaTime);
  const t = flight.time / FLIGHT_TIME;
  flight.mesh.position.copy(flight.start).lerp(flight.end, t);
  flight.mesh.position.y += ARC_HEIGHT * 4 * t * (1 - t);
  flight.mesh.rotation.x += deltaTime * 8;
  if (t >= 1) {
    const { scene, mesh, resolve } = flight;
    flight = null;
    scene.remove(mesh);
    resolve();
  }
}

// Nach dem Kampf: Brocken zurücklegen, sobald ihr Feld frei ist (nicht, solange jemand darauf steht).
function restoreBoulders() {
  if (state.combat !== null) {
    return;
  }
  for (const boulder of [...thrown]) {
    const playerOnTile = state.player.x === boulder.x && state.player.z === boulder.z;
    if (!playerOnTile && isWalkable(boulder.x, boulder.z)) {
      getTile(boulder.x, boulder.z).object = BOULDER;
      thrown.splice(thrown.indexOf(boulder), 1);
      emit("boulderRestored", boulder);
    }
  }
}
