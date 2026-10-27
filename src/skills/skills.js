// Verwaltet die Skills eines Charakters: XP sammeln, daraus das Level berechnen, Level-Ups melden.
import SKILL_DATA from "../data/skills.json";
import { emit, on } from "../core/eventBus.js";

// Gesamt-XP pro Level, einmal beim Laden aus der Kurve berechnet (Level 1 = 0 XP)
const XP_FOR_LEVEL = [0, 0];
for (let level = 1; level < SKILL_DATA.maxLevel; level++) {
  const xpToNext = Math.round(SKILL_DATA.xpCurve.base * level ** SKILL_DATA.xpCurve.exponent);
  XP_FOR_LEVEL[level + 1] = XP_FOR_LEVEL[level] + xpToNext;
}

// Gibt die Gesamt-XP zurück, die man für dieses Level braucht.
export function getXpForLevel(level) {
  return XP_FOR_LEVEL[level];
}

// Gibt das Level zu dieser XP-Menge zurück (höchstens maxLevel).
export function getLevel(xp) {
  for (let level = SKILL_DATA.maxLevel; level > 1; level--) {
    if (xp >= XP_FOR_LEVEL[level]) {
      return level;
    }
  }
  return 1;
}

// Erstellt die Skills für einen neuen Charakter: jeder Skill aus skills.json mit 0 XP.
export function createSkills() {
  const skills = {};
  for (const skillId of Object.keys(SKILL_DATA.skills)) {
    skills[skillId] = 0;
  }
  return skills;
}

// Gibt dem Charakter XP in einem Skill und meldet "skillsChanged" und bei neuem Level "skillLevelUp".
export function addXp(character, skillId, amount) {
  if (SKILL_DATA.skills[skillId] === undefined) {
    console.warn(`Unbekannter Skill: "${skillId}"`);
    return;
  }

  const oldLevel = getLevel(character.skills[skillId]);
  character.skills[skillId] += amount;
  const newLevel = getLevel(character.skills[skillId]);

  emit("skillsChanged", { character });
  if (newLevel > oldLevel) {
    // Auch bei mehreren Leveln auf einmal nur eine Meldung
    emit("skillLevelUp", { character, skill: skillId, level: newLevel, levelsGained: newLevel - oldLevel });
  }
}

// Hört auf "xpGained" und gibt die XP, wenn sie für diesen Charakter sind.
export function setupSkillEvents(character) {
  on("xpGained", (data) => {
    if (data.character === character) {
      addXp(character, data.skill, data.amount);
    }
  });
}
