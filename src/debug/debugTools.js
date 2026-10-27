// Hilfen zum Testen (nur im Dev-Server): wichtige Events in der Konsole mitschreiben
// und Befehle für die Konsole, z. B. debug.xp(5000) oder debug.item("fish", 3).
import { emit, on } from "../core/eventBus.js";
import { saveGame } from "../save/save.js";
import { takeDamage, heal } from "../character/character.js";
import { getTechniques, getCooldown, getTechnique } from "../combat/techniques.js";
import { startRhythm } from "../combat/rhythm.js";
import { selectTechnique } from "../combat/combat.js";

// Schreibt Events in die Konsole und stellt window.debug für diesen Charakter bereit.
export function setupDebugTools(character) {
  const logged = ["itemGained", "xpGained", "skillLevelUp", "inventoryFull", "objectReached", "actionCancelled", "timingResult", "characterLevelUp", "statsChanged", "hpChanged", "itemEaten", "combatStarted", "turnStarted", "attackResolved", "comboEnded", "combatEnded"];
  for (const eventName of logged) {
    on(eventName, (data) => console.log(eventName + ":", data));
  }

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
    rhythm: (techniqueId = "attack") =>
      startRhythm({ pattern: getTechnique(techniqueId).pattern, target: character.mesh, stopAtMiss: true }).then(
        (results) => console.log("Rhythmus:", results),
      ),
    // Technik für den nächsten Angriff wählen (bis die Technik-Leiste kommt), z. B. debug.technique("cleave")
    technique: (techniqueId) => selectTechnique(techniqueId),
    techniques: () => getTechniques(character).map(({ id }) => ({ id, cooldown: getCooldown(character, id) })),
    character: character,
  };
  console.log('Debug: debug.xp(5000), debug.item("oak_log", 3), debug.save(), debug.damage(2), debug.rhythm("cleave"), debug.character');
}
