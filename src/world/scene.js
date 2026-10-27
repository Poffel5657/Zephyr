// Baut die 3D-Welt zusammen: Renderer, Licht, Insel und Kamera.
import * as THREE from "three";
import islandData from "../data/maps/start-island.json";
import { loadGrid } from "./grid.js";
import { buildIsland } from "./island.js";
import { setupLighting } from "./lighting.js";
import { camera, setupCamera, resizeCamera } from "./camera.js";
import { setupInput } from "../core/input.js";
import { createPlayer } from "../player/player.js";
import { createTileMarker } from "../ui/tileMarker.js";
import { setupPlayerMovement } from "../player/movement.js";
import { setupInventoryEvents } from "../inventory/inventory.js";
import { setupDebugKeys } from "../debug/debugKeys.js";
import { createInventoryPanel } from "../ui/inventoryPanel.js";
import { setupMessages } from "../ui/messages.js";

export const scene = new THREE.Scene();
export const renderer = new THREE.WebGLRenderer();
renderer.shadowMap.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

loadGrid(islandData);
setupLighting(scene);
const player = createPlayer(scene, 6, 6);
setupPlayerMovement(player);
setupDebugKeys(); // DEBUG: wieder entfernen, sobald Woodcutting Items gibt (Phase 5)
setupInventoryEvents(player.inventory);
createInventoryPanel(player.inventory);
setupMessages();
const clickables = buildIsland(scene);
setupCamera(renderer.domElement);
setupInput(camera, renderer.domElement, clickables);
createTileMarker(scene);

// Zeichnet ein Bild der Szene aus Sicht der Kamera.
export function renderWorld() {
  renderer.render(scene, camera);
}

// Passt Kamera und Zeichenfläche an, wenn sich die Fenstergröße ändert.
addEventListener("resize", () => {
  resizeCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
