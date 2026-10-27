// Zeigt kleine Lebensbalken über den Charakteren während des Kampfes an.
import "./ui.css";
import * as THREE from "three";
import { addUpdate } from "../core/loop.js";
import { on } from "../core/eventBus.js";
import { getMaxHp } from "../character/character.js";

const HIDDEN_CLASS = "hpbar-hidden";

// Erzeugt Lebensbalken für Spieler und Gegner und positioniert sie jeden Frame über dem 3D-Mesh.
export function createHpBars(player, enemies, camera) {
  let inCombat = false;
  const vector = new THREE.Vector3();
  const barEntries = [];

  // Legt ein HTML-Balkenelement für einen Kämpfer an
  function createBar(character) {
    const bar = document.createElement("div");
    bar.className = "hpbar " + HIDDEN_CLASS;
    bar.style.transform = "translate(-50%, -100%)";

    const fill = document.createElement("div");
    fill.className = "hpbar-fill";
    bar.appendChild(fill);

    document.body.appendChild(bar);
    return { character, bar, fill };
  }

  // Gibt den passenden Balken zurück oder erstellt ihn bei Bedarf
  function getOrCreateEntry(character) {
    let entry = barEntries.find((item) => item.character === character);
    if (!entry) {
      entry = createBar(character);
      barEntries.push(entry);
    }
    return entry;
  }

  // Berechnet die Breite und Farbe des Lebensbalkens neu
  function updateFill(entry) {
    const maxHp = getMaxHp(entry.character);
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, entry.character.hp / maxHp)) : 0;
    entry.fill.style.width = `${ratio * 100}%`;
    if (ratio < 0.3) {
      entry.fill.classList.add("hpbar-fill-low");
    } else {
      entry.fill.classList.remove("hpbar-fill-low");
    }
  }

  // Initiale Kämpfer registrieren
  getOrCreateEntry(player);
  if (Array.isArray(enemies)) {
    for (const enemy of enemies) {
      getOrCreateEntry(enemy);
    }
  }

  on("combatStarted", (data) => {
    inCombat = true;
    if (data?.enemies) {
      for (const enemy of data.enemies) {
        getOrCreateEntry(enemy);
      }
    }
    for (const entry of barEntries) {
      updateFill(entry);
    }
  });

  on("combatEnded", () => {
    inCombat = false;
    for (const entry of barEntries) {
      entry.bar.classList.add(HIDDEN_CLASS);
    }
  });

  on("hpChanged", (data) => {
    const entry = barEntries.find((item) => item.character === data.character);
    if (entry) {
      updateFill(entry);
    }
  });

  // Aktualisiert in jedem Frame Position und Sichtbarkeit relativ zur Kamera
  addUpdate(() => {
    if (!inCombat) {
      return;
    }

    for (const entry of barEntries) {
      const { character, bar } = entry;
      const isAlive = character === player || character.alive !== false;

      if (!isAlive || !character.mesh) {
        bar.classList.add(HIDDEN_CLASS);
        continue;
      }

      vector.set(
        character.mesh.position.x,
        character.mesh.position.y + 0.9,
        character.mesh.position.z
      );
      vector.project(camera);

      // Hinter der Kamera ausblenden
      if (vector.z > 1) {
        bar.classList.add(HIDDEN_CLASS);
        continue;
      }

      const screenX = ((vector.x + 1) / 2) * window.innerWidth;
      const screenY = ((1 - vector.y) / 2) * window.innerHeight;

      bar.style.transform = "translate(-50%, -100%)";
      bar.style.left = `${screenX}px`;
      bar.style.top = `${screenY}px`;
      bar.classList.remove(HIDDEN_CLASS);
    }
  });
}
