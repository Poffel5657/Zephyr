// Formular-Editor für die Spieldaten (Items, Gegner, Techniken, …): links die Einträge, rechts die Werte.
// Die Formulare entstehen automatisch aus dem JSON: Zahl → Zahlenfeld, Text → Textfeld, Farbe → Farbwähler,
// Ja/Nein → Haken, Listen und Objekte verschachtelt. Jede Änderung landet sofort in gameData und wird geprüft.
import { data, markDirty, formatJson } from "./gameData.js";

// Bereiche im Editor. entries = die Datei ist eine Sammlung von Einträgen (id → Objekt)
export const SECTIONS = [
  { id: "items", file: "items.json", label: "Items", entries: true },
  { id: "enemies", file: "enemies.json", label: "Gegner", entries: true },
  { id: "techniques", file: "techniques.json", label: "Techniken", entries: true },
  { id: "tiles", file: "tileTypes.json", label: "Bodentypen", entries: true },
  { id: "chests", file: "chests.json", label: "Truhen", entries: true },
  { id: "character", file: "characters.json", label: "Charakter" },
  { id: "skills", file: "skills.json", label: "Skills" },
  { id: "rhythm", file: "rhythm.json", label: "Rhythmus" },
];

// Felder mit fester Auswahl (Name des Feldes → mögliche Werte)
const OPTIONS = {
  key: () => Object.keys(data["rhythm.json"].keys),
  item: () => Object.keys(data["items.json"]),
  log: () => Object.keys(data["items.json"]),
  skill: () => Object.keys(data["skills.json"].skills),
  shape: () => ["gust", "wisp", "crab"],
};

// Ausnahmen pro Datei: Bei Truhen ist "key" das Schlüssel-Item, keine Rhythmus-Taste
const FILE_OPTIONS = {
  "chests.json": { key: () => Object.keys(data["items.json"]) },
};

// Vorlagen, wenn man in einer Liste "+ Eintrag" drückt (sonst wird der letzte Eintrag kopiert)
const TEMPLATES = {
  pattern: () => ({ key: "up", after: 0.5, damage: 0.5 }),
  attackPatterns: () => [{ key: "up", after: 0.8, damage: 1 }],
  loot: () => ({ item: Object.keys(data["items.json"])[0], chance: 0.5, min: 1, max: 1 }),
  tags: () => "",
  codes: () => "",
};

// Kurze Erklärungen als Tooltip
const HINTS = {
  after: "Sekunden seit dem vorigen Takt",
  damage: "Anteil vom normalen Schaden (0.5 = halb)",
  chance: "0 bis 1 (0.8 = 80 %)",
  firstHit: "Faktor für den ersten Schlag",
  cooldown: "Gesperrte eigene Züge nach dem Benutzen",
  aggroRange: "Ab so vielen Feldern greift der Gegner an",
  attackRange: "1 = Nahkampf, mehr = Fernkampf",
  respawnSeconds: "Sekunden bis der Gegner wiederkommt",
  maxStack: "So viele passen auf einen Platz",
  heal: "So viele HP gibt das Essen",
  approachTime: "So lange ist ein Ring vorher sichtbar (Sekunden)",
  perfectWindow: "± Sekunden für Perfect",
  goodWindow: "± Sekunden für Good",
  levelFactor: "Level-Faktor = 1 + (Level − 1) × levelFactor (für HP, ZEP und Schaden)",
};

const FIELD_TYPES = { number: "Zahl", text: "Text", boolean: "Ja/Nein", list: "Liste" };

// Zeigt einen Bereich: bei Sammlungen links die Liste, rechts das Formular des gewählten Eintrags.
export function showSection(section, listBox, formBox) {
  listBox.replaceChildren();
  formBox.replaceChildren();
  listBox.hidden = !section.entries;
  // Ohne Eintrags-Liste bekommt das Formular die ganze Breite
  listBox.parentElement.classList.toggle("no-list", !section.entries);
  if (section.entries) {
    renderEntryList(section, listBox, formBox, Object.keys(data[section.file])[0]);
  } else {
    renderForm(section, formBox, null);
  }
}

// Liste der Einträge mit Neu / Kopieren / Löschen.
function renderEntryList(section, listBox, formBox, selectedId) {
  const entries = data[section.file];
  listBox.replaceChildren();

  const list = document.createElement("div");
  list.className = "entry-list";
  for (const [id, entry] of Object.entries(entries)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "entry";
    button.setAttribute("aria-pressed", String(id === selectedId));
    if (typeof entry.color === "string") {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.style.background = entry.color;
      button.append(chip);
    }
    button.append(entry.name ?? entry.label ?? id);
    const small = document.createElement("small");
    small.textContent = id;
    button.append(small);
    button.addEventListener("click", () => renderEntryList(section, listBox, formBox, id));
    list.append(button);
  }
  listBox.append(list);

  // Neue ID eingeben, dann "Neu" (Kopie des ersten Eintrags) oder "Kopieren" (Kopie des gewählten)
  const idInput = document.createElement("input");
  idInput.type = "text";
  idInput.placeholder = "neue_id";
  idInput.className = "entry-id-input";
  const row = document.createElement("div");
  row.className = "row";
  const create = (source) => {
    const id = idInput.value.trim();
    if (!/^[a-z0-9_]+$/.test(id) || entries[id] !== undefined) {
      idInput.setCustomValidity("Kleinbuchstaben, Zahlen und _ , noch nicht vergeben");
      idInput.reportValidity();
      return;
    }
    entries[id] = structuredClone(source);
    if (typeof entries[id].name === "string") {
      entries[id].name = id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    markDirty(section.file);
    renderEntryList(section, listBox, formBox, id);
  };
  idInput.addEventListener("input", () => idInput.setCustomValidity(""));
  row.append(
    makeButton("Neu", () => create(Object.values(entries)[0])),
    makeButton("Kopieren", () => selectedId && create(entries[selectedId])),
  );
  listBox.append(idInput, row);

  renderForm(section, formBox, selectedId, () => renderEntryList(section, listBox, formBox, null));
}

// Formular für einen Eintrag (oder die ganze Datei), mit Reiter Formular / JSON.
function renderForm(section, formBox, entryId, onDeleted) {
  formBox.replaceChildren();
  const target = entryId === null ? data[section.file] : data[section.file][entryId];
  if (target === undefined) {
    return;
  }

  const head = document.createElement("div");
  head.className = "form-head";
  const title = document.createElement("h2");
  title.textContent = entryId === null ? section.label : `${section.label}: ${entryId}`;
  head.append(title);

  const body = document.createElement("div");
  let mode = "form";
  const renderBody = () => {
    body.replaceChildren(mode === "form" ? renderObject(target, section.file) : renderJsonBox(section, entryId, target, renderBody));
  };
  const modeRow = document.createElement("div");
  modeRow.className = "seg";
  const formButton = makeButton("Formular", () => setMode("form"));
  const jsonButton = makeButton("JSON", () => setMode("json"));
  const setMode = (newMode) => {
    mode = newMode;
    formButton.setAttribute("aria-pressed", String(mode === "form"));
    jsonButton.setAttribute("aria-pressed", String(mode === "json"));
    renderBody();
  };
  modeRow.append(formButton, jsonButton);
  head.append(modeRow);

  if (entryId !== null) {
    // Löschen mit Rückfrage (zweiter Klick)
    const deleteButton = makeButton("Löschen", () => {
      if (deleteButton.dataset.armed !== "true") {
        deleteButton.dataset.armed = "true";
        deleteButton.textContent = "Wirklich löschen?";
        return;
      }
      delete data[section.file][entryId];
      markDirty(section.file);
      onDeleted();
    });
    deleteButton.classList.add("danger");
    head.append(deleteButton);
  }

  formBox.append(head, body);
  setMode("form");
}

// JSON-Ansicht: Text bearbeiten und mit "Übernehmen" zurück ins Formular.
function renderJsonBox(section, entryId, target, rerender) {
  const box = document.createElement("div");
  const text = document.createElement("textarea");
  text.className = "json-box";
  text.spellcheck = false;
  text.value = formatJson(target);
  const error = document.createElement("p");
  error.className = "message error";
  const apply = makeButton("Übernehmen", () => {
    let parsed;
    try {
      parsed = JSON.parse(text.value);
    } catch (problem) {
      error.textContent = "Kein gültiges JSON: " + problem.message;
      return;
    }
    // Inhalt ersetzen, das Objekt selbst bleibt (andere Teile des Editors halten es fest)
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, parsed);
    markDirty(section.file);
    error.textContent = "";
    rerender();
  });
  apply.classList.add("primary");
  box.append(text, apply, error);
  return box;
}

// Ein Objekt als Liste von Feldern, dazu "+ Feld" für neue Werte (z. B. "heal" bei einem Item).
function renderObject(object, file) {
  const box = document.createElement("div");
  box.className = "fields";
  const draw = () => {
    box.replaceChildren();
    for (const key of Object.keys(object)) {
      const row = document.createElement("div");
      row.className = "field-row";
      const label = document.createElement("label");
      label.textContent = key;
      if (HINTS[key]) label.title = HINTS[key];
      const remove = makeButton("×", () => {
        delete object[key];
        markDirty(file);
        draw();
      });
      remove.className = "icon";
      remove.title = `Feld "${key}" entfernen`;
      const set = (newValue) => {
        object[key] = newValue;
        markDirty(file);
      };
      row.append(label, renderValue(object[key], key, file, set), remove);
      box.append(row);
    }
    box.append(renderAddField(object, file, draw));
  };
  draw();
  return box;
}

// Ein Feld: passendes Eingabefeld je nach Typ, Listen und Objekte verschachtelt.
// key = Name des Feldes (für Auswahlfelder und Vorlagen), set(neuerWert) schreibt einfache Werte zurück.
function renderValue(value, key, file, set) {
  if (Array.isArray(value)) {
    return renderList(value, key, file);
  }
  if (value !== null && typeof value === "object") {
    return renderObject(value, file);
  }
  if (typeof value === "boolean") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = value;
    input.addEventListener("change", () => set(input.checked));
    return input;
  }
  if (typeof value === "number") {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = String(value);
    input.addEventListener("input", () => {
      if (input.value !== "" && Number.isFinite(Number(input.value))) set(Number(input.value));
    });
    return input;
  }
  const options = (FILE_OPTIONS[file]?.[key] ?? OPTIONS[key])?.();
  if (options !== undefined) {
    const select = document.createElement("select");
    for (const option of new Set([...options, value])) {
      const element = document.createElement("option");
      element.value = option;
      element.textContent = option;
      select.append(element);
    }
    select.value = value;
    select.addEventListener("change", () => set(select.value));
    return select;
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    const wrap = document.createElement("div");
    wrap.className = "color-field";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = value;
    const text = document.createElement("input");
    text.type = "text";
    text.value = value;
    picker.addEventListener("input", () => {
      text.value = picker.value;
      set(picker.value);
    });
    text.addEventListener("input", () => {
      set(text.value);
      if (/^#[0-9a-f]{6}$/i.test(text.value)) picker.value = text.value;
    });
    wrap.append(picker, text);
    return wrap;
  }
  const input = document.createElement("input");
  input.type = "text";
  input.value = value ?? "";
  input.addEventListener("input", () => set(input.value));
  return input;
}

// Eine Liste: jedes Element mit "×", unten "+ Eintrag".
function renderList(list, key, file) {
  const box = document.createElement("div");
  box.className = "list";
  const draw = () => {
    box.replaceChildren();
    list.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "list-row";
      const number = document.createElement("span");
      number.className = "list-index";
      number.textContent = String(index + 1);
      const remove = makeButton("×", () => {
        list.splice(index, 1);
        markDirty(file);
        draw();
      });
      remove.className = "icon";
      // Elemente einer Liste haben keinen eigenen Namen: für Auswahlfelder zählt der Name der Liste (z. B. tags)
      const set = (newValue) => {
        list[index] = newValue;
        markDirty(file);
      };
      row.append(number, renderValue(item, key, file, set), remove);
      box.append(row);
    });
    box.append(
      makeButton("+ Eintrag", () => {
        const template = TEMPLATES[key]?.() ?? (list.length > 0 ? structuredClone(list[list.length - 1]) : "");
        list.push(template);
        markDirty(file);
        draw();
      }),
    );
  };
  draw();
  return box;
}

// "+ Feld": Name und Typ wählen, dann hinzufügen.
function renderAddField(object, file, redraw) {
  const row = document.createElement("div");
  row.className = "add-field";
  const name = document.createElement("input");
  name.type = "text";
  name.placeholder = "neues Feld";
  const type = document.createElement("select");
  for (const [value, label] of Object.entries(FIELD_TYPES)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    type.append(option);
  }
  const add = makeButton("+ Feld", () => {
    const key = name.value.trim();
    if (key === "" || object[key] !== undefined) return;
    object[key] = { number: 0, text: "", boolean: false, list: [] }[type.value];
    markDirty(file);
    redraw();
  });
  row.append(name, type, add);
  return row;
}

function makeButton(text, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}
