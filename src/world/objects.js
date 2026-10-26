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

  tree.position.copy(position);
  scene.add(tree);
  return tree;
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

const OBJECT_BUILDERS = {
  tree: buildTree,
  rock: buildRock,
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
