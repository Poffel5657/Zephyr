// Windriding: Fähigkeiten mit den Windschuhen (erstmal der Doppelsprung). Jeder Sprung kostet eine Wind-Ladung
// und gibt Windriding-XP. Ladungen füllen sich außerhalb vom Kampf mit der Zeit auf, im Kampf eine pro eigenem Zug.
// Werte in skills.json unter windriding.
import SKILL_DATA from "../data/skills.json";
import { emit, on } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { getTile, isWalkable, getGridSize } from "../world/grid.js";
import { getLevel } from "./skills.js";
import { hasToolFor } from "../inventory/inventory.js";
import { isMoving, jumpTo } from "../player/movement.js";
import { isInCombat, isPlayerTurn, playerJump, getCombatState } from "../combat/combat.js";
import { showMessage } from "../ui/messages.js";

const WINDRIDING = SKILL_DATA.skills.windriding;
export const RIDING_ABILITIES = WINDRIDING.abilities;

let player = null;
let rechargeTimer = 0;

// Gibt zurück, ob der Charakter Windschuhe dabeihat (dann gibt es Windriding-Fähigkeiten).
export function hasWindBoots(character) {
  return hasToolFor(character.inventory, "windriding");
}

// Wie viele Ladungen höchstens: baseCharges + 1 alle levelsPerCharge Windriding-Level.
export function getMaxCharges(character) {
  const level = getLevel(character.skills.windriding ?? 0);
  return WINDRIDING.baseCharges + Math.floor(level / WINDRIDING.levelsPerCharge);
}

// Felder, auf die der Charakter mit dieser Fähigkeit springen kann (begehbar, frei, nicht zu hoch, nicht zu weit).
export function getJumpTargets(character, abilityId = "double_jump") {
  const ability = RIDING_ABILITIES[abilityId];
  const from = getTile(character.x, character.z);
  const targets = [];
  const size = getGridSize();
  for (let z = 0; z < size.depth; z++) {
    for (let x = 0; x < size.width; x++) {
      const distance = Math.abs(x - character.x) + Math.abs(z - character.z);
      if (distance === 0 || distance > ability.maxDistance || !isWalkable(x, z)) {
        continue;
      }
      const rise = getTile(x, z).height - from.height;
      if (rise <= ability.maxUp && -rise <= ability.maxDown) {
        targets.push({ x, z });
      }
    }
  }
  return targets;
}

// Prüft, ob die Fähigkeit gerade geht. null = ja, sonst der Grund als Meldung.
export function canUseAbility(character, abilityId) {
  const ability = RIDING_ABILITIES[abilityId];
  if (!hasWindBoots(character)) {
    return "You need wind boots";
  }
  if (character.windCharges <= 0) {
    return "No wind charges left";
  }
  if (isInCombat()) {
    if (!isPlayerTurn()) {
      return "Wait for your turn";
    }
    if (getCombatState().moveLeft < ability.combatMoveCost) {
      return "Not enough moves left";
    }
  } else if (isMoving()) {
    return "You are moving";
  }
  return null;
}

// Springt auf ein Feld. Im Kampf übernimmt der Kampf (Felder abziehen, besetzte Felder).
export function useJump(character, tile, abilityId = "double_jump") {
  const ability = RIDING_ABILITIES[abilityId];
  const reason = canUseAbility(character, abilityId);
  if (reason !== null) {
    showMessage(reason);
    return false;
  }
  if (!getJumpTargets(character, abilityId).some((target) => target.x === tile.x && target.z === tile.z)) {
    showMessage("You can't jump there");
    return false;
  }

  const landed = () => {
    emit("xpGained", { character, skill: "windriding", amount: WINDRIDING.jumpXp });
    emit("jumpLanded", { character, x: tile.x, z: tile.z });
  };
  const started = isInCombat()
    ? playerJump(tile, ability.combatMoveCost, ability, landed)
    : jumpTo(tile, ability, landed);
  if (started) {
    setCharges(character, character.windCharges - 1);
  }
  return started;
}

// Meldet Windriding an: Ladungen starten voll, füllen sich auf, im Kampf +1 pro eigenem Zug.
export function setupWindriding(character) {
  player = character;
  character.windCharges = getMaxCharges(character);

  on("turnStarted", ({ combatant }) => {
    if (combatant === character) {
      setCharges(character, character.windCharges + 1);
    }
  });
  // Höheres Windriding-Level kann mehr Ladungen geben
  on("skillLevelUp", (data) => {
    if (data.character === character && data.skill === "windriding") {
      setCharges(character, character.windCharges);
    }
  });

  addUpdate(updateRecharge);
}

// Außerhalb vom Kampf alle rechargeSeconds eine Ladung zurück.
function updateRecharge(deltaTime) {
  if (isInCombat() || player.windCharges >= getMaxCharges(player)) {
    rechargeTimer = 0;
    return;
  }
  rechargeTimer += deltaTime;
  if (rechargeTimer >= WINDRIDING.rechargeSeconds) {
    rechargeTimer = 0;
    setCharges(player, player.windCharges + 1);
  }
}

// Setzt die Ladungen (zwischen 0 und Maximum) und meldet "windChargesChanged".
function setCharges(character, charges) {
  character.windCharges = Math.max(0, Math.min(getMaxCharges(character), charges));
  emit("windChargesChanged", { character });
}
