// Prüft die Spieldaten, bevor der Game-Editor speichert: Typen, Wertebereiche und ob Verweise passen
// (z. B. ob ein Loot-Item in items.json existiert). Gibt eine Liste von Fehlertexten zurück (leer = alles gut).

// Gegner-Formen, die enemies.js kennt
const SHAPES = ["gust", "wisp", "crab"];
// Objekte, die der Map-Editor setzen kann
const OBJECTS = ["tree", "rock", "chest", "fishing_chest", "fishing_spot", "campfire"];
// Techniken, die der Code direkt benutzt (Quick Snack schaltet Essen im Kampf frei)
const REQUIRED_TECHNIQUES = ["attack", "quick_snack"];
// Items, die der Code direkt benutzt (Start-Axt, Reset-Kosten)
const REQUIRED_ITEMS = ["copper_axe", "wind_essence"];

export function validateGameData(data) {
  const errors = [];
  const items = data["items.json"];
  const enemies = data["enemies.json"];
  const techniques = data["techniques.json"];
  const skills = data["skills.json"];
  const rhythm = data["rhythm.json"];
  const characters = data["characters.json"];
  const tileTypes = data["tileTypes.json"];
  const rhythmKeys = Object.keys(rhythm.keys ?? {});

  const check = (condition, text) => {
    if (!condition) errors.push(text);
  };
  const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
  const isInt = (value, min = 0) => Number.isInteger(value) && value >= min;
  const isColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

  // Ein Rhythmus-Muster: Liste von Takten mit bekannter Taste, Abstand > 0, Schaden ≥ 0
  const checkPattern = (pattern, where, allowEmpty) => {
    check(Array.isArray(pattern) && (allowEmpty || pattern.length > 0), `${where}: Muster braucht mindestens einen Takt`);
    for (const [i, beat] of (Array.isArray(pattern) ? pattern : []).entries()) {
      check(rhythmKeys.includes(beat.key), `${where}, Takt ${i + 1}: unbekannte Taste "${beat.key}" (erlaubt: ${rhythmKeys.join(", ")})`);
      check(isNumber(beat.after) && beat.after > 0, `${where}, Takt ${i + 1}: "after" muss größer als 0 sein`);
      check(isNumber(beat.damage) && beat.damage >= 0, `${where}, Takt ${i + 1}: "damage" muss 0 oder mehr sein`);
    }
  };

  for (const [id, item] of Object.entries(items)) {
    const where = `Item ${id}`;
    check(typeof item.name === "string" && item.name !== "", `${where}: Name fehlt`);
    check(typeof item.stackable === "boolean", `${where}: "stackable" muss Ja/Nein sein`);
    check(isInt(item.maxStack, 1), `${where}: "maxStack" muss eine ganze Zahl ab 1 sein`);
    check(isColor(item.color), `${where}: Farbe muss wie #a1b2c3 aussehen`);
    check(Array.isArray(item.tags), `${where}: "tags" muss eine Liste sein`);
    check(item.heal === undefined || (isNumber(item.heal) && item.heal > 0), `${where}: "heal" muss größer als 0 sein`);
  }
  for (const id of REQUIRED_ITEMS) {
    check(items[id] !== undefined, `Item ${id} wird vom Spiel gebraucht und darf nicht fehlen`);
  }

  for (const [id, enemy] of Object.entries(enemies)) {
    const where = `Gegner ${id}`;
    check(typeof enemy.name === "string" && enemy.name !== "", `${where}: Name fehlt`);
    check(isColor(enemy.color), `${where}: Farbe muss wie #a1b2c3 aussehen`);
    check(enemy.shape === undefined || SHAPES.includes(enemy.shape), `${where}: Form muss eine von ${SHAPES.join(", ")} sein`);
    check(isInt(enemy.level, 1), `${where}: Level muss eine ganze Zahl ab 1 sein`);
    for (const stat of ["str", "vit", "zep", "agi"]) {
      check(isInt(enemy.stats?.[stat]), `${where}: Wert ${stat.toUpperCase()} fehlt oder ist keine ganze Zahl`);
    }
    check(isInt(enemy.aggroRange), `${where}: "aggroRange" muss eine ganze Zahl sein`);
    check(enemy.attackRange === undefined || isInt(enemy.attackRange, 1), `${where}: "attackRange" muss ab 1 sein`);
    check(isNumber(enemy.respawnSeconds) && enemy.respawnSeconds > 0, `${where}: "respawnSeconds" muss größer als 0 sein`);
    check(Array.isArray(enemy.attackPatterns) && enemy.attackPatterns.length > 0, `${where}: braucht mindestens ein Angriffsmuster`);
    (enemy.attackPatterns ?? []).forEach((pattern, i) => checkPattern(pattern, `${where}, Muster ${i + 1}`, false));
    for (const [i, entry] of (enemy.loot ?? []).entries()) {
      check(items[entry.item] !== undefined, `${where}, Loot ${i + 1}: Item "${entry.item}" gibt es nicht`);
      check(isNumber(entry.chance) && entry.chance >= 0 && entry.chance <= 1, `${where}, Loot ${i + 1}: Chance muss zwischen 0 und 1 liegen`);
      check(isInt(entry.min, 1) && isInt(entry.max, 1) && entry.min <= entry.max, `${where}, Loot ${i + 1}: min/max müssen ab 1 sein und min ≤ max`);
    }
    if (enemy.gold !== undefined) {
      check(isInt(enemy.gold.min) && isInt(enemy.gold.max) && enemy.gold.min <= enemy.gold.max, `${where}: Gold min/max ungültig`);
    }
  }

  for (const id of REQUIRED_TECHNIQUES) {
    check(techniques[id] !== undefined, `Technik ${id} wird vom Spiel gebraucht und darf nicht fehlen`);
  }
  for (const [id, technique] of Object.entries(techniques)) {
    const where = `Technik ${id}`;
    check(typeof technique.name === "string" && technique.name !== "", `${where}: Name fehlt`);
    checkPattern(technique.pattern, where, true);
    if (technique.skill !== undefined) {
      check(skills.skills?.[technique.skill] !== undefined, `${where}: Skill "${technique.skill}" gibt es nicht`);
      check(isInt(technique.level, 1), `${where}: Level muss ab 1 sein`);
    }
    check(technique.cooldown === undefined || isInt(technique.cooldown), `${where}: Abklingzeit muss eine ganze Zahl sein`);
    check(technique.effect === undefined || technique.effect === "pull", `${where}: Effekt "${technique.effect}" gibt es nicht (nur "pull")`);
    check(technique.effect !== "pull" || isInt(technique.range, 2), `${where}: Heranziehen braucht "range" ab 2`);
  }

  check(characters.characters?.hero !== undefined, `Charakter hero wird vom Spiel gebraucht`);
  for (const key of ["levelFactor", "skillLevelsPerLevel", "pointsPerLevel"]) {
    check(isNumber(characters[key]) && characters[key] > 0, `Charakter: "${key}" muss größer als 0 sein`);
  }

  for (const [skillId, skill] of Object.entries(skills.skills ?? {})) {
    for (const [treeId, tree] of Object.entries(skill.trees ?? {})) {
      check(items[tree.log] !== undefined, `Skill ${skillId}, Baum ${treeId}: Item "${tree.log}" gibt es nicht`);
    }
    for (const [spotId, spot] of Object.entries(skill.spots ?? {})) {
      check(items[spot.fish] !== undefined, `Skill ${skillId}, Angelstelle ${spotId}: Item "${spot.fish}" gibt es nicht`);
      check(isNumber(spot.waitMin) && isNumber(spot.waitMax) && spot.waitMin <= spot.waitMax, `Skill ${skillId}, Angelstelle ${spotId}: "waitMin" darf nicht größer als "waitMax" sein`);
      check(isInt(spot.catches, 1), `Skill ${skillId}, Angelstelle ${spotId}: "catches" muss mindestens 1 sein`);
      check(isNumber(spot.strikeDistance) && isNumber(spot.lineLength) && spot.strikeDistance < spot.lineLength, `Skill ${skillId}, Angelstelle ${spotId}: "strikeDistance" muss kleiner als "lineLength" sein`);
      check(isNumber(spot.fishStamina) && spot.fishStamina > 0 && isNumber(spot.pullPower) && spot.pullPower > 0, `Skill ${skillId}, Angelstelle ${spotId}: "fishStamina" und "pullPower" müssen größer als 0 sein`);
      check(isNumber(spot.turnMin) && isNumber(spot.turnMax) && spot.turnMin > 0 && spot.turnMin <= spot.turnMax, `Skill ${skillId}, Angelstelle ${spotId}: "turnMin" muss größer als 0 und nicht größer als "turnMax" sein`);
      check(isNumber(spot.turnWarning) && spot.turnWarning < spot.turnMin, `Skill ${skillId}, Angelstelle ${spotId}: "turnWarning" muss kleiner als "turnMin" sein`);
    }
    for (const [recipeId, recipe] of Object.entries(skill.recipes ?? {})) {
      for (const key of ["ingredient", "result", "perfect", "burnt"]) {
        check(items[recipe[key]] !== undefined, `Skill ${skillId}, Rezept ${recipeId}: Item "${recipe[key]}" (${key}) gibt es nicht`);
      }
      check(isInt(recipe.steps, 1), `Skill ${skillId}, Rezept ${recipeId}: "steps" muss mindestens 1 sein`);
      check(isNumber(recipe.totalSeconds) && isNumber(recipe.fastSeconds) && recipe.fastSeconds <= recipe.totalSeconds, `Skill ${skillId}, Rezept ${recipeId}: "fastSeconds" darf nicht größer als "totalSeconds" sein`);
      check(isInt(recipe.maxMistakes), `Skill ${skillId}, Rezept ${recipeId}: "maxMistakes" muss eine ganze Zahl sein`);
    }
  }

  check(isNumber(rhythm.perfectWindow) && isNumber(rhythm.goodWindow) && rhythm.perfectWindow < rhythm.goodWindow, `Rhythmus: "perfectWindow" muss kleiner als "goodWindow" sein`);
  for (const [key, info] of Object.entries(rhythm.keys ?? {})) {
    check(isColor(info.color) && Array.isArray(info.codes) && info.codes.length > 0, `Rhythmus, Taste ${key}: Farbe und Tasten-Codes nötig`);
  }

  for (const [id, chest] of Object.entries(data["chests.json"] ?? {})) {
    check(chest.key === undefined || items[chest.key] !== undefined, `Truhe ${id}: Schlüssel-Item "${chest.key}" gibt es nicht`);
    const contents = chest.contents ?? {};
    check(isInt(contents.gold) && Array.isArray(contents.items) && (contents.gold > 0 || contents.items.length > 0), `Truhe ${id}: braucht Inhalt (Gold oder Items)`);
    for (const entry of contents.items ?? []) {
      check(items[entry.item] !== undefined && isInt(entry.amount, 1), `Truhe ${id}: Inhalt "${entry.item}" gibt es nicht oder Menge ungültig`);
    }
  }

  for (const [id, type] of Object.entries(tileTypes)) {
    check(isColor(type.color) && typeof type.walkable === "boolean", `Bodentyp ${id}: Farbe und "walkable" nötig`);
  }

  for (const [file, map] of Object.entries(data).filter(([name]) => name.startsWith("maps/"))) {
    for (const enemy of map.enemies ?? []) {
      check(enemies[enemy.type] !== undefined, `${file}: Gegner "${enemy.type}" auf ${enemy.x},${enemy.z} gibt es nicht`);
    }
    map.tiles.forEach((row, z) =>
      row.forEach((tile, x) => {
        if (tile !== null) {
          check(tileTypes[tile.type] !== undefined, `${file}: Bodentyp "${tile.type}" auf ${x},${z} gibt es nicht`);
          check(tile.object === undefined || OBJECTS.includes(tile.object), `${file}: Objekt "${tile.object}" auf ${x},${z} gibt es nicht`);
        }
      }),
    );
  }

  return errors;
}
