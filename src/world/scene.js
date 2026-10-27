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
import { setupDebugTools } from "../debug/debugTools.js";
import { createInventoryPanel } from "../ui/inventoryPanel.js";
import { createSkillsPanel } from "../ui/skillsPanel.js";
import { createCharacterPanel } from "../ui/characterPanel.js";
import { setupMessages } from "../ui/messages.js";
import { setupSkillEvents } from "../skills/skills.js";
import { setupTimingBar } from "../ui/timingBar.js";
import { setupWoodcutting } from "../skills/woodcutting.js";
import { setupCharacterEvents } from "../character/character.js";
import { setupFood } from "../items/food.js";
import { setupTechniqueEvents } from "../combat/techniques.js";
import { createEnemies } from "../enemies/enemies.js";
import { setupCombat, canEatInCombat } from "../combat/combat.js";
import { createReachableTiles } from "../ui/reachableTiles.js";
import { createCombatHud } from "../ui/combatHud.js";
import { createHpBars } from "../ui/hpBars.js";
import { setupRhythm } from "../combat/rhythm.js";
import { createActionMenu } from "../ui/actionMenu.js";
import { setupLoot } from "../items/lootBags.js";
import { setupWindriding } from "../skills/windriding.js";
import { createRidingMenu } from "../ui/ridingMenu.js";
import { setupChests } from "./chests.js";
import { setupCameraFollow } from "./cameraFollow.js";
import { loadGame, setupAutoSave } from "../save/save.js";
import { setupSaveIcon } from "../ui/saveIcon.js";
import { createMenu } from "../ui/menu.js";

export const scene = new THREE.Scene();
export const renderer = new THREE.WebGLRenderer();
renderer.shadowMap.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

loadGrid(islandData);
setupLighting(scene);
const player = createPlayer(scene, 6, 6);
setupPlayerMovement(player);
if (import.meta.env.DEV) {
  setupDebugTools(player);
}
setupInventoryEvents(player.inventory);
setupSkillEvents(player);
createInventoryPanel(player.inventory);
createSkillsPanel(player);
createCharacterPanel(player);
setupMessages();
setupCharacterEvents(player);
setupFood(player, canEatInCombat);
setupTechniqueEvents(player);
setupTimingBar();
setupWoodcutting(player);
const clickables = buildIsland(scene);
const enemies = createEnemies(scene, islandData.enemies, clickables);
setupCombat(player);
createReachableTiles(scene);
createCombatHud();
createHpBars(player, enemies, camera);
setupRhythm(camera);
createActionMenu(player, camera);
setupLoot(player, scene, clickables);
setupWindriding(player);
createRidingMenu(player, scene);
setupChests(player);
setupCamera(renderer.domElement);
setupInput(camera, renderer.domElement, clickables);
createTileMarker(scene);
setupSaveIcon();
createMenu(player);
// Laden erst, wenn Insel und Fenster stehen (Stümpfe und Fenster brauchen sie), danach automatisch speichern
loadGame(player);
// Nach dem Laden, damit die Kamera gleich an der gespeicherten Position steht
setupCameraFollow(player);
setupAutoSave(player);

// Zeichnet ein Bild der Szene aus Sicht der Kamera.
export function renderWorld() {
  renderer.render(scene, camera);
}

// Passt Kamera und Zeichenfläche an, wenn sich die Fenstergröße ändert.
addEventListener("resize", () => {
  resizeCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
