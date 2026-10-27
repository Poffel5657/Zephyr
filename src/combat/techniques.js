// Kampf-Techniken: Welt-Skills schalten sie bei festen Leveln frei (z. B. Woodcutting Lv 5 → Cleave).
// Jede Technik hat ein Rhythmus-Muster und kann eine Abklingzeit in Runden haben. Werte in techniques.json.
import TECHNIQUES from "../data/techniques.json";
import { emit, on } from "../core/eventBus.js";
import { getLevel } from "../skills/skills.js";
import { hasToolFor } from "../inventory/inventory.js";
import { showMessage } from "../ui/messages.js";

// Gibt die Daten einer Technik zurück (mit id), z. B. getTechnique("cleave").
export function getTechnique(techniqueId) {
  return { id: techniqueId, ...TECHNIQUES[techniqueId] };
}

// Prüft, ob der Charakter die Technik benutzen kann: Skill-Level erreicht und (falls nötig) Werkzeug dabei.
// Die Abklingzeit zählt hier nicht mit, dafür gibt es getCooldown.
export function hasTechnique(character, techniqueId) {
  const technique = TECHNIQUES[techniqueId];
  if (technique === undefined) {
    return false;
  }
  if (technique.skill === undefined) {
    return true;
  }
  const levelReached = getLevel(character.skills[technique.skill] ?? 0) >= technique.level;
  const toolOk = !technique.tool || hasToolFor(character.inventory, technique.skill);
  return levelReached && toolOk;
}

// Gibt alle Techniken zurück, die der Charakter gerade hat ("attack" immer zuerst).
export function getTechniques(character) {
  return Object.keys(TECHNIQUES)
    .filter((techniqueId) => hasTechnique(character, techniqueId))
    .map(getTechnique);
}

// Wie viele eigene Züge die Technik noch gesperrt ist (0 = frei).
export function getCooldown(character, techniqueId) {
  return character.cooldowns?.[techniqueId] ?? 0;
}

// Sperrt die Technik nach dem Benutzen für "cooldown" eigene Züge (Cleave: der nächste und übernächste Zug).
export function startCooldown(character, techniqueId) {
  const cooldown = TECHNIQUES[techniqueId].cooldown ?? 0;
  if (cooldown > 0) {
    character.cooldowns ??= {};
    character.cooldowns[techniqueId] = cooldown;
    // Am Anfang des nächsten eigenen Zuges noch nicht herunterzählen, der zählt als erster gesperrter Zug
    character.freshCooldowns ??= new Set();
    character.freshCooldowns.add(techniqueId);
  }
}

// Zählt am Anfang jedes eigenen Zuges alle Abklingzeiten um 1 herunter (außer gerade erst gestartete).
export function tickCooldowns(character) {
  for (const techniqueId of Object.keys(character.cooldowns ?? {})) {
    if (character.freshCooldowns?.has(techniqueId)) {
      character.freshCooldowns.delete(techniqueId);
    } else {
      character.cooldowns[techniqueId] = Math.max(0, character.cooldowns[techniqueId] - 1);
    }
  }
}

// Setzt alle Abklingzeiten zurück (nach dem Kampf).
function resetCooldowns(character) {
  character.cooldowns = {};
  character.freshCooldowns = new Set();
}

// Meldet "New technique: …", wenn ein Skill-Level-Up eine Technik freischaltet.
// Nach setupCharacterEvents aufrufen, damit diese Meldung als letzte stehen bleibt.
export function setupTechniqueEvents(character) {
  on("skillLevelUp", (data) => {
    if (data.character !== character) {
      return;
    }
    const oldLevel = data.level - data.levelsGained;
    for (const technique of Object.values(TECHNIQUES)) {
      if (technique.skill === data.skill && technique.level > oldLevel && technique.level <= data.level) {
        // Ohne Werkzeug ist die Technik noch nicht benutzbar
        const note = technique.tool && !hasToolFor(character.inventory, technique.skill) ? " (needs a tool)" : "";
        showMessage(`New technique: ${technique.name}${note}`);
      }
    }
  });
  on("combatEnded", (data) => {
    if (data.player === character) {
      resetCooldowns(character);
    }
  });

  // Eine Technik gibt XP in ihren Skill: xp fürs Benutzen + xpPerHit pro getroffenem Takt
  on("comboEnded", (data) => {
    const technique = TECHNIQUES[data.technique];
    if (data.attacker !== character || technique.skill === undefined) {
      return;
    }
    const beatsHit = data.results.filter((result) => result !== "miss").length;
    emit("xpGained", { character, skill: technique.skill, amount: technique.xp + technique.xpPerHit * beatsHit });
  });
}
