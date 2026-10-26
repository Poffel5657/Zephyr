// Markiert das Feld unter der Maus mit einem flachen, halb durchsichtigen Quadrat.
import * as THREE from "three";
import { on } from "../core/eventBus.js";
import { gridToWorld, isWalkable } from "../world/grid.js";

const MARKER_LIFT = 0.01;
const WALKABLE_COLOR = "#ffffff";
const BLOCKED_COLOR = "#e03030";

// Baut die Markierung und lässt sie dem Feld unter der Maus folgen (rot, wenn man dort nicht laufen kann).
export function createTileMarker(scene) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.95),
    new THREE.MeshBasicMaterial({ color: WALKABLE_COLOR, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  scene.add(mesh);

  on("tileHovered", (tile) => {
    if (tile === null) {
      mesh.visible = false;
      return;
    }

    const position = gridToWorld(tile.x, tile.z);
    if (position === null) {
      mesh.visible = false;
      return;
    }

    mesh.position.copy(position);
    mesh.position.y += MARKER_LIFT;
    mesh.material.color.set(isWalkable(tile.x, tile.z) ? WALKABLE_COLOR : BLOCKED_COLOR);
    mesh.visible = true;
  });

  return mesh;
}
