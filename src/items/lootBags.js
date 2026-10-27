// Loot nach dem Kampf: sammelt, was besiegte Gegner fallen lassen, öffnet das Loot-Fenster und
// legt den Rest als Beutel aufs Feld. Klick auf einen Beutel → hinlaufen → Loot-Fenster. Nach 2 Minuten ist er weg.
// Beutel werden nicht gespeichert.
import * as THREE from "three";
import { on } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { gridToWorld } from "../world/grid.js";
import { isMoving } from "../player/movement.js";
import { rollLoot, mergeLoot } from "./loot.js";
import { openLootWindow } from "../ui/lootWindow.js";

const BAG_LIFETIME_SECONDS = 120;
const BAG_SIZE = 0.3;
const BAG_COLOR = "#8a5a2b";

// Meldet das Loot für den Spieler an. clickables = anklickbare Teile der Welt (Beutel kommen dazu).
export function setupLoot(player, scene, clickables) {
  const bags = [];
  // Loot der in diesem Kampf besiegten Gegner: [{ loot, x, z }]
  let fightLoot = [];
  // Beutel, zu dem der Spieler gerade läuft (öffnet sich, wenn er draufsteht)
  let targetBag = null;
  let worldFrozen = false;

  // Legt einen Beutel aufs Feld (oder füllt einen, der dort schon liegt).
  const dropBag = (x, z, loot) => {
    if (loot.gold === 0 && loot.items.length === 0) {
      return;
    }
    const existing = bags.find((bag) => bag.x === x && bag.z === z);
    if (existing) {
      existing.loot = mergeLoot([existing.loot, loot]);
      existing.timeLeft = BAG_LIFETIME_SECONDS;
      return;
    }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(BAG_SIZE, BAG_SIZE, BAG_SIZE),
      new THREE.MeshStandardMaterial({ color: BAG_COLOR }),
    );
    mesh.position.copy(gridToWorld(x, z));
    mesh.position.y += BAG_SIZE / 2;
    mesh.castShadow = true;
    // Ein Klick auf den Beutel zählt wie ein Klick auf sein Feld (dann läuft der Spieler hin)
    mesh.userData.tile = { x, z };
    mesh.userData.bag = true;
    scene.add(mesh);
    clickables.push(mesh);
    bags.push({ x, z, loot, mesh, timeLeft: BAG_LIFETIME_SECONDS });
  };

  const removeBag = (bag) => {
    bags.splice(bags.indexOf(bag), 1);
    clickables.splice(clickables.indexOf(bag.mesh), 1);
    scene.remove(bag.mesh);
    if (targetBag === bag) {
      targetBag = null;
    }
  };

  // Öffnet das Fenster mit dem Inhalt eines Beutels; der Rest bleibt im Beutel.
  const openBag = (bag) => {
    openLootWindow(player.inventory, bag.loot, (rest) => {
      bag.loot = rest;
      if (rest.gold === 0 && rest.items.length === 0 && bags.includes(bag)) {
        removeBag(bag);
      }
    });
  };

  on("enemyDefeated", ({ enemy }) => {
    fightLoot.push({ loot: rollLoot(enemy), x: enemy.x, z: enemy.z });
  });

  on("combatStarted", () => {
    worldFrozen = true;
    fightLoot = [];
  });

  // Sieg: alles in ein Fenster, der Rest als Beutel auf das Feld des letzten Gegners.
  // Flucht: Loot der schon besiegten Gegner bleibt als Beutel liegen. Niederlage: Es wird ohnehin neu geladen.
  on("combatEnded", ({ result }) => {
    worldFrozen = false;
    const collected = fightLoot;
    fightLoot = [];
    if (collected.length === 0 || result === "defeat") {
      return;
    }
    const { x, z } = collected[collected.length - 1];
    const loot = mergeLoot(collected.map((entry) => entry.loot));
    if (result === "victory") {
      openLootWindow(player.inventory, loot, (rest) => dropBag(x, z, rest));
    } else {
      dropBag(x, z, loot);
    }
  });

  on("tileClicked", ({ x, z }) => {
    targetBag = bags.find((bag) => bag.x === x && bag.z === z) ?? null;
  });

  addUpdate((deltaTime) => {
    if (worldFrozen) {
      return;
    }
    for (const bag of [...bags]) {
      bag.timeLeft -= deltaTime;
      if (bag.timeLeft <= 0) {
        removeBag(bag);
      }
    }
    // Angekommen: Der Spieler steht auf dem Beutel und läuft nicht mehr
    if (targetBag !== null && !isMoving() && player.x === targetBag.x && player.z === targetBag.z) {
      const bag = targetBag;
      targetBag = null;
      openBag(bag);
    }
  });
}
