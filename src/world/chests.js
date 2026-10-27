// Truhen: verschlossen, ein Schlüssel öffnet sie. Der Inhalt kommt ins Loot-Fenster, was man nicht nimmt,
// bleibt in der Truhe (man kann sie wieder anklicken). Werte in chests.json, Fortschritt im Spielstand.
import CHESTS from "../data/chests.json";
import ITEMS from "../data/items.json";
import { emit, on } from "../core/eventBus.js";
import { hasItem, removeItem } from "../inventory/inventory.js";
import { openLootWindow } from "../ui/lootWindow.js";
import { showMessage } from "../ui/messages.js";

// Meldet die Truhen für den Spieler an (nach buildIsland aufrufen).
export function setupChests(player) {
  on("objectReached", (data) => {
    const chest = CHESTS[data.object];
    if (data.character !== player || chest === undefined) {
      return;
    }
    const key = data.x + "," + data.z;
    const progress = player.progress;

    if (progress.chests[key] === undefined) {
      if (!hasItem(player.inventory, chest.key)) {
        showMessage(`The chest is locked (needs ${ITEMS[chest.key].name})`);
        return;
      }
      // Aufschließen: Schlüssel weg, er fällt danach nicht noch einmal
      removeItem(player.inventory, chest.key, 1);
      progress.onceLoot.push(chest.key);
      progress.chests[key] = structuredClone(chest.contents);
      emit("chestOpened", { x: data.x, z: data.z });
      emit("progressChanged", { character: player });
    }

    const rest = progress.chests[key];
    if (rest.gold === 0 && rest.items.length === 0) {
      showMessage("The chest is empty");
      return;
    }
    openLootWindow(player.inventory, rest, (left) => {
      progress.chests[key] = left;
      emit("progressChanged", { character: player });
    });
  });

  // Nach dem Laden: geöffnete Truhen auch offen zeigen
  on("progressLoaded", ({ character }) => {
    if (character !== player) {
      return;
    }
    for (const key of Object.keys(player.progress.chests)) {
      const [x, z] = key.split(",").map(Number);
      emit("chestOpened", { x, z });
    }
  });
}
