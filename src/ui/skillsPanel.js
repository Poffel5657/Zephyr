// Skills-Reiter im Seitenpanel: Level, Fortschrittsbalken und XP pro Skill.
import "./ui.css";
import "./skillsPanel.css";
import SKILL_DATA from "../data/skills.json";
import { on } from "../core/eventBus.js";
import { getLevel, getXpForLevel } from "../skills/skills.js";


// Baut den Inhalt des Skills-Reiters und zeichnet ihn neu, sobald sich die Skills ändern. Gibt { content } zurück.
export function createSkillsPanel(character) {
  const panel = document.createElement("div");
  panel.className = "skills-panel";

  const list = document.createElement("div");
  list.className = "skills-list";
  panel.appendChild(list);

  // Pro Skill eine Zeile mit Name, Level, Balken und XP-Zahlen anlegen
  const skillElements = {};
  for (const [skillId, skill] of Object.entries(SKILL_DATA.skills)) {
    const row = document.createElement("div");
    row.className = "skills-row";

    const header = document.createElement("div");
    header.className = "skills-row-header";

    const name = document.createElement("span");
    name.className = "skills-name";
    name.textContent = skill.name;
    header.appendChild(name);

    const level = document.createElement("span");
    level.className = "skills-level";
    header.appendChild(level);
    row.appendChild(header);

    const bar = document.createElement("div");
    bar.className = "skills-bar";

    const barFill = document.createElement("div");
    barFill.className = "skills-bar-fill";
    bar.appendChild(barFill);
    row.appendChild(bar);

    const xp = document.createElement("div");
    xp.className = "skills-xp";
    row.appendChild(xp);

    list.appendChild(row);
    skillElements[skillId] = { level, barFill, xp };
  }

  on("skillsChanged", (data) => {
    if (data.character === character) {
      updateSkills(character, skillElements);
    }
  });

  updateSkills(character, skillElements);
  return { content: panel };
}

// Aktualisiert Level, Fortschrittsbalken und XP-Anzeige für jeden Skill.
function updateSkills(character, skillElements) {
  for (const [skillId, elements] of Object.entries(skillElements)) {
    const currentXp = character.skills[skillId];
    const currentLevel = getLevel(currentXp);

    elements.level.textContent = `Lv ${currentLevel}`;

    if (currentLevel >= SKILL_DATA.maxLevel) {
      elements.barFill.style.width = "100%";
      elements.xp.textContent = "Max level";
    } else {
      const currentLevelXp = getXpForLevel(currentLevel);
      const nextLevelXp = getXpForLevel(currentLevel + 1);
      const progress = ((currentXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
      elements.barFill.style.width = `${progress}%`;
      elements.xp.textContent = `${currentXp} / ${nextLevelXp} XP`;
    }
  }
}
