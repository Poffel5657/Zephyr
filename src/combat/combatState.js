// Gemeinsamer Zustand des Kampfs (wer kämpft, wer dran ist, laufende Pausen) und kleine Helfer dafür.
// Alle Kampf-Dateien lesen und ändern den Zustand nur über dieses Modul.
import { emit } from "../core/eventBus.js";
import { getGridSize } from "../world/grid.js";
import { findPath } from "../world/pathfinding.js";
import { turnTowards } from "../player/movement.js";
import { getDistance } from "./combatRules.js";

// player: der Spieler-Charakter
// combat: null = kein Kampf, sonst { enemies, order, turnIndex, round, current, moveLeft, actionUsed, busy, starting }
// aggroCooldown: Sekunden ohne Aggro (nach einer Flucht)
export const state = { player: null, combat: null, aggroCooldown: 0 };

// Wartende Pausen (laufen über den Spiel-Loop, nicht über setTimeout)
const waits = [];

// Gibt zurück, ob gerade gekämpft wird.
export function isInCombat() {
  return state.combat !== null;
}

// Gibt zurück, ob der Spieler gerade dran ist und nichts mehr läuft (dann darf er handeln).
export function isPlayerTurn() {
  const { combat, player } = state;
  return combat !== null && !combat.starting && combat.current === player && !combat.busy;
}

// Gibt den Zustand für die Anzeige zurück: Reihenfolge, wer dran ist, Runde, übrige Felder, Aktion verbraucht.
export function getCombatState() {
  const { combat } = state;
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

// Felder, die der Spieler in diesem Zug noch erreichen kann (leer, wenn er nicht dran ist).
export function getReachableTiles() {
  const { combat, player } = state;
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

// Meldet "combatTurnUpdated", damit die Anzeige (Felder, Knöpfe) neu zeichnet.
export function emitTurnUpdated() {
  // Nach dem Kampfende (z. B. Sieg mitten im eigenen Angriff) gibt es keinen Zug mehr
  if (state.combat === null) {
    return;
  }
  emit("combatTurnUpdated", getCombatState());
}

// Wartet so viele Sekunden Spielzeit.
export function wait(seconds) {
  return new Promise((resolve) => waits.push({ timeLeft: seconds, resolve }));
}

// Zählt die Pausen herunter (jedes Bild).
export function updateWaits(deltaTime) {
  for (let i = waits.length - 1; i >= 0; i--) {
    waits[i].timeLeft -= deltaTime;
    if (waits[i].timeLeft <= 0) {
      const { resolve } = waits.splice(i, 1)[0];
      resolve();
    }
  }
}

// Verwirft alle Pausen (nach dem Kampfende).
export function clearWaits() {
  waits.length = 0;
}

// Dreht Spieler oder Gegner zum Ziel.
export function faceTowards(fighter, target) {
  if (fighter === state.player) {
    turnTowards(target);
  } else {
    fighter.mesh.rotation.y = Math.atan2(target.x - fighter.x, target.z - fighter.z);
  }
}
