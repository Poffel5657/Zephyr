// Aktions-Menü im Kampf: Klick auf einen Gegner öffnet direkt daneben die Liste der Techniken.
// Auswahl per Klick oder Taste 1–9, der Charakter läuft dann selbst hin (wenn die Felder reichen).
import "./ui.css";
import "./actionMenu.css";
import { on } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { useTechnique, getCombatState } from "../combat/combat.js";
import { getReelInBlock } from "../combat/reelIn.js";
import { getTechniques, getCooldown } from "../combat/techniques.js";
import { placeOnScreen } from "./screenPosition.js";

const HIDDEN_CLASS = "action-menu-hidden";
// So weit unter dem Gegner-Mittelpunkt sitzt das Menü
const MENU_DROP = 0.4;

// Baut das Menü und hört auf "actionMenuOpened". Es schließt sich bei Auswahl, Cancel, Klick aufs Feld und Zugwechsel.
export function createActionMenu(player, camera) {
  const menu = document.createElement("div");
  menu.className = "ui-panel action-menu " + HIDDEN_CLASS;
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

  // Warum die Technik gerade nicht geht (null = geht): Abklingzeit, Aktion schon verbraucht, Reel In nicht möglich
  const getBlock = (technique, enemy) => {
    if (getCooldown(player, technique.id) > 0) {
      return "Cooling down";
    }
    if (getCombatState()?.actionUsed && !technique.free) {
      return "You already acted this turn";
    }
    return technique.effect === "pull" ? getReelInBlock(player, enemy, technique) : null;
  };

  // Knöpfe neu bauen: "1 Attack", "2 Cleave (2)" (gesperrt = ausgegraut, Grund als Tooltip), dazu "Cancel"
  const open = (enemy) => {
    target = enemy;
    // Passive Techniken (Quick Snack) wirken von selbst und stehen nicht im Menü
    techniques = getTechniques(player).filter((technique) => !technique.passive);
    menu.replaceChildren();
    techniques.forEach((technique, index) => {
      const cooldown = getCooldown(player, technique.id);
      const block = getBlock(technique, enemy);
      const button = document.createElement("button");
      button.className = "action-menu-button";
      button.textContent = `${index + 1} ${technique.name}` + (cooldown > 0 ? ` (${cooldown})` : "");
      button.disabled = block !== null;
      button.title = block ?? "";
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
    if (technique !== undefined && getBlock(technique, target) === null) {
      choose(technique);
    }
  });

  addUpdate(updatePosition, { whilePaused: true });
}
