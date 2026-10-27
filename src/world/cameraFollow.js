// Wem die Kamera folgt: außerhalb vom Kampf dem Spieler, im Kampf dem, der gerade dran ist.
import { on } from "../core/eventBus.js";
import { followWithCamera } from "./camera.js";

// Startet beim Spieler (sofort, ohne Gleiten) und wechselt bei jedem Zug.
export function setupCameraFollow(player) {
  followWithCamera(player.mesh, true);
  on("turnStarted", ({ combatant }) => followWithCamera(combatant.mesh));
  on("combatEnded", () => followWithCamera(player.mesh));
}
