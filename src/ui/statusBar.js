// Statusleiste oben links, immer sichtbar: Name, Level, HP, ZEP und (mit Windschuhen) die Wind-Ladungen.
// Im Kampf leuchtet sie, wenn der Spieler dran ist.
import "./ui.css";
import "./statusBar.css";
import { on } from "../core/eventBus.js";
import { getMaxHp, getMaxZep } from "../character/character.js";
import { hasWindBoots, getMaxCharges } from "../skills/windriding.js";

const ACTIVE_CLASS = "status-active";

// Baut die Leiste und hält sie bei allen Änderungen aktuell.
export function createStatusBar(player) {
  const panel = document.createElement("div");
  panel.className = "ui-panel status";

  const name = document.createElement("div");
  name.className = "status-name";
  const hp = createBar("status-hp", "HP");
  const zep = createBar("status-zep", "ZEP");
  const charges = document.createElement("div");
  charges.className = "status-charges";
  panel.append(name, hp.row, zep.row, charges);
  document.body.appendChild(panel);

  const update = () => {
    name.textContent = `${player.name} · Lv ${player.level}`;
    // ZEP verbraucht noch nichts (kommt mit Windweaving), deshalb immer voll
    setBar(hp, player.hp, getMaxHp(player));
    setBar(zep, getMaxZep(player), getMaxZep(player));
    const showCharges = hasWindBoots(player);
    charges.hidden = !showCharges;
    if (showCharges) {
      const max = getMaxCharges(player);
      charges.textContent = "Wind " + "◆".repeat(player.windCharges) + "◇".repeat(Math.max(0, max - player.windCharges));
    }
  };

  for (const eventName of ["hpChanged", "statsChanged", "characterLevelUp", "windChargesChanged", "inventoryChanged", "skillsChanged"]) {
    on(eventName, (data) => {
      if (data?.character === undefined || data.character === player) {
        update();
      }
    });
  }
  on("turnStarted", ({ combatant }) => panel.classList.toggle(ACTIVE_CLASS, combatant === player));
  on("combatEnded", () => panel.classList.remove(ACTIVE_CLASS));
  update();
}

// Eine Leiste mit Beschriftung und Zahl, z. B. "HP ████░░ 7 / 10".
function createBar(className, label) {
  const row = document.createElement("div");
  row.className = "status-row " + className;
  const text = document.createElement("span");
  text.className = "status-label";
  text.textContent = label;
  const bar = document.createElement("div");
  bar.className = "status-bar";
  const fill = document.createElement("div");
  fill.className = "status-fill";
  bar.appendChild(fill);
  const value = document.createElement("span");
  value.className = "status-value";
  row.append(text, bar, value);
  return { row, fill, value };
}

function setBar(bar, current, max) {
  bar.fill.style.width = (max > 0 ? Math.max(0, Math.min(1, current / max)) * 100 : 0) + "%";
  bar.value.textContent = `${current} / ${max}`;
}
