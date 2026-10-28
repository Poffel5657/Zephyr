// Zeigt die Kampf-Oberfläche: Zugreihenfolge (oben), End Turn (unten Mitte) und Gegner-Info.
// Was im Kampf passiert, schreibt sie ins Log (Chat unten links).
import "./ui.css";
import "./combatHud.css";
import ITEMS from "../data/items.json";
import TECHNIQUES from "../data/techniques.json";
import { on, emit } from "../core/eventBus.js";
import { isPlayerTurn } from "../combat/combat.js";
import { getMaxHp } from "../character/character.js";
import { logMessage } from "./chatLog.js";

const HIDDEN_CLASS = "combat-hidden";

// Erstellt alle HUD-Elemente für den rundenbasierten Kampf und registriert Event-Listener.
export function createCombatHud() {
  let inCombat = false;
  let currentOrder = [];
  let currentCombatant = null;
  let selectedEnemy = null;

  // Leiste für die Zugreihenfolge oben in der Mitte
  const turnOrderBar = document.createElement("div");
  turnOrderBar.className = "ui-panel combat-order-bar " + HIDDEN_CLASS;
  document.body.appendChild(turnOrderBar);

  // Steuerung unten in der Mitte: Zug beenden Knopf und Zug-Status
  const turnPanel = document.createElement("div");
  turnPanel.className = "combat-turn-panel " + HIDDEN_CLASS;

  const endTurnButton = document.createElement("button");
  endTurnButton.className = "ui-button combat-end-turn-button";
  endTurnButton.textContent = "End Turn";
  turnPanel.appendChild(endTurnButton);

  const turnStatus = document.createElement("span");
  turnStatus.className = "ui-panel combat-turn-status";
  turnPanel.appendChild(turnStatus);

  document.body.appendChild(turnPanel);

  // Info-Anzeige für den anvisierten Gegner
  const enemyInfoPanel = document.createElement("div");
  enemyInfoPanel.className = "ui-panel combat-enemy-info " + HIDDEN_CLASS;
  document.body.appendChild(enemyInfoPanel);

  // Zeichnet die Namens-Chips der Zugreihenfolge neu
  function renderTurnOrder() {
    while (turnOrderBar.firstChild) {
      turnOrderBar.removeChild(turnOrderBar.firstChild);
    }
    for (const combatant of currentOrder) {
      const chip = document.createElement("div");
      chip.className = "combat-order-chip";
      // Gegner mit Level, z. B. "Wild Gust Lv 2" (der Spieler ohne)
      chip.textContent = combatant.alive === undefined ? combatant.name : `${combatant.name} Lv ${combatant.level}`;

      if (combatant === currentCombatant) {
        chip.classList.add("combat-order-current");
      }
      if (combatant.alive === false) {
        chip.classList.add("combat-order-dead");
      }

      turnOrderBar.appendChild(chip);
    }
  }

  // Schreibt eine Kampf-Zeile ins Log
  function addLogMessage(text) {
    logMessage(text, "combat");
  }

  // Aktualisiert die Anzeige des ausgewählten Gegners (auch außerhalb vom Kampf, Auswahl per Linksklick)
  function updateEnemyInfo() {
    if (!selectedEnemy) {
      enemyInfoPanel.classList.add(HIDDEN_CLASS);
      return;
    }
    const maxHp = getMaxHp(selectedEnemy);
    enemyInfoPanel.textContent = `${selectedEnemy.name} · Lv ${selectedEnemy.level} · HP ${selectedEnemy.hp} / ${maxHp}`;
    enemyInfoPanel.classList.remove(HIDDEN_CLASS);
  }

  // Aktualisiert den Zustand des Zug-Knopfs
  function updateTurnButton() {
    endTurnButton.disabled = !isPlayerTurn();
  }

  endTurnButton.addEventListener("click", () => {
    emit("endTurnRequested", {});
  });

  on("combatStarted", () => {
    inCombat = true;
    currentOrder = [];
    currentCombatant = null;

    renderTurnOrder();
    turnOrderBar.classList.remove(HIDDEN_CLASS);

    turnPanel.classList.remove(HIDDEN_CLASS);
    turnStatus.textContent = "";
    updateTurnButton();

    updateEnemyInfo();
  });

  // Sieg / Niederlage / Flucht stehen schon als Meldung im Log (combatEnd.js)
  on("combatEnded", () => {
    inCombat = false;
    currentOrder = [];
    currentCombatant = null;

    turnOrderBar.classList.add(HIDDEN_CLASS);
    turnPanel.classList.add(HIDDEN_CLASS);
    updateEnemyInfo();
  });

  on("turnStarted", () => {
    updateTurnButton();
    if (!isPlayerTurn()) {
      turnStatus.textContent = "";
    }
  });

  on("combatTurnUpdated", (data) => {
    if (data === null) {
      return;
    }
    currentOrder = data.order || [];
    currentCombatant = data.current || null;
    renderTurnOrder();

    updateTurnButton();
    if (isPlayerTurn()) {
      const parts = [`Moves: ${data.moveLeft ?? 0}`];
      if (data.actionUsed) {
        parts.push("Action used");
      }
      // Laufende Buffs mit restlichen Zügen, z. B. "Sharpen (2)"
      for (const [techniqueId, buff] of Object.entries(data.current?.buffs ?? {})) {
        parts.push(`${TECHNIQUES[techniqueId].name} (${buff.turnsLeft})`);
      }
      turnStatus.textContent = parts.join(" · ");
    } else {
      turnStatus.textContent = "";
    }
  });

  // Einzelne Schläge: Bei eigenen Combos steht nur das Ausweichen hier, die Summe kommt mit "comboEnded"
  on("attackResolved", (data) => {
    const attackName = data.technique === undefined ? "attack" : TECHNIQUES[data.technique].name;
    if (data.dodged) {
      addLogMessage(`${data.target.name} dodges ${data.attacker.name}'s ${attackName}`);
    } else if (data.technique !== undefined) {
      return;
    } else if (data.block === "perfect") {
      addLogMessage("Perfect block!");
    } else if (data.block === "good") {
      addLogMessage(`Blocked half: ${data.attacker.name} hits ${data.target.name} for ${data.damage}${highGroundText(data)}`);
    } else {
      addLogMessage(`${data.attacker.name} hits ${data.target.name} for ${data.damage}${highGroundText(data)}`);
    }
  });

  // Eigene Combo zusammengefasst, z. B. "Hero's Cleave: 3 hits, 16 damage"
  on("comboEnded", (data) => {
    if (data.dodged) {
      return;
    }
    // Normaler Angriff ohne Rhythmus: ein einfacher Schlag
    if (TECHNIQUES[data.technique].pattern.length === 0) {
      addLogMessage(`${data.attacker.name} hits ${data.target.name} for ${data.hits[0]}${highGroundText(data)}`);
      return;
    }
    const total = data.hits.reduce((sum, damage) => sum + damage, 0);
    const hitText = data.hits.length === 1 ? "1 hit" : `${data.hits.length} hits`;
    addLogMessage(`${data.attacker.name}'s ${TECHNIQUES[data.technique].name}: ${hitText}, ${total} damage${highGroundText(data)}`);
  });

  on("itemEaten", (data) => {
    const itemName = ITEMS[data.item]?.name || data.item;
    logMessage(`${data.character.name} eats a ${itemName} (+${data.healed} HP)`, inCombat ? "combat" : "info");
  });

  on("enemyDefeated", (data) => {
    addLogMessage(`${data.enemy.name} is defeated`);
    renderTurnOrder();
    if (selectedEnemy === data.enemy) {
      selectedEnemy = null;
      updateEnemyInfo();
    }
  });

  on("enemySelected", (data) => {
    selectedEnemy = data.enemy || null;
    updateEnemyInfo();
  });

  on("hpChanged", (data) => {
    if (data.character === selectedEnemy) {
      updateEnemyInfo();
    }
  });
}

// Zusatz im Log, wenn der Angreifer von oben zugeschlagen hat (Höhen-Bonus).
function highGroundText(data) {
  return data.highGround ? " (high ground!)" : "";
}
