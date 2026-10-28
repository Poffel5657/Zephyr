// Charakter-Reiter im Seitenpanel: Grundwerte, Level, HP/ZEP, Ausrüstung, Punkte verteilen (Entwurf + Confirm) und zurücksetzen.
import "./ui.css";
import "./characterPanel.css";
import ITEMS from "../data/items.json";
import { emit, on } from "../core/eventBus.js";
import { getLevelProgress, getMaxHp, getMaxZep, spendPoints, resetStatPoints, getSpentPointsTotal } from "../character/character.js";
import { hasItem, removeItem } from "../inventory/inventory.js";
import { isInCombat } from "../combat/combat.js";

const HIDDEN_CLASS = "character-hidden";
// Ausrüstungs-Plätze: Anzeigename und welcher Bonus dabei steht
const EQUIPMENT_SLOTS = [
  { key: "weapon", label: "Weapon", bonus: "damage", unit: "damage" },
  { key: "armor", label: "Armor", bonus: "maxHp", unit: "max HP" },
];
// Dieses Item kostet das Zurücksetzen aller Punkte
const RESET_ITEM = "wind_essence";

// Reihenfolge und Anzeigename der Grundwerte im Fenster
const STATS = [
  { key: "str", label: "STR" },
  { key: "vit", label: "VIT" },
  { key: "zep", label: "ZEP" },
  { key: "agi", label: "AGI" },
];

// Baut den Inhalt des Character-Reiters (Werte, + / −, Confirm, Reset). Gibt { content, onHide } zurück:
// onHide verwirft den Entwurf, wenn man den Reiter verlässt.
export function createCharacterPanel(character) {
  // Entwurf: ausprobierte, aber noch nicht bestätigte Punkte pro Wert
  const draft = { str: 0, vit: 0, zep: 0, agi: 0 };
  const resetDraft = () => {
    for (const { key } of STATS) {
      draft[key] = 0;
    }
  };
  const update = () => updateCharacter(character, elements, draft);

  const panel = document.createElement("div");
  panel.className = "character-panel";

  const title = document.createElement("div");
  title.className = "character-title";
  title.textContent = character.name;
  panel.appendChild(title);

  const level = document.createElement("div");
  level.className = "character-level";
  panel.appendChild(level);

  const progress = document.createElement("div");
  progress.className = "character-progress";
  panel.appendChild(progress);

  const hp = document.createElement("div");
  hp.className = "character-hp";
  panel.appendChild(hp);

  const zep = document.createElement("div");
  zep.className = "character-zep";
  panel.appendChild(zep);

  // Ausrüstung: pro Platz Name + Bonus und "Unequip"
  const equipmentList = document.createElement("div");
  equipmentList.className = "character-equipment";
  panel.appendChild(equipmentList);
  const equipmentElements = {};
  for (const { key, label } of EQUIPMENT_SLOTS) {
    const row = document.createElement("div");
    row.className = "character-equipment-row";
    const name = document.createElement("span");
    name.className = "character-equipment-label";
    name.textContent = label;
    const item = document.createElement("span");
    item.className = "character-equipment-item";
    const unequip = document.createElement("button");
    unequip.className = "character-stat-button character-unequip";
    unequip.textContent = "×";
    unequip.title = "Unequip";
    unequip.addEventListener("click", () => emit("unequipRequested", { character, slot: key }));
    row.append(name, item, unequip);
    equipmentList.appendChild(row);
    equipmentElements[key] = { item, unequip };
  }

  const points = document.createElement("div");
  points.className = "character-points";
  panel.appendChild(points);

  const statsList = document.createElement("div");
  statsList.className = "character-stats";
  panel.appendChild(statsList);

  // Pro Attribut eine Zeile mit Name, aktuellem Wert (+ Entwurf) und +/- Knöpfen anlegen
  const statElements = {};
  for (const { key, label } of STATS) {
    const row = document.createElement("div");
    row.className = "character-stat-row";

    const name = document.createElement("span");
    name.className = "character-stat-label";
    name.textContent = label;
    row.appendChild(name);

    const value = document.createElement("span");
    value.className = "character-stat-value";
    row.appendChild(value);

    const controls = document.createElement("div");
    controls.className = "character-stat-controls";

    const minusBtn = document.createElement("button");
    minusBtn.className = "character-stat-button";
    minusBtn.textContent = "−";
    minusBtn.addEventListener("click", () => {
      if (draft[key] > 0) {
        draft[key]--;
        update();
      }
    });
    controls.appendChild(minusBtn);

    const plusBtn = document.createElement("button");
    plusBtn.className = "character-stat-button";
    plusBtn.textContent = "+";
    plusBtn.addEventListener("click", () => {
      if (character.unspentPoints - getDraftSum(draft) > 0) {
        draft[key]++;
        update();
      }
    });
    controls.appendChild(plusBtn);

    row.appendChild(controls);
    statsList.appendChild(row);

    statElements[key] = { value, minusBtn, plusBtn };
  }

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "character-confirm-button";
  confirmBtn.textContent = "Confirm";
  confirmBtn.addEventListener("click", () => {
    // Erst den Entwurf leeren, dann fest übernehmen: spendPoints meldet "statsChanged" und das zeichnet neu
    const allocation = { ...draft };
    resetDraft();
    spendPoints(character, allocation);
    update();
  });
  panel.appendChild(confirmBtn);

  // Alle Punkte zurücksetzen gegen eine Wind-Essenz, mit Sicherheitsfrage
  const resetBtn = document.createElement("button");
  resetBtn.className = "character-confirm-button character-reset-button";
  resetBtn.textContent = "Reset (1 Wind Essence)";
  panel.appendChild(resetBtn);

  const resetAsk = document.createElement("div");
  resetAsk.className = "character-reset-ask " + HIDDEN_CLASS;
  const resetText = document.createElement("div");
  resetText.className = "character-reset-text";
  resetText.textContent = "Reset all points for 1 Wind Essence?";
  resetAsk.appendChild(resetText);
  const resetYes = document.createElement("button");
  resetYes.className = "character-confirm-button";
  resetYes.textContent = "Yes";
  resetAsk.appendChild(resetYes);
  const resetNo = document.createElement("button");
  resetNo.className = "character-confirm-button";
  resetNo.textContent = "No";
  resetAsk.appendChild(resetNo);
  panel.appendChild(resetAsk);

  const showResetAsk = (visible) => {
    resetAsk.classList.toggle(HIDDEN_CLASS, !visible);
    resetBtn.classList.toggle(HIDDEN_CLASS, visible);
  };
  resetBtn.addEventListener("click", () => showResetAsk(true));
  resetNo.addEventListener("click", () => showResetAsk(false));
  resetYes.addEventListener("click", () => {
    showResetAsk(false);
    if (canReset(character)) {
      removeItem(character.inventory, RESET_ITEM, 1);
      resetDraft();
      resetStatPoints(character);
    }
  });


  const elements = {
    level,
    progress,
    hp,
    zep,
    points,
    confirmBtn,
    resetBtn,
    stats: statElements,
    equipment: equipmentElements,
  };

  // Reiter verlassen oder Panel eingeklappt: Entwurf verwerfen
  const onHide = () => {
    resetDraft();
    showResetAsk(false);
    update();
  };

  for (const eventName of ["statsChanged", "hpChanged"]) {
    on(eventName, (data) => {
      if (data.character === character) {
        update();
      }
    });
  }
  // Essenz bekommen/verbraucht oder Kampf beginnt/endet → Reset-Knopf an oder aus
  on("inventoryChanged", (data) => {
    if (data.inventory === character.inventory) {
      update();
    }
  });
  on("combatStarted", update);
  on("combatEnded", update);

  update();
  return { content: panel, onHide };
}

// Aktualisiert Level, Lebenspunkte, ZEP, Punkte und alle Attribut-Werte inklusive Entwurf.
function updateCharacter(character, elements, draft) {
  const draftSum = getDraftSum(draft);
  const remainingPoints = character.unspentPoints - draftSum;

  elements.level.textContent = `Level ${character.level}`;

  const progress = getLevelProgress(character);
  elements.progress.textContent = `${progress.current} / ${progress.needed} skill levels`;

  const draftStats = {
    str: character.stats.str + draft.str,
    vit: character.stats.vit + draft.vit,
    zep: character.stats.zep + draft.zep,
    agi: character.stats.agi + draft.agi,
  };
  // Max-HP/ZEP schon mit dem Entwurf anzeigen, damit man sieht, was ein Punkt bringt
  const tempCharacter = { ...character, stats: draftStats };

  // Aktuelle HP wachsen mit dem Entwurf genauso wie Max-HP (es fehlt gleich viel)
  const maxHp = getMaxHp(tempCharacter);
  elements.hp.textContent = `HP: ${character.hp + maxHp - getMaxHp(character)} / ${maxHp}`;
  elements.zep.textContent = `Max ZEP: ${getMaxZep(tempCharacter)}`;
  elements.points.textContent = `Points: ${remainingPoints}`;

  for (const { key, bonus, unit } of EQUIPMENT_SLOTS) {
    const itemId = character.equipment[key];
    const { item, unequip } = elements.equipment[key];
    item.textContent = itemId === null ? "—" : `${ITEMS[itemId].name} (+${ITEMS[itemId][bonus] ?? 0} ${unit})`;
    unequip.hidden = itemId === null;
    unequip.disabled = isInCombat();
  }

  for (const { key } of STATS) {
    const statEl = elements.stats[key];
    statEl.value.textContent = character.stats[key] + draft[key];
    statEl.minusBtn.disabled = draft[key] <= 0;
    statEl.plusBtn.disabled = remainingPoints <= 0;
  }

  elements.confirmBtn.disabled = draftSum <= 0;
  elements.resetBtn.disabled = !canReset(character);
}

// Zählt die Punkte im Entwurf zusammen.
function getDraftSum(draft) {
  return draft.str + draft.vit + draft.zep + draft.agi;
}

// Zurücksetzen geht nur mit Wind-Essenz, mit verteilten Punkten und nicht im Kampf.
function canReset(character) {
  return hasItem(character.inventory, RESET_ITEM) && getSpentPointsTotal(character) > 0 && !isInCombat();
}
