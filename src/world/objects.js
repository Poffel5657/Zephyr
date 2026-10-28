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

// Baut eine Platzhalter-Angelstelle auf dem Wasser: heller Wellen-Ring mit rot-weißem Schwimmer.
function buildFishingSpot(scene, position) {
  const spot = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.25, 32),
    new THREE.MeshStandardMaterial({ color: "#bfe6ff", transparent: true, opacity: 0.7 }),
  );
  // Flach hinlegen, mit der Vorderseite nach oben
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.receiveShadow = true;
  spot.add(ring);

  const bobber = new THREE.Group();
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshStandardMaterial({ color: "#d94040" }));
  bottom.castShadow = true;
  bobber.add(bottom);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshStandardMaterial({ color: "#ffffff" }));
  top.position.y = 0.06;
  top.castShadow = true;
  bobber.add(top);
  bobber.position.y = 0.02;
  spot.add(bobber);
  spot.userData.active = [ring, bobber];
  spot.userData.bobber = bobber;

  spot.position.copy(position);
  scene.add(spot);
  return spot;
}

// Versteckt Ring und Schwimmer, solange die Angelstelle erschöpft ist.
export function setFishingSpotDepleted(spot, depleted) {
  for (const part of spot.userData.active) {
    part.visible = !depleted;
  }
}

// Baut ein Platzhalter-Lagerfeuer: drei Holzscheite im Stern, Steinkreis, leuchtende Flamme.
function buildCampfire(scene, position) {
  const campfire = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: "#6b4a2b" });
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5), wood);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i * Math.PI) / 3;
    log.position.y = 0.05;
    log.castShadow = true;
    log.receiveShadow = true;
    campfire.add(log);
  }

  const stoneMaterial = new THREE.MeshStandardMaterial({ color: "#7a8087" });
  for (let i = 0; i < 6; i++) {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07), stoneMaterial);
    const angle = (i * Math.PI) / 3;
    stone.position.set(Math.cos(angle) * 0.3, 0.05, Math.sin(angle) * 0.3);
    stone.castShadow = true;
    stone.receiveShadow = true;
    campfire.add(stone);
  }

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.35),
    new THREE.MeshStandardMaterial({ color: "#ff9a3c", emissive: "#ff6a00", emissiveIntensity: 1 }),
  );
  flame.position.y = 0.25;
  campfire.add(flame);

  campfire.position.copy(position);
  scene.add(campfire);
  return campfire;
}

// Baut einen Platzhalter-Fels zum Abbauen: grauer Fels mit farbigen Erz-Stückchen (oreColor).
// Abgebaut bleibt nur flaches Geröll stehen.
function buildMiningRock(scene, position, oreColor) {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: "#7a8087" });
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35), stone);
  rock.position.y = 0.25;
  rock.castShadow = true;
  rock.receiveShadow = true;
  group.add(rock);

  const oreMaterial = new THREE.MeshStandardMaterial({ color: oreColor });
  const specks = [];
  for (let i = 0; i < 5; i++) {
    const speck = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07), oreMaterial);
    const angle = (i * 2 * Math.PI) / 5;
    speck.position.set(Math.cos(angle) * 0.3, 0.25 + (i % 2) * 0.12, Math.sin(angle) * 0.3);
    speck.castShadow = true;
    group.add(speck);
    specks.push(speck);
  }

  const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2), stone);
  rubble.position.y = 0.08;
  rubble.scale.y = 0.4;
  rubble.receiveShadow = true;
  rubble.visible = false;
  group.add(rubble);
  group.userData.active = [rock, ...specks];
  group.userData.rubble = rubble;

  group.position.copy(position);
  scene.add(group);
  return group;
}

// Zeigt beim Fels entweder Fels + Erz oder nur Geröll (abgebaut).
export function setMiningRockDepleted(rock, depleted) {
  for (const part of rock.userData.active) {
    part.visible = !depleted;
  }
  rock.userData.rubble.visible = depleted;
}

// Baut einen Platzhalter-Amboss mit kleiner Esse daneben (glühende Kohlen).
function buildAnvil(scene, position) {
  const group = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: "#3c4148" });
  const parts = [];
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.2), iron);
  base.position.y = 0.1;
  parts.push(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.22), iron);
  top.position.y = 0.26;
  parts.push(top);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18), iron);
  horn.rotation.z = -Math.PI / 2;
  horn.position.set(0.31, 0.26, 0);
  parts.push(horn);

  const forge = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.25), new THREE.MeshStandardMaterial({ color: "#7a8087" }));
  forge.position.set(-0.32, 0.15, 0);
  parts.push(forge);
  for (const part of parts) {
    part.castShadow = true;
    part.receiveShadow = true;
    group.add(part);
  }

  const coals = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.04, 0.18),
    new THREE.MeshStandardMaterial({ color: "#ff7a2a", emissive: "#ff4a00", emissiveIntensity: 1 }),
  );
  coals.position.set(-0.32, 0.31, 0);
  group.add(coals);

  group.position.copy(position);
  scene.add(group);
  return group;
}

const OBJECT_BUILDERS = {
  tree: buildTree,
  rock: buildRock,
  chest: buildChest,
  fishing_chest: buildChest,
  mining_chest: buildChest,
  fishing_spot: buildFishingSpot,
  campfire: buildCampfire,
  copper_rock: (scene, position) => buildMiningRock(scene, position, "#d08850"),
  stone_rock: (scene, position) => buildMiningRock(scene, position, "#c9c9c9"),
  anvil: buildAnvil,
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
