// Verwaltet Grundwerte und Charakter-Level: Skill-Level-Ups zählen, Punkte vergeben und verteilen.
// Startwerte und Regeln stehen in characters.json.
import CHARACTER_DATA from "../data/characters.json";
import { emit, on } from "../core/eventBus.js";

// Erstellt die Charakter-Werte für einen Charakter aus characters.json (z. B. "hero").
export function createCharacterStats(characterId) {
  const data = CHARACTER_DATA.characters[characterId];
  return {
    name: data.name,
    stats: { ...data.stats },
    level: 1,
    skillLevelUps: 0,
    unspentPoints: 0,
  };
}

// Level-Faktor der Formel: Level × levelFactor, aber mindestens 1.
function getLevelMultiplier(character) {
  return Math.max(1, character.level * CHARACTER_DATA.levelFactor);
}

// Max-Lebenspunkte = VIT × Level-Faktor (abgerundet).
export function getMaxHp(character) {
  return Math.floor(character.stats.vit * getLevelMultiplier(character));
}

// Max-ZEP = ZEP × Level-Faktor (abgerundet).
export function getMaxZep(character) {
  return Math.floor(character.stats.zep * getLevelMultiplier(character));
}

// Verteilt freie Punkte fest auf die Werte, z. B. spendPoints(player, { str: 2, vit: 3 }).
// Gibt false zurück und ändert nichts, wenn die Verteilung ungültig ist.
export function spendPoints(character, allocation) {
  let total = 0;
  for (const [stat, amount] of Object.entries(allocation)) {
    if (character.stats[stat] === undefined || !Number.isInteger(amount) || amount < 0) {
      return false;
    }
    total += amount;
  }
  if (total === 0 || total > character.unspentPoints) {
    return false;
  }

  for (const [stat, amount] of Object.entries(allocation)) {
    character.stats[stat] += amount;
  }
  character.unspentPoints -= total;
  emit("statsChanged", { character });
  return true;
}

// Zählt die Skill-Level-Ups mit und lässt den Charakter alle skillLevelsPerLevel aufsteigen.
// Muss nach setupMessages() aufgerufen werden, damit die Level-Meldung die Skill-Meldung ersetzt.
export function setupCharacterEvents(character) {
  on("skillLevelUp", (data) => {
    if (data.character !== character) {
      return;
    }

    // Mehrere Skill-Level auf einmal zählen einzeln
    character.skillLevelUps += data.levelsGained;
    const newLevel = 1 + Math.floor(character.skillLevelUps / CHARACTER_DATA.skillLevelsPerLevel);
    const levelsGained = newLevel - character.level;

    if (levelsGained > 0) {
      character.level = newLevel;
      character.unspentPoints += levelsGained * CHARACTER_DATA.pointsPerLevel;
      emit("characterLevelUp", { character, level: newLevel, levelsGained, points: character.unspentPoints });
    }
    // Auch ohne neues Level, damit das Charakter-Fenster den Fortschritt zeigt
    emit("statsChanged", { character });
  });
}

// Wie viele Skill-Level-Ups seit dem letzten Charakter-Level gezählt sind (z. B. 3 von 5).
export function getLevelProgress(character) {
  return {
    current: character.skillLevelUps % CHARACTER_DATA.skillLevelsPerLevel,
    needed: CHARACTER_DATA.skillLevelsPerLevel,
  };
}
