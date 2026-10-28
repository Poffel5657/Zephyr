// Setzt HTML-Elemente über eine 3D-Position (HP-Leisten, Rhythmus-Ringe, Aktions-Menü, Angelschnur).
import * as THREE from "three";

const projected = new THREE.Vector3();

// Setzt style.left/top des Elements auf die Bildschirm-Position von position (lift = so weit nach oben verschoben).
// Gibt false zurück und lässt das Element, wie es ist, wenn die Position hinter der Kamera liegt.
export function placeOnScreen(element, position, camera, lift = 0) {
  projected.copy(position);
  projected.y += lift;
  projected.project(camera);
  if (projected.z > 1) {
    return false;
  }
  element.style.left = ((projected.x + 1) / 2) * innerWidth + "px";
  element.style.top = ((1 - projected.y) / 2) * innerHeight + "px";
  return true;
}

// Gibt die Bildschirm-Position (Pixel) einer 3D-Position zurück, oder null, wenn sie hinter der Kamera liegt.
export function toScreen(position, camera) {
  projected.copy(position);
  projected.project(camera);
  if (projected.z > 1) {
    return null;
  }
  return { x: ((projected.x + 1) / 2) * innerWidth, y: ((1 - projected.y) / 2) * innerHeight };
}
