// Vite-Plugin für den Game-Editor: liest und schreibt die Spieldaten in src/data/ (nur im Dev-Server).
//   GET  /__editor/data → { "items.json": "<Text>", "maps/start-island.json": "<Text>", … }
//   POST /__editor/save  { file: "items.json", text: "<JSON-Text>" } → schreibt die Datei
// Erlaubt sind nur JSON-Dateien, die es in src/data/ (oder src/data/maps/) schon gibt.
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("src/data");
const FILE_PATTERN = /^(maps\/)?[a-z0-9_-]+\.json$/;

export function gameEditorPlugin() {
  return {
    name: "zephyr-game-editor",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__editor/data", (request, response) => {
        if (request.method !== "GET") {
          return sendError(response, 405, "Nur GET");
        }
        const files = {};
        for (const file of listDataFiles()) {
          files[file] = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
        }
        sendJson(response, 200, files);
      });

      server.middlewares.use("/__editor/save", async (request, response) => {
        if (request.method !== "POST") {
          return sendError(response, 405, "Nur POST");
        }
        let body;
        try {
          body = JSON.parse(await readBody(request));
        } catch {
          return sendError(response, 400, "Anfrage ist kein JSON");
        }
        const { file, text } = body;
        if (typeof file !== "string" || !FILE_PATTERN.test(file) || !listDataFiles().includes(file)) {
          return sendError(response, 400, `Datei nicht erlaubt: ${file}`);
        }
        try {
          JSON.parse(text);
        } catch (error) {
          return sendError(response, 400, `Kein gültiges JSON: ${error.message}`);
        }
        fs.writeFileSync(path.join(DATA_DIR, file), text.endsWith("\n") ? text : text + "\n");
        sendJson(response, 200, { saved: file });
      });
    },
  };
}

// Alle JSON-Dateien in src/data/ und src/data/maps/ (relativ zu src/data).
function listDataFiles() {
  const files = fs.readdirSync(DATA_DIR).filter((name) => name.endsWith(".json"));
  const maps = fs.readdirSync(path.join(DATA_DIR, "maps")).filter((name) => name.endsWith(".json"));
  return [...files, ...maps.map((name) => "maps/" + name)];
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => resolve(text));
    request.on("error", reject);
  });
}

function sendJson(response, status, data) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(data));
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}
