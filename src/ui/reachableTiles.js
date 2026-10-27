// Lässt im Kampf die Felder leuchten, die der Spieler in seinem Zug noch erreichen kann.
import * as THREE from "three";
import { on } from "../core/eventBus.js";
import { gridToWorld } from "../world/grid.js";
import { getReachableTiles } from "../combat/combat.js";

const MARKER_LIFT = 0.005;
const MARKER_COLOR = "#5ab4ff";

// Baut die Markierungen (wiederverwendet, je eine pro Feld) und zeichnet sie bei jeder Zug-Änderung neu.
export function createReachableTiles(scene) {
  const geometry = new THREE.PlaneGeometry(0.9, 0.9);
  const material = new THREE.MeshBasicMaterial({ color: MARKER_COLOR, transparent: true, opacity: 0.3, depthWrite: false });
  const markers = [];

  const update = () => {
    const tiles = getReachableTiles();
    // Fehlende Markierungen nachbauen
    while (markers.length < tiles.length) {
      const marker = new THREE.Mesh(geometry, material);
      marker.rotation.x = -Math.PI / 2;
      scene.add(marker);
      markers.push(marker);
    }
    markers.forEach((marker, i) => {
      marker.visible = i < tiles.length;
      if (marker.visible) {
        marker.position.copy(gridToWorld(tiles[i].x, tiles[i].z));
        marker.position.y += MARKER_LIFT;
      }
    });
  };

  for (const eventName of ["combatTurnUpdated", "turnStarted", "combatEnded"]) {
    on(eventName, update);
  }
}
