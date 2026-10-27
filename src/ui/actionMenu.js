// Aktions-Menü im Kampf: Klick auf einen Gegner öffnet direkt daneben die Liste der Techniken.
// Auswahl per Klick oder Taste 1–9, der Charakter läuft dann selbst hin (wenn die Felder reichen).
import "./ui.css";
import "./actionMenu.css";
import { on } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { useTechnique } from "../combat/combat.js";
import { getTechniques, getCooldown } from "../combat/techniques.js";
import { placeOnScreen } from "./screenPosition.js";

const HIDDEN_CLASS = "action-menu-hidden";
// So weit unter dem Gegner-Mittelpunkt sitzt das Menü
const MENU_DROP = 0.4;

// Baut das Menü und hört auf "actionMenuOpened". Es schließt sich bei Auswahl, Cancel, Klick aufs Feld und Zugwechsel.
export function createActionMenu(player, camera) {
  const menu = document.createElement("div");
  menu.className = "action-menu " + HIDDEN_CLASS;
  document.body.appendChild(menu);

  let target = null;
  let techniques = [];

  const close = () => {
    target = null;
    menu.classList.add(HIDDEN_CLASS);
  };

  const choose = (technique) => {
    const enemy = target;
    close();
    useTechnique(technique.id, enemy);
  };

  // Knöpfe neu bauen: "1 Attack", "2 Cleave (2)" (gesperrt = ausgegraut), dazu "Cancel"
  const open = (enemy) => {
    target = enemy;
    techniques = getTechniques(player);
    menu.replaceChildren();
    techniques.forEach((technique, index) => {
      const cooldown = getCooldown(player, technique.id);
      const button = document.createElement("button");
      button.className = "action-menu-button";
      button.textContent = `${index + 1} ${technique.name}` + (cooldown > 0 ? ` (${cooldown})` : "");
      button.disabled = cooldown > 0;
      button.addEventListener("click", () => choose(technique));
      menu.appendChild(button);
    });
    const cancel = document.createElement("button");
    cancel.className = "action-menu-button action-menu-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", close);
    menu.appendChild(cancel);
    menu.classList.remove(HIDDEN_CLASS);
    updatePosition();
  };

  // Das Menü folgt dem Gegner auf dem Bildschirm (Kamera kann sich drehen)
  const updatePosition = () => {
    if (target === null) {
      return;
    }
    placeOnScreen(menu, target.mesh.position, camera, -MENU_DROP);
  };

  on("actionMenuOpened", ({ enemy }) => open(enemy));
  for (const eventName of ["tileClicked", "turnStarted", "combatEnded"]) {
    on(eventName, close);
  }

  addEventListener("keydown", (event) => {
    const match = event.code.match(/^Digit([1-9])$/);
    if (target === null || match === null || event.repeat) {
      return;
    }
    const technique = techniques[Number(match[1]) - 1];
    if (technique !== undefined && getCooldown(player, technique.id) === 0) {
      choose(technique);
    }
  });

  addUpdate(updatePosition);
}
