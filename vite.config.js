import { defineConfig } from "vite";
import { gameEditorPlugin } from "./tools/gameEditorPlugin.js";

export default defineConfig({
  base: "/Zephyr/",
  // Der Game-Editor darf die Daten nur im Dev-Server (npm run dev) lesen und schreiben, nie online
  plugins: [gameEditorPlugin()],
});
