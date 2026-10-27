import "./editor.css";
import TILE_TYPES from "../data/tileTypes.json";

/*
  Zephyr Map-Editor
  -----------------
  Eine Map ist ein Raster aus Feldern (1 Feld = 1 Meter).
  map.tiles[z][x] ist entweder:
    null                                        -> Luft (hier ist keine Insel)
    { height: 1-8, type: "grass" }              -> ein Feld
    { height: 2, type: "grass", object: "tree" } -> ein Feld mit Objekt drauf

  x = nach rechts, z = nach unten (in 3D später: nach vorne).
*/

// ---------- Einstellungen ----------

// Bodentypen kommen aus einer gemeinsamen Datei, die auch das Spiel benutzt
const TYPES = TILE_TYPES;

const OBJECTS = {
  tree: "Baum",
  rock: "Fels",
};

const TOOLS = {
  paint: "Malen",
  raise: "Höher",
  lower: "Tiefer",
  object: "Objekt",
  erase: "Radieren",
};

const MIN_HEIGHT = 1;
const MAX_HEIGHT = 8;
const MIN_SIZE = 4;
const MAX_SIZE = 64;
const STORAGE_KEY = "zephyr-editor-map";

// ---------- Map-Daten ----------

function emptyTiles(width, depth) {
  return Array.from({ length: depth }, () => Array(width).fill(null));
}

function createEmptyMap(width, depth, name) {
  return { name, width, depth, tiles: emptyTiles(width, depth) };
}

// Kleine Beispiel-Insel, damit man direkt etwas sieht
function createSampleMap() {
  const map = createEmptyMap(14, 14, "Beispielinsel");
  const center = 6.5;

  for (let z = 0; z < map.depth; z++) {
    for (let x = 0; x < map.width; x++) {
      const dist = Math.hypot(x - center, z - center);
      if (dist > 6) continue;
      const height = dist < 2 ? 3 : dist < 4 ? 2 : 1;
      const type = dist > 5 ? "sand" : "grass";
      map.tiles[z][x] = { height, type };
    }
  }

  for (const [x, z] of [
    [4, 5],
    [5, 8],
    [9, 4],
    [8, 9],
    [3, 7],
  ]) {
    map.tiles[z][x].object = "tree";
  }
  map.tiles[6][7] = { height: 3, type: "stone", object: "rock" };
  map.tiles[9][10] = { height: 1, type: "water" };
  map.tiles[10][10] = { height: 1, type: "water" };
  map.tiles[10][9] = { height: 1, type: "water" };

  return map;
}

// JSON so schreiben, dass jede Reihe in einer Zeile steht (besser lesbar)
function mapToJSON(map) {
  const rows = map.tiles.map((row) => "    " + JSON.stringify(row));
  return (
    "{\n" +
    `  "name": ${JSON.stringify(map.name)},\n` +
    `  "width": ${map.width},\n` +
    `  "depth": ${map.depth},\n` +
    // Gegner-Startfelder werden (noch) nicht im Editor bearbeitet, aber beim Speichern behalten
    (map.enemies ? `  "enemies": ${JSON.stringify(map.enemies)},\n` : "") +
    '  "tiles": [\n' +
    rows.join(",\n") +
    "\n  ]\n}\n"
  );
}

// JSON lesen und prüfen, ob es eine gültige Map ist
function parseMap(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Das ist kein gültiges JSON.");
  }
  if (!data || !Array.isArray(data.tiles)) {
    throw new Error('In der Datei fehlt "tiles".');
  }

  const depth = data.tiles.length;
  const width =
    depth > 0 && Array.isArray(data.tiles[0]) ? data.tiles[0].length : 0;
  if (
    width < MIN_SIZE ||
    depth < MIN_SIZE ||
    width > MAX_SIZE ||
    depth > MAX_SIZE
  ) {
    throw new Error(
      `Breite und Tiefe müssen zwischen ${MIN_SIZE} und ${MAX_SIZE} liegen.`,
    );
  }

  const tiles = data.tiles.map((row, z) => {
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error(`Reihe ${z} hat nicht genau ${width} Felder.`);
    }
    return row.map((tile, x) => {
      if (tile === null) return null;
      if (!tile || !TYPES[tile.type]) {
        throw new Error(`Feld (x ${x}, z ${z}) hat einen unbekannten Typ.`);
      }
      const height = Math.round(Number(tile.height));
      if (!(height >= MIN_HEIGHT && height <= MAX_HEIGHT)) {
        throw new Error(
          `Feld (x ${x}, z ${z}): Höhe muss zwischen ${MIN_HEIGHT} und ${MAX_HEIGHT} liegen.`,
        );
      }
      const clean = { height, type: tile.type };
      if (tile.object && OBJECTS[tile.object]) clean.object = tile.object;
      return clean;
    });
  });

  const map = { name: String(data.name || "Insel"), width, depth, tiles };
  if (Array.isArray(data.enemies)) {
    map.enemies = data.enemies;
  }
  return map;
}

function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Speichern im Browser geht nicht (z.B. privates Fenster). Nicht schlimm.
  }
}

function loadLocal() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text ? parseMap(text) : null;
  } catch {
    return null;
  }
}

// ---------- Zustand ----------

let map = loadLocal() || createSampleMap();
let tool = "paint";
let currentType = "grass";
let currentObject = "tree";
let showHeights = true;

let undoStack = [];
let painting = false;
let stroke = null; // Felder, die im aktuellen Strich schon bearbeitet wurden
let strokeStart = null;
let hoverCell = null;
let cell = 32; // Pixel pro Feld

// ---------- Elemente ----------

const $ = (id) => document.getElementById(id);
const canvas = $("map-canvas");
const ctx = canvas.getContext("2d");
const canvasWrap = $("canvas-wrap");
const nameInput = $("map-name");
const widthInput = $("map-width");
const depthInput = $("map-depth");
const jsonText = $("json-text");
const message = $("message");
const undoButton = $("undo");
const clearButton = $("clear");
const downloadButton = $("download");

// ---------- Zeichnen ----------

function token(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

// Farbe a Richtung Farbe b mischen (amount 0 bis 1)
function mix(a, b, amount) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const channel = (shift) => {
    const ca = (pa >> shift) & 255;
    const cb = (pb >> shift) & 255;
    return Math.round(ca + (cb - ca) * amount);
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

function tileAt(x, z) {
  if (x < 0 || z < 0 || x >= map.width || z >= map.depth) return null;
  return map.tiles[z][x];
}

function layoutCanvas() {
  const available = canvasWrap.clientWidth - 22;
  cell = Math.floor(Math.min(40, Math.max(14, available / map.width)));
  const w = cell * map.width;
  const h = cell * map.depth;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw() {
  const airColor = token("--air");
  const gridColor = token("--grid");
  const accent = token("--accent");
  const w = cell * map.width;
  const h = cell * map.depth;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = airColor;
  ctx.fillRect(0, 0, w, h);

  for (let z = 0; z < map.depth; z++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[z][x];
      if (tile) drawTile(tile, x, z);
    }
  }

  // Rasterlinien
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= map.width; x++) {
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, h);
  }
  for (let z = 0; z <= map.depth; z++) {
    ctx.moveTo(0, z * cell + 0.5);
    ctx.lineTo(w, z * cell + 0.5);
  }
  ctx.stroke();

  // Kanten zeichnen, wo es nach unten geht (wie Klippen)
  for (let z = 0; z < map.depth; z++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[z][x];
      if (tile) drawEdges(tile, x, z);
    }
  }

  if (hoverCell) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      hoverCell.x * cell + 1,
      hoverCell.z * cell + 1,
      cell - 2,
      cell - 2,
    );
  }
}

function drawTile(tile, x, z) {
  const px = x * cell;
  const pz = z * cell;
  const base = TYPES[tile.type].color;
  // Je höher, desto heller
  const lift = ((tile.height - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT)) * 0.55;
  ctx.fillStyle = mix(base, "#ffffff", lift);
  ctx.fillRect(px, pz, cell, cell);

  if (tile.object === "tree") {
    const r = cell * 0.3;
    ctx.fillStyle = "#2c5a27";
    ctx.beginPath();
    ctx.arc(px + cell / 2, pz + cell / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3f7a37";
    ctx.beginPath();
    ctx.arc(
      px + cell / 2 - r * 0.25,
      pz + cell / 2 - r * 0.25,
      r * 0.55,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  } else if (tile.object === "rock") {
    const cx = px + cell / 2;
    const cz = pz + cell / 2;
    const s = cell * 0.3;
    ctx.fillStyle = "#585f66";
    ctx.beginPath();
    ctx.moveTo(cx - s, cz + s * 0.6);
    ctx.lineTo(cx - s * 0.6, cz - s * 0.7);
    ctx.lineTo(cx + s * 0.3, cz - s);
    ctx.lineTo(cx + s, cz - s * 0.1);
    ctx.lineTo(cx + s * 0.7, cz + s * 0.8);
    ctx.closePath();
    ctx.fill();
  }

  if (showHeights && cell >= 18) {
    ctx.fillStyle =
      tile.type === "water" ? "rgba(255,255,255,0.85)" : "rgba(20,28,36,0.7)";
    ctx.font = `600 ${Math.round(cell * 0.32)}px ${token("--font-mono") || "monospace"}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(tile.height), px + 3, pz + 2);
  }
}

function drawEdges(tile, x, z) {
  const px = x * cell;
  const pz = z * cell;
  const sides = [
    { dx: 0, dz: -1, x1: px, z1: pz, x2: px + cell, z2: pz },
    { dx: 1, dz: 0, x1: px + cell, z1: pz, x2: px + cell, z2: pz + cell },
    { dx: 0, dz: 1, x1: px, z1: pz + cell, x2: px + cell, z2: pz + cell },
    { dx: -1, dz: 0, x1: px, z1: pz, x2: px, z2: pz + cell },
  ];
  ctx.strokeStyle = "rgba(15, 22, 28, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const side of sides) {
    const neighbor = tileAt(x + side.dx, z + side.dz);
    if (!neighbor || neighbor.height < tile.height) {
      ctx.moveTo(side.x1, side.z1);
      ctx.lineTo(side.x2, side.z2);
    }
  }
  ctx.stroke();
}

// ---------- Werkzeuge ----------

function applyTool(c) {
  const key = c.x + "," + c.z;
  if (stroke.has(key)) return; // pro Strich jedes Feld nur einmal
  stroke.add(key);

  const tile = map.tiles[c.z][c.x];

  if (tool === "paint") {
    if (!tile) {
      map.tiles[c.z][c.x] = { height: MIN_HEIGHT, type: currentType };
    } else {
      tile.type = currentType;
      if (currentType === "water") delete tile.object;
    }
  } else if (tool === "raise") {
    if (!tile) {
      map.tiles[c.z][c.x] = { height: MIN_HEIGHT, type: "grass" };
    } else {
      tile.height = Math.min(MAX_HEIGHT, tile.height + 1);
    }
  } else if (tool === "lower") {
    if (tile) tile.height = Math.max(MIN_HEIGHT, tile.height - 1);
  } else if (tool === "object") {
    if (tile && tile.type !== "water") {
      if (currentObject === "none") delete tile.object;
      else tile.object = currentObject;
    }
  } else if (tool === "erase") {
    map.tiles[c.z][c.x] = null;
  }

  draw();
  updateStats();
  updateHoverInfo();
}

function cellAt(event) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * map.width);
  const z = Math.floor(((event.clientY - rect.top) / rect.height) * map.depth);
  if (x < 0 || z < 0 || x >= map.width || z >= map.depth) return null;
  return { x, z };
}

canvas.addEventListener("pointerdown", (event) => {
  const c = cellAt(event);
  if (!c) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  painting = true;
  stroke = new Set();
  strokeStart = JSON.stringify(map);
  hoverCell = c;
  applyTool(c);
});

canvas.addEventListener("pointermove", (event) => {
  const c = cellAt(event);
  const same = c && hoverCell && c.x === hoverCell.x && c.z === hoverCell.z;
  if (!same) {
    hoverCell = c;
    if (painting && c) applyTool(c);
    else draw();
    updateHoverInfo();
  }
});

function endStroke() {
  if (!painting) return;
  painting = false;
  stroke = null;
  // Nur einen Undo-Schritt merken, wenn sich wirklich etwas geändert hat
  if (JSON.stringify(map) !== strokeStart) {
    pushUndo(strokeStart);
    changed();
  }
  strokeStart = null;
}

canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);
canvas.addEventListener("pointerleave", (event) => {
  if (painting || event.pointerType === "touch") return;
  hoverCell = null;
  draw();
  updateHoverInfo();
});

// ---------- Rückgängig ----------

function pushUndo(snapshot) {
  undoStack.push(snapshot);
  if (undoStack.length > 60) undoStack.shift();
  undoButton.disabled = false;
}

function undo() {
  const snapshot = undoStack.pop();
  if (!snapshot) return;
  map = JSON.parse(snapshot);
  undoButton.disabled = undoStack.length === 0;
  syncInputs();
  layoutCanvas();
  changed();
  showMessage("Rückgängig gemacht.");
}

// ---------- Oberfläche ----------

function changed() {
  saveLocal();
  refreshJSON();
  updateStats();
}

function refreshJSON() {
  if (document.activeElement !== jsonText) jsonText.value = mapToJSON(map);
}

function updateStats() {
  let tiles = 0;
  let trees = 0;
  let rocks = 0;
  let top = 0;
  for (const row of map.tiles) {
    for (const tile of row) {
      if (!tile) continue;
      tiles++;
      if (tile.object === "tree") trees++;
      if (tile.object === "rock") rocks++;
      top = Math.max(top, tile.height);
    }
  }
  $("status").textContent =
    `${map.width} × ${map.depth} Felder · ${tiles} Inselfelder · ${trees} Bäume · ${rocks} Felsen` +
    (tiles ? ` · höchste Stufe ${top}` : "");
}

function updateHoverInfo() {
  const info = $("hover-info");
  if (!hoverCell) {
    info.textContent = " ";
    return;
  }
  const tile = map.tiles[hoverCell.z][hoverCell.x];
  const where = `x ${hoverCell.x}, z ${hoverCell.z}`;
  if (!tile) {
    info.textContent = `${where}: Luft`;
    return;
  }
  const obj = tile.object ? `, ${OBJECTS[tile.object]}` : "";
  info.textContent = `${where}: ${TYPES[tile.type].label}, Stufe ${tile.height}${obj}`;
}

let messageTimer = null;
function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
  clearTimeout(messageTimer);
  messageTimer = setTimeout(
    () => {
      message.textContent = "";
    },
    isError ? 7000 : 3000,
  );
}

function syncInputs() {
  nameInput.value = map.name;
  widthInput.value = map.width;
  depthInput.value = map.depth;
}

function setTool(name) {
  tool = name;
  for (const button of document.querySelectorAll("[data-tool]")) {
    button.setAttribute("aria-pressed", String(button.dataset.tool === name));
  }
  $("type-section").hidden = name !== "paint";
  $("object-section").hidden = name !== "object";
}

function setType(name) {
  currentType = name;
  for (const button of document.querySelectorAll("[data-type]")) {
    button.setAttribute("aria-pressed", String(button.dataset.type === name));
  }
}

function setObject(name) {
  currentObject = name;
  for (const button of document.querySelectorAll("[data-object]")) {
    button.setAttribute("aria-pressed", String(button.dataset.object === name));
  }
}

function loadMap(newMap, text) {
  pushUndo(JSON.stringify(map));
  map = newMap;
  syncInputs();
  layoutCanvas();
  changed();
  showMessage(text);
}

function clampSize(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));
}

function resizeMap() {
  const width = clampSize(widthInput.value);
  const depth = clampSize(depthInput.value);
  if (!width || !depth) {
    showMessage("Bitte Zahlen für Breite und Tiefe eingeben.", true);
    return;
  }
  if (width === map.width && depth === map.depth) return;
  pushUndo(JSON.stringify(map));
  const tiles = emptyTiles(width, depth);
  for (let z = 0; z < Math.min(depth, map.depth); z++) {
    for (let x = 0; x < Math.min(width, map.width); x++) {
      tiles[z][x] = map.tiles[z][x];
    }
  }
  map.width = width;
  map.depth = depth;
  map.tiles = tiles;
  syncInputs();
  layoutCanvas();
  changed();
  showMessage(`Größe jetzt ${width} × ${depth}.`);
}

function fileName() {
  const slug = map.name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (slug || "insel") + ".json";
}

// ---------- Aufbau ----------

function buildButtons() {
  const toolBox = $("tool-buttons");
  for (const [name, label] of Object.entries(TOOLS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tool = name;
    button.textContent = label;
    button.addEventListener("click", () => setTool(name));
    toolBox.append(button);
  }

  const typeBox = $("type-buttons");
  for (const [name, info] of Object.entries(TYPES)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.type = name;
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.style.background = info.color;
    button.append(chip, info.label);
    button.addEventListener("click", () => setType(name));
    typeBox.append(button);
  }

  const objectBox = $("object-buttons");
  for (const [name, label] of [
    ...Object.entries(OBJECTS),
    ["none", "Entfernen"],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.object = name;
    button.textContent = label;
    button.addEventListener("click", () => setObject(name));
    objectBox.append(button);
  }
}

function init() {
  buildButtons();
  setTool("paint");
  setType("grass");
  setObject("tree");
  syncInputs();
  undoButton.disabled = true;

  // In einer eingebetteten Vorschau gehen Downloads nicht, also Knopf ausblenden
  let inFrame = true;
  try {
    inFrame = window.self !== window.top;
  } catch {
    inFrame = true;
  }
  if (inFrame) downloadButton.hidden = true;

  nameInput.addEventListener("input", () => {
    map.name = nameInput.value;
    changed();
  });

  $("apply-size").addEventListener("click", resizeMap);
  for (const input of [widthInput, depthInput]) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") resizeMap();
    });
  }

  $("show-heights").checked = showHeights;
  $("show-heights").addEventListener("change", (event) => {
    showHeights = event.target.checked;
    draw();
  });

  undoButton.addEventListener("click", undo);

  // Leeren mit zweitem Klick bestätigen
  let clearArmed = null;
  clearButton.addEventListener("click", () => {
    if (!clearArmed) {
      clearButton.textContent = "Wirklich leeren?";
      clearButton.classList.add("danger-armed");
      clearArmed = setTimeout(() => {
        clearButton.textContent = "Alles leeren";
        clearButton.classList.remove("danger-armed");
        clearArmed = null;
      }, 3000);
      return;
    }
    clearTimeout(clearArmed);
    clearArmed = null;
    clearButton.textContent = "Alles leeren";
    clearButton.classList.remove("danger-armed");
    loadMap(
      createEmptyMap(map.width, map.depth, map.name),
      'Karte geleert. Mit „Rückgängig" holst du sie zurück.',
    );
  });

  $("sample").addEventListener("click", () => {
    loadMap(createSampleMap(), "Beispielinsel geladen.");
  });

  $("copy").addEventListener("click", () => {
    const text = mapToJSON(map);
    jsonText.value = text;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showMessage("JSON kopiert."),
        () => {
          jsonText.select();
          showMessage("Text ist markiert. Jetzt mit Strg+C kopieren.");
        },
      );
    } else {
      jsonText.select();
      showMessage("Text ist markiert. Jetzt mit Strg+C kopieren.");
    }
  });

  downloadButton.addEventListener("click", () => {
    const blob = new Blob([mapToJSON(map)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName();
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showMessage(`Gespeichert als ${fileName()}.`);
  });

  $("open-file").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        loadMap(parseMap(String(reader.result)), `${file.name} geladen.`);
      } catch (error) {
        showMessage(error.message, true);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  });

  $("load-text").addEventListener("click", () => {
    try {
      loadMap(parseMap(jsonText.value), "Karte aus dem Textfeld geladen.");
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  document.addEventListener("keydown", (event) => {
    const typing = ["INPUT", "TEXTAREA"].includes(
      document.activeElement?.tagName,
    );
    if (typing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }
  });

  new ResizeObserver(() => layoutCanvas()).observe(canvasWrap);
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", draw);
  new MutationObserver(draw).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  layoutCanvas();
  changed();
  updateHoverInfo();
}

init();
