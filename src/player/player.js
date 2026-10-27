import * as THREE from "three";
import { gridToWorld } from "../world/grid.js";
import { createInventory, addItem } from "../inventory/inventory.js";
import { createSkills } from "../skills/skills.js";
import { createCharacterStats } from "../character/character.js";

export function createPlayer(scene, x, z) {
  // 1. Größe festlegen (Gesamthöhe = Mittelteil + 2 × Radius)
  const radius = 0.2;
  const length = 0.7;
  const height = length + 2 * radius;

  // 2. Das Mesh bauen (die Kapsel, die man sieht)
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, 1),
    new THREE.MeshStandardMaterial({ color: "#ce2323" }),
  );

  // 3. Das Mesh aufs Feld stellen
  const position = gridToWorld(x, z);   // Oberseite vom Feld
  mesh.position.copy(position);         // dahin setzen
  mesh.position.y += height / 2;        // Halbe-Höhe-Trick

  // 4. Schatten an und in die Szene
  mesh.castShadow = true;
  scene.add(mesh);

  // 5. Start-Ausrüstung: eine Axt zum Holzfällen
  const inventory = createInventory();
  addItem(inventory, "copper_axe");

  // 6. Erst jetzt den Zettel schreiben und zurückgeben
  return {
    x: x,
    z: z,
    mesh: mesh,
    inventory: inventory,
    skills: createSkills(),
    // Spielfortschritt: geöffnete Truhen (mit Rest-Inhalt) und Items, die nur einmal fallen (z. B. der Schlüssel)
    progress: { chests: {}, onceLoot: [] },
    // name, stats, level, skillLevelUps, unspentPoints aus characters.json
    ...createCharacterStats("hero"),
  };
}
