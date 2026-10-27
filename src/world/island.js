// Baut die Insel aus der geladenen Map: eine Säule pro Feld, plus Objekte obendrauf.
import * as THREE from "three";
import { getTile, getGridSize, gridToWorld, STEP_HEIGHT } from "./grid.js";
import { buildObject, setTreeFelled, setChestOpen } from "./objects.js";
import { on } from "../core/eventBus.js";
import TILE_TYPES from "../data/tileTypes.json";

// Fügt Säulen und Objekte zur Szene hinzu und gibt die Liste aller anklickbaren Teile zurück.
// Gefällte Bäume werden per "treeFelled" / "treeGrown" zum Stumpf und wieder zum Baum, Truhen per "chestOpened" auf.
export function buildIsland(scene) {
  const grid = getGridSize();
  const clickables = [];
  const objectsByTile = new Map();

  for (let zRow = 0; zRow < grid.depth; zRow++) {
    for (let xTile = 0; xTile < grid.width; xTile++) {
      const tile = getTile(xTile, zRow);
      if (tile === null) {
        continue;
      }

      const columnHeight = tile.height * STEP_HEIGHT;
      const geometry = new THREE.BoxGeometry(1, columnHeight, 1);
      const material = new THREE.MeshStandardMaterial({ color: TILE_TYPES[tile.type].color });
      const column = new THREE.Mesh(geometry, material);
      column.position.set(xTile, columnHeight / 2, zRow);
      column.castShadow = true;
      column.receiveShadow = true;
      column.userData.tile = { x: xTile, z: zRow };
      scene.add(column);
      clickables.push(column);

      if (tile.object) {
        const object = buildObject(scene, tile.object, gridToWorld(xTile, zRow));
        if (object !== null) {
          object.userData.tile = { x: xTile, z: zRow };
          clickables.push(object);
          objectsByTile.set(xTile + "," + zRow, object);
        }
      }
    }
  }

  on("treeFelled", ({ x, z }) => setTreeFelled(objectsByTile.get(x + "," + z), true));
  on("treeGrown", ({ x, z }) => setTreeFelled(objectsByTile.get(x + "," + z), false));
  on("chestOpened", ({ x, z }) => {
    // Ein alter Spielstand kann eine Truhe kennen, die auf der Karte nicht mehr steht
    const chest = objectsByTile.get(x + "," + z);
    if (chest?.userData.lidHinge !== undefined) {
      setChestOpen(chest);
    }
  });

  return clickables;
}
