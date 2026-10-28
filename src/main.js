// Startpunkt: steckt alle Module zusammen und startet den Spiel-Loop.
import { addUpdate, startLoop } from "./core/loop.js";
import { renderWorld } from "./world/scene.js";
import { updateCamera } from "./world/camera.js";
import "./style.css";

addUpdate(updateCamera, { whilePaused: true });
addUpdate(renderWorld, { whilePaused: true });

startLoop();
