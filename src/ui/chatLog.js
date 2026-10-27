// Chat / Log unten links (wie die OSRS-Chatbox): alles, was im Spiel passiert, bleibt hier nachlesbar.
// Arten (kind) bekommen eigene Farben: "info", "combat", "loot", "level", "warning".
// Einklappbar: dann ist nur die letzte Zeile zu sehen.
import "./ui.css";
import "./chatLog.css";

// So viele Zeilen bleiben stehen, ältere fallen weg
const MAX_LINES = 50;
const COLLAPSED_CLASS = "chat-collapsed";

let list = null;
// Zeilen, die kommen, bevor das Fenster gebaut ist (z. B. beim Laden)
const waiting = [];

// Baut das Fenster (einmal beim Start).
export function createChatLog() {
  const panel = document.createElement("div");
  panel.className = "ui-panel chat";

  const head = document.createElement("div");
  head.className = "chat-head";
  const title = document.createElement("span");
  title.textContent = "Log";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "chat-toggle";
  toggle.textContent = "–";
  toggle.title = "Collapse";
  toggle.addEventListener("click", () => {
    const collapsed = panel.classList.toggle(COLLAPSED_CLASS);
    toggle.textContent = collapsed ? "+" : "–";
    toggle.title = collapsed ? "Expand" : "Collapse";
    scrollToEnd();
  });
  head.append(title, toggle);

  list = document.createElement("div");
  list.className = "chat-list";
  panel.append(head, list);
  document.body.appendChild(panel);

  for (const { text, kind } of waiting.splice(0)) {
    logMessage(text, kind);
  }
}

// Schreibt eine Zeile ins Log.
export function logMessage(text, kind = "info") {
  if (list === null) {
    waiting.push({ text, kind });
    return;
  }
  const line = document.createElement("div");
  line.className = "chat-line chat-" + kind;
  line.textContent = text;
  list.appendChild(line);
  while (list.children.length > MAX_LINES) {
    list.removeChild(list.firstChild);
  }
  scrollToEnd();
}

// Neueste Zeile unten sichtbar halten.
function scrollToEnd() {
  list.scrollTop = list.scrollHeight;
}
