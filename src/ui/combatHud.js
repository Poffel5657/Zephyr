// Zeigt die Kampf-Oberfläche: Zugreihenfolge, Runden-Aktionen, Kampf-Log und Gegner-Info.
import "./ui.css";
import ITEMS from "../data/items.json";
import TECHNIQUES from "../data/techniques.json";
import { on, emit } from "../core/eventBus.js";
import { isPlayerTurn } from "../combat/combat.js";
import { getMaxHp } from "../character/character.js";

const HIDDEN_CLASS = "combat-hidden";
const LOG_HIDE_DELAY_MS = 4000;

// Erstellt alle HUD-Elemente für den rundenbasierten Kampf und registriert Event-Listener.
export function createCombatHud() {
  let inCombat = false;
  let currentOrder = [];
  let currentCombatant = null;
  let selectedEnemy = null;
  let logHideTimer = null;

  // Leiste für die Zugreihenfolge oben in der Mitte
  const turnOrderBar = document.createElement("div");
  turnOrderBar.className = "combat-order-bar " + HIDDEN_CLASS;
  document.body.appendChild(turnOrderBar);

  // Steuerung unten in der Mitte: Zug beenden Knopf und Zug-Status
  const turnPanel = document.createElement("div");
  turnPanel.className = "combat-turn-panel " + HIDDEN_CLASS;

  const endTurnButton = document.createElement("button");
  endTurnButton.className = "combat-end-turn-button";
  endTurnButton.textContent = "End Turn";
  turnPanel.appendChild(endTurnButton);

  const turnStatus = document.createElement("span");
  turnStatus.className = "combat-turn-status";
  turnPanel.appendChild(turnStatus);

  document.body.appendChild(turnPanel);

  // Kampf-Log oben links
  const logPanel = document.createElement("div");
  logPanel.className = "combat-log " + HIDDEN_CLASS;
  document.body.appendChild(logPanel);

  // Info-Anzeige für den anvisierten Gegner
  const enemyInfoPanel = document.createElement("div");
  enemyInfoPanel.className = "combat-enemy-info " + HIDDEN_CLASS;
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

  // Schreibt eine neue Zeile in das Kampf-Log (maximal die letzten 5 Zeilen behalten)
  function addLogMessage(text) {
    const line = document.createElement("div");
    line.className = "combat-log-line";
    line.textContent = text;
    logPanel.appendChild(line);

    while (logPanel.children.length > 5) {
      logPanel.removeChild(logPanel.firstChild);
    }
  }

  // Leert das gesamte Kampf-Log
  function clearLog() {
    while (logPanel.firstChild) {
      logPanel.removeChild(logPanel.firstChild);
    }
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

    clearTimeout(logHideTimer);
    clearLog();
    logPanel.classList.remove(HIDDEN_CLASS);

    renderTurnOrder();
    turnOrderBar.classList.remove(HIDDEN_CLASS);

    turnPanel.classList.remove(HIDDEN_CLASS);
    turnStatus.textContent = "";
    updateTurnButton();

    updateEnemyInfo();
  });

  on("combatEnded", (data) => {
    inCombat = false;
    currentOrder = [];
    currentCombatant = null;

    turnOrderBar.classList.add(HIDDEN_CLASS);
    turnPanel.classList.add(HIDDEN_CLASS);
    updateEnemyInfo();

    if (data.result === "victory") {
      addLogMessage("Victory!");
    } else if (data.result === "defeat") {
      addLogMessage("You were defeated");
    } else if (data.result === "fled") {
      addLogMessage("You escaped");
    }

    clearTimeout(logHideTimer);
    logHideTimer = setTimeout(() => {
      logPanel.classList.add(HIDDEN_CLASS);
    }, LOG_HIDE_DELAY_MS);
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
    if (inCombat) {
      const itemName = ITEMS[data.item]?.name || data.item;
      addLogMessage(`${data.character.name} eats a ${itemName} (+${data.healed} HP)`);
    }
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
