// Riding-Menü (Taste R oder Knopf "Riding"): zeigt alle Windriding-Fähigkeiten (erstmal den Doppelsprung).
// Klick auf eine Fähigkeit → Ziel-Modus: Sprung-Felder leuchten, Klick auf ein Feld springt dorthin.
// Nur sichtbar, wenn der Charakter Windschuhe dabeihat.
import "./ui.css";
import * as THREE from "three";
import { on } from "../core/eventBus.js";
import { getClickMode, setClickMode } from "../core/clickMode.js";
import { gridToWorld } from "../world/grid.js";
import { RIDING_ABILITIES, hasWindBoots, getMaxCharges, getJumpTargets, canUseAbility, useJump } from "../skills/windriding.js";

const TOGGLE_KEY = "KeyR";
const HIDDEN_CLASS = "riding-hidden";
const CLICK_MODE = "jump";
const MARKER_COLOR = "#7de8d0";
const MARKER_LIFT = 0.008;

// Baut Knopf, Menü und die Markierungen für die Sprung-Ziele.
export function createRidingMenu(player, scene) {
  const button = document.createElement("button");
  button.className = "riding-button " + HIDDEN_CLASS;
  document.body.appendChild(button);

  const menu = document.createElement("div");
  menu.className = "riding-menu " + HIDDEN_CLASS;
  document.body.appendChild(menu);

  // Markierungen für Sprung-Ziele (wiederverwendet, wie bei den Lauf-Feldern im Kampf)
  const geometry = new THREE.PlaneGeometry(0.9, 0.9);
  const material = new THREE.MeshBasicMaterial({ color: MARKER_COLOR, transparent: true, opacity: 0.45, depthWrite: false });
  const markers = [];
  let abilityId = null;

  const showTargets = (tiles) => {
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

  const stopTargeting = () => {
    abilityId = null;
    showTargets([]);
    setClickMode(null);
  };

  const closeMenu = () => menu.classList.add(HIDDEN_CLASS);

  // Knopf-Text mit Ladungen als Punkte, z. B. "Riding ◆◆◇"
  const update = () => {
    const visible = hasWindBoots(player);
    button.classList.toggle(HIDDEN_CLASS, !visible);
    if (!visible) {
      closeMenu();
      stopTargeting();
      return;
    }
    const max = getMaxCharges(player);
    button.textContent = "Riding " + "◆".repeat(player.windCharges) + "◇".repeat(Math.max(0, max - player.windCharges));
    if (!menu.classList.contains(HIDDEN_CLASS)) {
      buildMenu();
    }
  };

  // Eine Zeile pro Fähigkeit, gesperrt mit Grund als Tooltip
  const buildMenu = () => {
    menu.replaceChildren();
    for (const [id, ability] of Object.entries(RIDING_ABILITIES)) {
      const entry = document.createElement("button");
      entry.className = "riding-menu-button";
      entry.textContent = `${ability.name} (${player.windCharges})`;
      const reason = canUseAbility(player, id);
      entry.disabled = reason !== null;
      entry.title = reason ?? "";
      entry.addEventListener("click", () => {
        closeMenu();
        abilityId = id;
        setClickMode(CLICK_MODE);
        showTargets(getJumpTargets(player, id));
      });
      menu.appendChild(entry);
    }
    const cancel = document.createElement("button");
    cancel.className = "riding-menu-button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      closeMenu();
      stopTargeting();
    });
    menu.appendChild(cancel);
  };

  const toggle = () => {
    if (!hasWindBoots(player)) {
      return;
    }
    // Zweites R bricht ein laufendes Zielen ab
    if (abilityId !== null) {
      stopTargeting();
      return;
    }
    if (menu.classList.toggle(HIDDEN_CLASS)) {
      return;
    }
    buildMenu();
  };

  button.addEventListener("click", toggle);
  addEventListener("keydown", (event) => {
    if (event.code === TOGGLE_KEY && !event.repeat) {
      toggle();
    }
  });

  // Im Ziel-Modus: Klick auf ein Sprung-Feld springt, Klick daneben bricht ab
  on("tileClicked", (tile) => {
    if (getClickMode() !== CLICK_MODE || abilityId === null) {
      return;
    }
    const id = abilityId;
    stopTargeting();
    if (getJumpTargets(player, id).some((target) => target.x === tile.x && target.z === tile.z)) {
      useJump(player, tile, id);
    }
  });

  for (const eventName of ["inventoryChanged", "windChargesChanged", "skillsChanged", "combatTurnUpdated", "combatStarted", "combatEnded"]) {
    on(eventName, update);
  }
  // Zugwechsel im Kampf bricht das Zielen ab
  on("turnStarted", stopTargeting);
  on("combatEnded", stopTargeting);
  update();
}
