// Hilfen zum Testen (nur im Dev-Server): wichtige Events in der Konsole mitschreiben
// und Befehle für die Konsole, z. B. debug.xp(5000) oder debug.item("fish", 3).
import { emit, on } from "../core/eventBus.js";

// Schreibt Events in die Konsole und stellt window.debug für diesen Charakter bereit.
export function setupDebugTools(character) {
  const logged = ["itemGained", "xpGained", "skillLevelUp", "inventoryFull", "objectReached", "actionCancelled", "timingResult", "characterLevelUp", "statsChanged"];
  for (const eventName of logged) {
    on(eventName, (data) => console.log(eventName + ":", data));
  }

  window.debug = {
    // XP geben, z. B. debug.xp(5000) oder debug.xp(100, "woodcutting")
    xp: (amount, skill = "woodcutting") => emit("xpGained", { character, skill, amount }),
    // Item ins Inventar legen, z. B. debug.item("oak_log", 3)
    item: (item, amount = 1) => emit("itemGained", { item, amount }),
    character: character,
  };
  console.log('Debug: debug.xp(5000), debug.item("oak_log", 3), debug.character');
}
