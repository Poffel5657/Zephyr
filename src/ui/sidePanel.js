// Seitenpanel unten rechts mit Reitern (wie OSRS): Inventory, Skills, Character, Riding.
// Taste oder Klick auf einen Reiter öffnet ihn, dieselbe Taste (oder Klick auf den aktiven Reiter) klappt das Panel ein.
// Die Inhalte bauen die Fenster-Module selbst (z. B. createInventoryPanel), hier werden sie nur angeordnet.
import "./ui.css";
import "./sidePanel.css";
import { on } from "../core/eventBus.js";

const COLLAPSED_CLASS = "side-panel-collapsed";

// Baut das leere Panel. Reiter kommen mit addTab dazu.
export function createSidePanel() {
  const panel = document.createElement("div");
  panel.className = "ui-panel side-panel";
  const tabBar = document.createElement("div");
  tabBar.className = "side-panel-tabs";
  const body = document.createElement("div");
  body.className = "side-panel-body";
  panel.append(tabBar, body);
  document.body.appendChild(panel);

  // { id, label, key, content, button, onHide, isAvailable }
  const tabs = [];
  let active = null;
  let collapsed = false;

  const render = () => {
    for (const tab of tabs) {
      const available = tab.isAvailable();
      tab.button.hidden = !available;
      tab.button.setAttribute("aria-pressed", String(tab === active && !collapsed));
      tab.content.hidden = tab !== active;
    }
    panel.classList.toggle(COLLAPSED_CLASS, collapsed);
  };

  // Den aktiven Reiter verlassen oder einklappen: das Modul räumt auf (z. B. Charakter-Entwurf verwerfen)
  const hideActive = () => {
    if (active !== null && !collapsed) {
      active.onHide();
    }
  };

  // Reiter öffnen, oder einklappen, wenn er schon offen ist
  const select = (tab) => {
    if (!tab.isAvailable()) {
      return;
    }
    if (tab === active && !collapsed) {
      hideActive();
      collapsed = true;
    } else {
      if (tab !== active) {
        hideActive();
      }
      active = tab;
      collapsed = false;
      tab.onShow();
    }
    render();
  };

  addEventListener("keydown", (event) => {
    if (event.repeat) {
      return;
    }
    const tab = tabs.find((candidate) => candidate.key === event.code);
    if (tab !== undefined) {
      select(tab);
    }
  });

  // Ein Reiter kann verschwinden (Riding ohne Windschuhe), dann den ersten zeigen
  on("inventoryChanged", () => {
    if (active !== null && !active.isAvailable()) {
      hideActive();
      active = tabs[0];
    }
    render();
  });

  return {
    // Fügt einen Reiter hinzu. key = event.code der Taste (z. B. "KeyI").
    addTab({ id, label, key, content, onShow = () => {}, onHide = () => {}, isAvailable = () => true }) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "side-panel-tab";
      button.textContent = label;
      button.title = `${label} (${key.replace("Key", "")})`;
      tabBar.appendChild(button);
      content.classList.add("side-panel-content");
      body.appendChild(content);
      const tab = { id, label, key, content, button, onShow, onHide, isAvailable };
      button.addEventListener("click", () => select(tab));
      tabs.push(tab);
      if (active === null) {
        active = tab;
      }
      render();
    },
    // Öffnet einen Reiter von außen (z. B. nach dem Aufheben der Windschuhe)
    open(id) {
      const tab = tabs.find((candidate) => candidate.id === id);
      if (tab !== undefined && (tab !== active || collapsed)) {
        select(tab);
      }
    },
  };
}
