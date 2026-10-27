// Kleines Symbol unten in der Mitte, das bei jedem Speichern kurz aufblinkt.
import "./ui.css";
import "./saveIcon.css";
import { on } from "../core/eventBus.js";

const SHOW_TIME_MS = 800;
const VISIBLE_CLASS = "save-icon-visible";

// Baut das Symbol und hört auf "gameSaved".
export function setupSaveIcon() {
  const icon = document.createElement("div");
  icon.className = "save-icon";
  icon.textContent = "💾";
  icon.title = "Game saved";
  document.body.appendChild(icon);

  let hideTimer = null;
  on("gameSaved", () => {
    icon.classList.add(VISIBLE_CLASS);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => icon.classList.remove(VISIBLE_CLASS), SHOW_TIME_MS);
  });
}
