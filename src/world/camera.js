// Kamera, die man mit rechter/mittlerer Maustaste um die Insel dreht und mit dem Mausrad zoomt.
// Der Drehpunkt folgt weich einem Objekt (z. B. dem Spieler), Drehung und Zoom bleiben dabei erhalten.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { getGridSize } from "./grid.js";

const MIN_ZOOM = 6;
const MAX_ZOOM = 35;
const MIN_ANGLE = 0.2;
const MAX_ANGLE = Math.PI * 0.42;

export const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

let controls = null;
// Objekt, dem die Kamera folgt (null = bleibt stehen)
let followed = null;
// Wie schnell der Drehpunkt hinterhergleitet (größer = schneller)
const FOLLOW_SPEED = 5;
const step = new THREE.Vector3();

// Richtet die Maus-Steuerung ein (erst nach loadGrid aufrufen); links bleibt frei fürs Laufen.
export function setupCamera(canvas) {
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.enablePan = false;
  controls.minDistance = MIN_ZOOM;
  controls.maxDistance = MAX_ZOOM;
  controls.minPolarAngle = MIN_ANGLE;
  controls.maxPolarAngle = MAX_ANGLE;
  controls.mouseButtons = {
    LEFT: null,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.ROTATE,
  };

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  focusOnIsland();
}

// Richtet die Kamera schräg von oben auf die Mitte der geladenen Map aus.
function focusOnIsland() {
  const size = getGridSize();
  const centerX = (size.width - 1) / 2;
  const centerZ = (size.depth - 1) / 2;
  const distance = Math.max(size.width, size.depth);

  controls.target.set(centerX, 0, centerZ);
  camera.position.set(centerX, distance * 0.8, centerZ + distance);
  controls.update();
}

// Lässt die Kamera diesem Objekt folgen. snap = sofort hinspringen statt hingleiten.
export function followWithCamera(object, snap = false) {
  followed = object;
  if (snap) {
    moveFocus(1);
  }
}

// Aktualisiert die Steuerung jedes Bild: Drehpunkt zum verfolgten Objekt gleiten lassen, dann weiches Nachgleiten.
export function updateCamera(deltaTime) {
  if (followed !== null) {
    moveFocus(1 - Math.exp(-FOLLOW_SPEED * deltaTime));
  }
  controls.update();
}

// Schiebt Drehpunkt und Kamera gemeinsam um diesen Anteil Richtung Objekt (so bleibt der Blickwinkel gleich).
function moveFocus(amount) {
  step.copy(followed.position).sub(controls.target).multiplyScalar(amount);
  controls.target.add(step);
  camera.position.add(step);
}

// Passt das Seitenverhältnis an die neue Fenstergröße an.
export function resizeCamera() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
