// Verwaltet Grundwerte und Charakter-Level: Skill-Level-Ups zählen, Punkte vergeben und verteilen.
// Dazu die Kampfwerte (Schaden, Ausweichen, Felder pro Zug) und die aktuellen HP.
// Startwerte und Regeln stehen in characters.json. Die Formeln gelten auch für Gegner (gleiche Felder: stats, level, hp).
import CHARACTER_DATA from "../data/characters.json";
import { emit, on } from "../core/eventBus.js";

const COMBAT = CHARACTER_DATA.combat;

// Erstellt die Charakter-Werte für einen Charakter aus characters.json (z. B. "hero").
export function createCharacterStats(characterId) {
  const data = CHARACTER_DATA.characters[characterId];
  const character = {
    name: data.name,
    stats: { ...data.stats },
    level: 1,
    skillLevelUps: 0,
    unspentPoints: 0,
    // Wie viele Punkte auf jeden Wert verteilt wurden (für das Zurücksetzen mit der Wind-Essenz)
    spentPoints: { str: 0, vit: 0, zep: 0, agi: 0 },
  };
  character.hp = getMaxHp(character);
  return character;
}

// Level-Faktor der Formel: 1 auf Level 1, danach + levelFactor pro Level (0.5 → Lv 2: ×1,5, Lv 4: ×2,5, Lv 10: ×5,5).
// Gilt für Spieler und Gegner gleich: gleiche Werte und gleiches Level = gleiche HP und gleicher Schaden.
function getLevelMultiplier(character) {
  return 1 + (character.level - 1) * CHARACTER_DATA.levelFactor;
}

// Max-Lebenspunkte = VIT × Level-Faktor (abgerundet).
export function getMaxHp(character) {
  return Math.floor(character.stats.vit * getLevelMultiplier(character));
}

// Max-ZEP = ZEP × Level-Faktor (abgerundet).
export function getMaxZep(character) {
  return Math.floor(character.stats.zep * getLevelMultiplier(character));
}

// Schaden eines Angriffs: STR × damageFactor × Level-Faktor, ±damageSpread, gerundet, mindestens 1.
// random kann man zum Testen festlegen (0 = kleinster, 1 = größter Schaden).
export function getDamage(attacker, random = Math.random()) {
  const base = attacker.stats.str * COMBAT.damageFactor * getLevelMultiplier(attacker);
  const spread = 1 + COMBAT.damageSpread * (random * 2 - 1);
  return Math.max(1, Math.round(base * spread));
}

// Chance auszuweichen (0 bis maxDodge): AGI × dodgePerAgi.
export function getDodgeChance(character) {
  return Math.min(COMBAT.maxDodge, character.stats.agi * COMBAT.dodgePerAgi);
}

// Wie viele Felder der Charakter im Kampf pro Zug laufen darf: baseMove + AGI / agiPerMove.
export function getMoveRange(character) {
  return COMBAT.baseMove + Math.floor(character.stats.agi / COMBAT.agiPerMove);
}

// Zieht HP ab (nicht unter 0) und meldet "hpChanged". Gibt true zurück, wenn der Charakter jetzt bei 0 ist.
export function takeDamage(character, amount) {
  character.hp = Math.max(0, character.hp - amount);
  emit("hpChanged", { character });
  return character.hp === 0;
}

// Heilt höchstens bis Max-HP und meldet "hpChanged". Gibt zurück, wie viel wirklich geheilt wurde.
export function heal(character, amount) {
  const healed = Math.min(amount, getMaxHp(character) - character.hp);
  if (healed > 0) {
    character.hp += healed;
    emit("hpChanged", { character });
  }
  return Math.max(0, healed);
}

// Wächst Max-HP (Level oder VIT), steigen die HP um denselben Betrag: Es fehlt danach genauso viel wie vorher.
function addMaxHpGrowth(character, oldMaxHp) {
  const growth = getMaxHp(character) - oldMaxHp;
  if (growth > 0) {
    character.hp += growth;
    emit("hpChanged", { character });
  }
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

  const oldMaxHp = getMaxHp(character);
  for (const [stat, amount] of Object.entries(allocation)) {
    character.stats[stat] += amount;
    character.spentPoints[stat] += amount;
  }
  character.unspentPoints -= total;
  addMaxHpGrowth(character, oldMaxHp);
  emit("statsChanged", { character });
  return true;
}

// Gibt zurück, wie viele Punkte insgesamt verteilt sind.
export function getSpentPointsTotal(character) {
  return Object.values(character.spentPoints).reduce((sum, amount) => sum + amount, 0);
}

// Nimmt alle verteilten Punkte zurück (Werte auf Start, Punkte wieder frei). HP höchstens Max-HP.
// Die Kosten (Wind-Essenz) zieht das Charakter-Fenster ab.
export function resetStatPoints(character) {
  character.unspentPoints += getSpentPointsTotal(character);
  for (const [stat, amount] of Object.entries(character.spentPoints)) {
    character.stats[stat] -= amount;
    character.spentPoints[stat] = 0;
  }
  character.hp = Math.min(character.hp, getMaxHp(character));
  emit("statsChanged", { character });
  emit("hpChanged", { character });
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
      const oldMaxHp = getMaxHp(character);
      character.level = newLevel;
      character.unspentPoints += levelsGained * CHARACTER_DATA.pointsPerLevel;
      addMaxHpGrowth(character, oldMaxHp);
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
