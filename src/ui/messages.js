// Zeigt kurze Meldungen oben in der Bildschirmmitte (z. B. "Your inventory is full").
import "./ui.css";
import SKILL_DATA from "../data/skills.json";
import { on } from "../core/eventBus.js";

const SHOW_TIME_MS = 2000;
const VISIBLE_CLASS = "ui-message-visible";

const messageElement = document.createElement("div");
messageElement.className = "ui-message";
let hideTimer = null;

// Blendet die Meldung kurz ein (eine neue Meldung ersetzt die alte und startet die Zeit neu).
export function showMessage(text) {
  if (!messageElement.isConnected) {
    document.body.appendChild(messageElement);
  }
  messageElement.textContent = text;
  messageElement.classList.add(VISIBLE_CLASS);

  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => messageElement.classList.remove(VISIBLE_CLASS), SHOW_TIME_MS);
}

// Hört auf Spiel-Events und zeigt die passende Meldung.
export function setupMessages() {
  on("inventoryFull", () => showMessage("Your inventory is full"));
  on("skillLevelUp", (data) => showMessage(`${SKILL_DATA.skills[data.skill].name} level ${data.level}!`));
}
