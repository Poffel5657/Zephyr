// Zeigt das Hauptmenü als HTML-Fenster über dem Spiel (öffnen/schließen mit Escape oder Knopf).
import "./ui.css";
import { saveManual, loadManualSave, getManualSaveTime, deleteSave, exportSaveText, importSaveText } from "../save/save.js";
import { showMessage } from "./messages.js";

const TOGGLE_KEY = "Escape";
const HIDDEN_CLASS = "menu-hidden";

// Baut das Menüfenster, die Aktions-Schaltflächen und den Umschalt-Knopf auf.
export function createMenu(player) {
  const panel = document.createElement("div");
  panel.className = "menu-panel " + HIDDEN_CLASS;

  const title = document.createElement("div");
  title.className = "menu-title";
  title.textContent = "Menu";
  panel.appendChild(title);

  // Hauptansicht mit den Standard-Menüpunkten
  const mainView = document.createElement("div");
  mainView.className = "menu-list";
  panel.appendChild(mainView);

  // Bestätigungsansicht für Aktionen wie Neues Spiel und Import
  const confirmView = document.createElement("div");
  confirmView.className = "menu-confirm " + HIDDEN_CLASS;

  const confirmText = document.createElement("div");
  confirmText.className = "menu-confirm-text";
  confirmView.appendChild(confirmText);

  const confirmActions = document.createElement("div");
  confirmActions.className = "menu-confirm-actions";

  let confirmCallback = null;

  const yesButton = createMenuButton("Yes", () => {
    if (confirmCallback) {
      confirmCallback();
    }
  });
  confirmActions.appendChild(yesButton);

  const noButton = createMenuButton("No", () => {
    showMain();
  });
  confirmActions.appendChild(noButton);

  confirmView.appendChild(confirmActions);
  panel.appendChild(confirmView);

  // Wechselt zur Bestätigungsansicht mit gegebenem Fragetext und Ausführungs-Callback
  function showConfirm(text, onYes) {
    confirmText.textContent = text;
    confirmCallback = onYes;
    mainView.classList.add(HIDDEN_CLASS);
    confirmView.classList.remove(HIDDEN_CLASS);
  }

  // Setzt die Ansicht auf die Hauptschaltflächen zurück
  function showMain() {
    confirmCallback = null;
    confirmView.classList.add(HIDDEN_CLASS);
    mainView.classList.remove(HIDDEN_CLASS);
  }

  // Schließt das Menü und stellt sicher, dass beim nächsten Öffnen die Hauptansicht aktiv ist
  const closeMenu = () => {
    panel.classList.add(HIDDEN_CLASS);
    showMain();
  };

  const toggle = () => {
    if (panel.classList.contains(HIDDEN_CLASS)) {
      updateLoadButton();
      panel.classList.remove(HIDDEN_CLASS);
    } else {
      closeMenu();
    }
  };

  // Eigenen Save anlegen (zu dem man mit "Load" zurückkehren kann)
  const saveButton = createMenuButton("Save", () => {
    if (saveManual(player)) {
      showMessage("Game saved");
      updateLoadButton();
    } else {
      showMessage("Could not save the game");
    }
  });
  mainView.appendChild(saveButton);

  // Zum letzten eigenen Save zurückkehren
  const loadButton = createMenuButton("Load", () => {
    showConfirm(`Load your save from ${formatTime(getManualSaveTime())}? Progress since then is lost.`, () => {
      if (loadManualSave()) {
        location.reload();
      } else {
        showMessage("Save could not be loaded");
        showMain();
      }
    });
  });
  mainView.appendChild(loadButton);

  // "Load" geht nur, wenn es einen eigenen Save gibt
  function updateLoadButton() {
    loadButton.disabled = getManualSaveTime() === null;
  }

  // Spielstand löschen und neu starten
  const newGameButton = createMenuButton("New Game", () => {
    showConfirm("Delete all saves and start over?", () => {
      deleteSave();
      location.reload();
    });
  });
  mainView.appendChild(newGameButton);

  // Spielstand als JSON-Datei herunterladen
  const exportButton = createMenuButton("Export", () => {
    const text = exportSaveText(player);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const filename = `zephyr-save-${year}-${month}-${day}.json`;

    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Erst kurz nach dem Klick freigeben, sonst bricht der Download in manchen Browsern ab
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  mainView.appendChild(exportButton);

  // Verstecktes Input-Element für den Datei-Import
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.className = "menu-file-input";
  document.body.appendChild(fileInput);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    fileInput.value = "";
    showConfirm("Replace your current save?", () => {
      if (importSaveText(text)) {
        location.reload();
      } else {
        showMessage("This is not a Zephyr save file");
        showMain();
      }
    });
  });

  const importButton = createMenuButton("Import", () => {
    fileInput.click();
  });
  mainView.appendChild(importButton);

  // Menü schließen
  const closeButton = createMenuButton("Close", () => {
    closeMenu();
  });
  mainView.appendChild(closeButton);

  document.body.appendChild(panel);

  // Fester Menü-Knopf oben rechts
  const button = document.createElement("button");
  button.className = "menu-button";
  button.textContent = "Menu";
  document.body.appendChild(button);

  button.addEventListener("click", toggle);
  addEventListener("keydown", (event) => {
    if (event.code === TOGGLE_KEY && !event.repeat) {
      toggle();
    }
  });
}

// Macht aus der Speicherzeit einen kurzen Text, z. B. "Oct 27, 18:04".
function formatTime(date) {
  // Importierte Dateien ohne gültige Zeit
  if (Number.isNaN(date.getTime())) {
    return "earlier";
  }
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

// Erzeugt einen vertikalen Menü-Knopf mit einheitlicher CSS-Klasse.
function createMenuButton(text, onClick) {
  const button = document.createElement("button");
  button.className = "menu-item-button";
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}
