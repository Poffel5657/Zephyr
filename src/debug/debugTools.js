// Hilfen zum Testen (nur im Dev-Server): wichtige Events in der Konsole mitschreiben
// und Befehle für die Konsole, z. B. debug.xp(5000) oder debug.item("fish", 3).
import { emit, on } from "../core/eventBus.js";
import { saveGame } from "../save/save.js";
import { takeDamage, heal } from "../character/character.js";
import { getTechniques, getCooldown, getTechnique } from "../combat/techniques.js";
import { startRhythm } from "../combat/rhythm.js";
import { rollLoot } from "../items/loot.js";
import { addGold } from "../inventory/inventory.js";

const EDITOR_KEY = "Backquote";

// Schreibt Events in die Konsole und stellt window.debug für diesen Charakter bereit.
export function setupDebugTools(character) {
  const logged = ["itemGained", "xpGained", "skillLevelUp", "inventoryFull", "objectReached", "actionCancelled", "timingResult", "characterLevelUp", "statsChanged", "hpChanged", "itemEaten", "combatStarted", "turnStarted", "attackResolved", "comboEnded", "combatEnded"];
  for (const eventName of logged) {
    on(eventName, (data) => console.log(eventName + ":", data));
  }

  // Taste ^ (links neben der 1, im Code "Backquote") öffnet den Game-Editor in einem zweiten Tab
  // (immer derselbe Tab, wenn er schon offen ist)
  addEventListener("keydown", (event) => {
    if (event.code === EDITOR_KEY && !event.repeat) {
      event.preventDefault();
      window.open(import.meta.env.BASE_URL + "editor.html", "zephyr-editor");
    }
  });

  window.debug = {
    // XP geben, z. B. debug.xp(5000) oder debug.xp(100, "woodcutting")
    xp: (amount, skill = "woodcutting") => emit("xpGained", { character, skill, amount }),
    // Item ins Inventar legen, z. B. debug.item("oak_log", 3)
    item: (item, amount = 1) => emit("itemGained", { item, amount }),
    // Sofort speichern, danach steht der Stand unter localStorage["zephyr-save"]
    save: () => saveGame(character),
    // Schaden nehmen / heilen, z. B. debug.damage(2)
    damage: (amount) => takeDamage(character, amount),
    heal: (amount) => heal(character, amount),
    // Freie Techniken mit Abklingzeit, z. B. [{ id: "cleave", cooldown: 0 }]
    // Muster einer Technik am Spieler abspielen, z. B. debug.rhythm("cleave")
    rhythm: (techniqueId = "cleave") =>
      startRhythm({ pattern: getTechnique(techniqueId).pattern, target: character.mesh, stopAtMiss: true }).then(
        (results) => console.log("Rhythmus:", results),
      ),
    // Loot eines Gegners auswürfeln, z. B. debug.loot("wild_gust") oder debug.loot("stone_crab", 3)
    loot: (type = "wild_gust", level = 1) => rollLoot({ type, level }),
    gold: (amount = 10) => addGold(character.inventory, amount),
    techniques: () => getTechniques(character).map(({ id }) => ({ id, cooldown: getCooldown(character, id) })),
    character: character,
  };
  console.log('Debug: Taste ^ = Game-Editor, debug.xp(5000), debug.item("oak_log", 3), debug.save(), debug.damage(2), debug.rhythm("cleave"), debug.loot("wild_gust"), debug.gold(10), debug.character');
}
