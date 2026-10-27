// Riding-Reiter im Seitenpanel (Taste R): zeigt Wind-Ladungen und alle Windriding-Fähigkeiten (erstmal den Doppelsprung).
// Klick auf eine Fähigkeit → Ziel-Modus: Sprung-Felder leuchten, Klick auf ein Feld springt dorthin.
// Den Reiter gibt es nur, wenn der Charakter Windschuhe dabeihat.
import "./ui.css";
import "./ridingMenu.css";
import * as THREE from "three";
import { on } from "../core/eventBus.js";
import { getClickMode, setClickMode } from "../core/clickMode.js";
import { gridToWorld } from "../world/grid.js";
import { RIDING_ABILITIES, hasWindBoots, getMaxCharges, getJumpTargets, canUseAbility, useJump } from "../skills/windriding.js";

const CLICK_MODE = "jump";
const MARKER_COLOR = "#7de8d0";
const MARKER_LIFT = 0.008;

// Baut den Reiter-Inhalt und die Markierungen für die Sprung-Ziele.
// Gibt { content, isAvailable, onHide } zurück: onHide bricht ein laufendes Zielen ab.
export function createRidingMenu(player, scene) {
  const content = document.createElement("div");
  content.className = "riding-panel";
  const charges = document.createElement("div");
  charges.className = "riding-charges";
  const list = document.createElement("div");
  list.className = "riding-list";
  const hint = document.createElement("div");
  hint.className = "riding-hint";
  content.append(charges, list, hint);

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
    update();
  };

  // Ladungen als Punkte ("◆◆◇") und eine Zeile pro Fähigkeit, gesperrt mit Grund darunter
  const update = () => {
    if (!hasWindBoots(player)) {
      return;
    }
    const max = getMaxCharges(player);
    charges.textContent = "Wind charges " + "◆".repeat(player.windCharges) + "◇".repeat(Math.max(0, max - player.windCharges));
    list.replaceChildren();
    for (const [id, ability] of Object.entries(RIDING_ABILITIES)) {
      const entry = document.createElement("button");
      entry.className = "ui-button riding-ability";
      entry.textContent = ability.name;
      const reason = canUseAbility(player, id);
      entry.disabled = reason !== null;
      entry.title = reason ?? "";
      entry.setAttribute("aria-pressed", String(id === abilityId));
      entry.addEventListener("click", () => {
        abilityId = id;
        setClickMode(CLICK_MODE);
        showTargets(getJumpTargets(player, id));
        update();
      });
      list.appendChild(entry);
    }
    const blocked = canUseAbility(player, "double_jump");
    hint.textContent = abilityId !== null ? "Click a glowing tile to jump (R to cancel)" : (blocked ?? "");
  };

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

  return {
    content,
    isAvailable: () => hasWindBoots(player),
    onHide: () => {
      if (abilityId !== null) {
        stopTargeting();
      }
    },
  };
}
