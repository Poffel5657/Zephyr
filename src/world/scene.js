// Baut das Spiel zusammen: Renderer, Welt, Spieler-Systeme, Kampf, Fenster, Eingabe und Spielstand.
// Die Reihenfolge der Abschnitte zählt an ein paar Stellen (siehe Kommentare).
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
import { setupFishingGame } from "../ui/fishingGame.js";
import { setupFishing } from "../skills/fishing.js";
import { setupCookingGame } from "../ui/cookingGame.js";
import { setupCooking } from "../skills/cooking.js";
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
import { createSidePanel } from "../ui/sidePanel.js";
import { createStatusBar } from "../ui/statusBar.js";
import { createChatLog } from "../ui/chatLog.js";

export const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer();
renderer.shadowMap.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---------- Welt ----------
loadGrid(islandData);
setupLighting(scene);
const player = createPlayer(scene, 6, 6);
// Alles Anklickbare (Felder, Objekte, Gegner, Beutel) landet in dieser Liste
const clickables = buildIsland(scene);
const enemies = createEnemies(scene, islandData.enemies, clickables);

// ---------- Spieler und Systeme ----------
// Debug zuerst, damit es alle Events von Anfang an mitschreibt
if (import.meta.env.DEV) {
  setupDebugTools(player);
}
setupPlayerMovement(player);
setupInventoryEvents(player.inventory);
setupSkillEvents(player);
// Meldungen vor Charakter und Techniken: Bei gleichzeitigen Level-Ups bleibt so die wichtigste Meldung stehen
setupMessages();
setupCharacterEvents(player);
setupTechniqueEvents(player);
setupFood(player, canEatInCombat);
setupTimingBar();
setupWoodcutting(player);
setupFishingGame(camera);
setupFishing(player);
setupCookingGame();
setupCooking(player);
setupWindriding(player);
setupChests(player);
setupLoot(player, scene, clickables);

// ---------- Kampf ----------
setupCombat(player);
setupRhythm(camera);

// ---------- Fenster und Anzeigen ----------
// Layout: Statusleiste oben links, Chat unten links, Seitenpanel unten rechts, Menü oben rechts
createStatusBar(player);
createChatLog();
// Seitenpanel unten rechts mit Reitern (Tasten I / K / C / R)
const sidePanel = createSidePanel();
sidePanel.addTab({ id: "inventory", label: "Inventory", key: "KeyI", ...createInventoryPanel(player.inventory) });
sidePanel.addTab({ id: "skills", label: "Skills", key: "KeyK", ...createSkillsPanel(player) });
sidePanel.addTab({ id: "character", label: "Character", key: "KeyC", ...createCharacterPanel(player) });
// Nach Laufen und Kampf: Das Riding-Menü setzt beim Sprung-Klick den Klick-Modus zurück, die anderen sollen ihn vorher noch sehen
sidePanel.addTab({ id: "riding", label: "Riding", key: "KeyR", ...createRidingMenu(player, scene) });
createCombatHud();
createHpBars(player, enemies, camera);
createActionMenu(player, camera);
createReachableTiles(scene);
createTileMarker(scene);
setupSaveIcon();
createMenu(player);

// ---------- Kamera und Eingabe ----------
setupCamera(renderer.domElement);
setupInput(camera, renderer.domElement, clickables);

// ---------- Spielstand ----------
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
