// Zeigt die Leiste mit Kampftechniken des Spielers während seines Zugs (auswählen per Klick oder Taste 1–9).
import "./ui.css";
import { on } from "../core/eventBus.js";
import { isPlayerTurn, getSelectedTechnique, selectTechnique, getCombatState } from "../combat/combat.js";
import { getTechniques, getCooldown } from "../combat/techniques.js";

const HIDDEN_CLASS = "technique-hidden";

// Erstellt die Leiste für Kampftechniken und aktualisiert sie bei Kampf-Events.
export function createTechniqueBar(player) {
  const bar = document.createElement("div");
  bar.className = "technique-bar " + HIDDEN_CLASS;
  document.body.appendChild(bar);

  const update = () => updateTechniqueBar(player, bar);

  on("turnStarted", update);
  on("combatTurnUpdated", update);
  on("combatEnded", update);
  on("combatStarted", update);

  addEventListener("keydown", (event) => {
    if (event.repeat || !isPlayerTurn()) {
      return;
    }

    const match = event.code.match(/^Digit([1-9])$/);
    if (!match) {
      return;
    }

    const index = parseInt(match[1], 10) - 1;
    const techniques = getTechniques(player);
    const technique = techniques[index];
    if (technique) {
      selectTechnique(technique.id);
    }
  });

  update();
}

// Baut die Knöpfe der Technikenleiste neu auf und aktualisiert deren Zustand.
function updateTechniqueBar(player, bar) {
  if (!isPlayerTurn()) {
    bar.classList.add(HIDDEN_CLASS);
    while (bar.firstChild) {
      bar.removeChild(bar.firstChild);
    }
    return;
  }

  bar.classList.remove(HIDDEN_CLASS);
  while (bar.firstChild) {
    bar.removeChild(bar.firstChild);
  }

  const techniques = getTechniques(player);
  const selectedId = getSelectedTechnique();
  const actionUsed = Boolean(getCombatState()?.actionUsed);

  techniques.forEach((technique, index) => {
    const button = document.createElement("button");
    button.className = "technique-button";

    const cooldown = getCooldown(player, technique.id);
    let label = `${index + 1} ${technique.name}`;
    if (cooldown > 0) {
      label += ` (${cooldown})`;
    }
    button.textContent = label;

    if (technique.id === selectedId) {
      button.classList.add("technique-selected");
    }

    button.disabled = cooldown > 0 || actionUsed;

    button.addEventListener("click", () => {
      selectTechnique(technique.id);
    });

    bar.appendChild(button);
  });
}
