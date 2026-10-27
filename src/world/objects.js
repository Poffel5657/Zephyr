// Baut die Objekte auf den Feldern (gerade noch Platzhalter, später Blender-Modelle).
import * as THREE from "three";

// Baut einen Platzhalter-Baum aus Stamm und Krone.
function buildTree(scene, position) {
  const tree = new THREE.Group();

  const trunkHeight = 0.6;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, trunkHeight),
    new THREE.MeshStandardMaterial({ color: "#6b4a2b" }),
  );
  trunk.position.y = trunkHeight / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const crownHeight = 1;
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, crownHeight),
    new THREE.MeshStandardMaterial({ color: "#2f6b2a" }),
  );
  crown.position.y = trunkHeight + crownHeight / 2;
  crown.castShadow = true;
  crown.receiveShadow = true;
  tree.add(crown);

  // Stumpf für gefällte Bäume, am Anfang versteckt
  const stumpHeight = 0.15;
  const stump = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.13, stumpHeight),
    new THREE.MeshStandardMaterial({ color: "#6b4a2b" }),
  );
  stump.position.y = stumpHeight / 2;
  stump.castShadow = true;
  stump.receiveShadow = true;
  stump.visible = false;
  tree.add(stump);
  tree.userData.standing = [trunk, crown];
  tree.userData.stump = stump;

  tree.position.copy(position);
  scene.add(tree);
  return tree;
}

// Zeigt beim Baum entweder Stamm + Krone oder nur den Stumpf.
export function setTreeFelled(tree, felled) {
  for (const part of tree.userData.standing) {
    part.visible = !felled;
  }
  tree.userData.stump.visible = felled;
}

// Baut einen Platzhalter-Fels.
function buildRock(scene, position) {
  const size = 0.3;
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(size),
    new THREE.MeshStandardMaterial({ color: "#7a8087" }),
  );
  rock.position.copy(position);
  rock.position.y += size * 0.6;
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
  return rock;
}

// Baut eine Platzhalter-Truhe: Kasten + Deckel (der Deckel klappt beim Öffnen auf).
function buildChest(scene, position) {
  const chest = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: "#7a4e24" });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.38), wood);
  box.position.y = 0.15;
  box.castShadow = true;
  box.receiveShadow = true;
  chest.add(box);

  // Der Deckel dreht sich um seine hintere Kante
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.3, -0.19);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: "#8f5d2c" }));
  lid.position.set(0, 0.05, 0.2);
  lid.castShadow = true;
  hinge.add(lid);
  chest.add(hinge);
  chest.userData.lidHinge = hinge;

  chest.position.copy(position);
  scene.add(chest);
  return chest;
}

// Klappt den Deckel einer Truhe auf.
export function setChestOpen(chest) {
  chest.userData.lidHinge.rotation.x = -Math.PI * 0.6;
}

const OBJECT_BUILDERS = {
  tree: buildTree,
  rock: buildRock,
  chest: buildChest,
};

// Baut das Objekt mit diesem Namen und gibt es zurück (null + Warnung bei unbekanntem Namen).
export function buildObject(scene, objectName, position) {
  const build = OBJECT_BUILDERS[objectName];
  if (build === undefined) {
    console.warn(`Unbekanntes Objekt: "${objectName}"`);
    return null;
  }
  return build(scene, position);
}
