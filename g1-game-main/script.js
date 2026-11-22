/**
 * ============================================================================
 * CURATOR'S WING: THREE-HALL ESCAPE — GAME ENGINE
 * ============================================================================
 * Pure vanilla JavaScript (ES2022) implementing:
 *  - Clean game state machine (TITLE -> PLAYING -> GAME_OVER)
 *  - Three interconnected point-and-click rooms (Zoology, Arts, Astronomy)
 *  - Cross-room item dependencies (every room's Exit Seal requires 2 items
 *    discovered in the OTHER two rooms)
 *  - Mouse, Touch, and Keyboard controls (1/2/3, Arrows, Tab/Enter, H, I, M, Esc)
 *  - Score system, countdown timer, penalties, and localStorage High Score
 *  - Web Audio API synthesized sound effects with mute toggle
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// 1. CONSTANTS & STATIC GAME DEFINITIONS
// ---------------------------------------------------------------------------

const STORAGE_KEY = "curators_wing_high_score";
const INITIAL_TIME_SECONDS = 5 * 60; // 5 minutes
const ROOM_ORDER = ["zoology", "arts", "astronomy"];

/**
 * Catalog of all 9 collectible artifacts.
 * Each item originates in one wing and is used in another wing.
 */
const ITEM_CATALOG = {
  feather_brush: {
    id: "feather_brush",
    name: "Feather Brush",
    origin: "Zoology",
    color: "#2dc2a4",
    icon: "images/feather.png",
  },
  orrery_gear: {
    id: "orrery_gear",
    name: "Orrery Gear",
    origin: "Zoology",
    color: "#d4a553",
    icon: "images/gear.png",
  },
  ammonite_medallion: {
    id: "ammonite_medallion",
    name: "Ammonite Seal",
    origin: "Zoology",
    color: "#c99b44",
    icon: "images/seal.png",
  },
  amber_oil: {
    id: "amber_oil",
    name: "Amber Oil",
    origin: "Zoology",
    color: "#e5a93b",
    icon: "images/oil.png",
  },
  sculptor_chisel: {
    id: "sculptor_chisel",
    name: "Sculptor's Chisel",
    origin: "Arts",
    color: "#c4cdd9",
    icon: "images/chisel.png",
  },
  star_blueprint: {
    id: "star_blueprint",
    name: "Star Blueprint",
    origin: "Arts",
    color: "#6ea8f0",
    icon: "images/blueprint.png",
  },
  astrolabe_ring: {
    id: "astrolabe_ring",
    name: "Astrolabe Ring",
    origin: "Arts",
    color: "#f0cd83",
    icon: "images/ring.png",
  },
  solar_lens: {
    id: "solar_lens",
    name: "Solar Lens",
    origin: "Astronomy",
    color: "#88d4ff",
    icon: "images/lens.png",
  },
  meteor_tile: {
    id: "meteor_tile",
    name: "Meteorite Tile",
    origin: "Astronomy",
    color: "#b894f6",
    icon: "images/tile.png",
  },
};

const INVENTORY_ORDER = [
  "feather_brush",
  "orrery_gear",
  "ammonite_medallion",
  "amber_oil",
  "sculptor_chisel",
  "star_blueprint",
  "astrolabe_ring",
  "solar_lens",
  "meteor_tile",
];

/**
 * Exit Seal requirements per room — strictly enforcing cross-room item sharing.
 */
const SEAL_REQUIREMENTS = {
  zoology: {
    title: "Zoology Amber Beetle Seal",
    description:
      "Resin encases the brass lock plate. Fracture the resin with a sculpting tool from Arts, then focus starlight using an optical lens from Astronomy.",
    items: ["sculptor_chisel", "solar_lens"],
  },
  arts: {
    title: "Arts Chromatic Mosaic Seal",
    description:
      "Two sculpted recesses sit in the marble arch: a spiral fossil slot from Zoology and a celestial pigment socket from Astronomy.",
    items: ["ammonite_medallion", "meteor_tile"],
  },
  astronomy: {
    title: "Astronomy Celestial Hatch Seal",
    description:
      "The heavy brass airlock is seized tight. Lubricate the hinge with botanical oil from Zoology and engage the missing ring from Arts.",
    items: ["amber_oil", "astrolabe_ring"],
  },
};

/**
 * Color options for the Arts Paint Chest dial lock.
 */
const PAINT_COLORS = [
  { id: "crimson", label: "Crimson", hex: "#c93b42" },
  { id: "amber", label: "Amber", hex: "#e5a530" },
  { id: "cobalt", label: "Cobalt", hex: "#2e67ba" },
  { id: "emerald", label: "Emerald", hex: "#2c9c6b" },
  { id: "violet", label: "Violet", hex: "#7a49b8" },
  { id: "ivory", label: "Ivory", hex: "#dfd7c5" },
];

const CONSTELLATION_CHOICES = [
  "Orion",
  "Lyra",
  "Cygnus",
  "Draco",
  "Cassiopeia",
  "Perseus",
];

// ---------------------------------------------------------------------------
// 2. MUTABLE GAME STATE
// ---------------------------------------------------------------------------

let gameState = createFreshState();
let timerIntervalId = null;

/**
 * Creates a clean initial state object for new games and restarts.
 */
function createFreshState() {
  return {
    phase: "TITLE", // 'TITLE' | 'PLAYING' | 'GAME_OVER'
    currentRoom: "zoology",
    timeRemaining: INITIAL_TIME_SECONDS,
    score: 0,
    muted: false,
    selectedItem: null,
    ownedItems: new Set(),
    usedItems: new Set(),
    puzzles: {
      zooDrawerDigits: [0, 0, 0],
      zooDrawerSolved: false,
      zooTerrariumSolved: false,
      artsCanvasBrushed: false,
      artsChestColors: [3, 4, 5], // Start on Emerald, Violet, Ivory
      artsChestSolved: false,
      astroOrreryRepaired: false,
      astroSelectedStars: new Set(),
      astroConsoleSolved: false,
    },
    seals: {
      zoology: { itemsPlaced: new Set(), unlocked: false },
      arts: { itemsPlaced: new Set(), unlocked: false },
      astronomy: { itemsPlaced: new Set(), unlocked: false },
    },
  };
}

// ---------------------------------------------------------------------------
// 3. WEB AUDIO API SOUND SYNTHESIZER (Zero external sound assets)
// ---------------------------------------------------------------------------

let audioCtx = null;

function ensureAudioContext() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

function playTone(
  freq,
  durationSec,
  type = "sine",
  gainVal = 0.08,
  delaySec = 0,
) {
  if (gameState.muted) return;
  ensureAudioContext();
  if (!audioCtx) return;

  const now = audioCtx.currentTime + delaySec;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(gainVal, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + durationSec);
}

const SoundFX = {
  click() {
    playTone(520, 0.05, "triangle", 0.05);
  },
  pickup() {
    playTone(587, 0.09, "sine", 0.08, 0);
    playTone(880, 0.14, "sine", 0.08, 0.07);
  },
  solve() {
    playTone(523, 0.1, "triangle", 0.08, 0);
    playTone(659, 0.1, "triangle", 0.08, 0.08);
    playTone(784, 0.2, "triangle", 0.09, 0.16);
  },
  sealOpen() {
    playTone(392, 0.12, "sine", 0.09, 0);
    playTone(494, 0.12, "sine", 0.09, 0.1);
    playTone(587, 0.12, "sine", 0.09, 0.2);
    playTone(784, 0.28, "sine", 0.1, 0.3);
  },
  error() {
    playTone(190, 0.14, "sawtooth", 0.06, 0);
    playTone(150, 0.18, "sawtooth", 0.06, 0.1);
  },
  victory() {
    [523, 659, 784, 1046].forEach((f, idx) => {
      playTone(f, 0.25, "triangle", 0.1, idx * 0.11);
    });
  },
  gameOver() {
    [330, 294, 247, 196].forEach((f, idx) => {
      playTone(f, 0.22, "sawtooth", 0.06, idx * 0.13);
    });
  },
};

// ---------------------------------------------------------------------------
// 4. LOCAL STORAGE HIGH SCORE HELPERS
// ---------------------------------------------------------------------------

function loadHighScore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(score) {
  try {
    localStorage.setItem(STORAGE_KEY, String(score));
  } catch {
    // Ignore storage quota or private browsing errors gracefully
  }
}

// ---------------------------------------------------------------------------
// 5. DOM REFERENCES
// ---------------------------------------------------------------------------

const dom = {
  startScreen: document.getElementById("start-screen"),
  gameScreen: document.getElementById("game-screen"),
  gameoverScreen: document.getElementById("gameover-screen"),

  startHighScore: document.getElementById("start-high-score"),
  btnStartGame: document.getElementById("btn-start-game"),
  btnOpenInstructions: document.getElementById("btn-open-instructions"),

  hudSealCount: document.getElementById("hud-seal-count"),
  hudTimer: document.getElementById("hud-timer"),
  hudScore: document.getElementById("hud-score"),
  btnHint: document.getElementById("btn-hint"),
  btnHelpIngame: document.getElementById("btn-help-ingame"),
  btnMute: document.getElementById("btn-mute"),

  roomTabs: Array.from(document.querySelectorAll(".room-tab")),
  roomSvgs: {
    zoology: document.getElementById("room-zoology"),
    arts: document.getElementById("room-arts"),
    astronomy: document.getElementById("room-astronomy"),
  },

  clueBar: document.querySelector(".clue-bar"),
  clueText: document.getElementById("clue-text"),
  activeItemBanner: document.getElementById("active-item-banner"),
  inventoryGrid: document.getElementById("inventory-grid"),
  inventoryDock: document.getElementById("inventory-dock"),

  modalInstructions: document.getElementById("modal-instructions"),
  modalPuzzle: document.getElementById("modal-puzzle"),
  puzzleModalTitle: document.getElementById("puzzle-modal-title"),
  puzzleModalBody: document.getElementById("puzzle-modal-body"),

  gameoverKicker: document.getElementById("gameover-kicker"),
  gameoverTitle: document.getElementById("gameover-title"),
  gameoverMessage: document.getElementById("gameover-message"),
  finalScore: document.getElementById("final-score"),
  finalHighScore: document.getElementById("final-high-score"),
  finalSeals: document.getElementById("final-seals"),
  finalTime: document.getElementById("final-time"),
  newRecordBanner: document.getElementById("new-record-banner"),
  btnPlayAgain: document.getElementById("btn-play-again"),
  btnBackTitle: document.getElementById("btn-back-title"),
};

// ---------------------------------------------------------------------------
// 6. UI RENDERING & FEEDBACK HELPERS
// ---------------------------------------------------------------------------

function formatTime(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function setClueMessage(message, tone = "neutral") {
  dom.clueText.textContent = message;
  dom.clueBar.classList.remove("clue-bar--error", "clue-bar--success");
  if (tone === "error") dom.clueBar.classList.add("clue-bar--error");
  if (tone === "success") dom.clueBar.classList.add("clue-bar--success");
}

//points
function addScore(points) {
  gameState.score = Math.max(0, gameState.score + points);
  renderHud();
}

function applyPenalty(pointsPenalty = 25, secondsPenalty = 15) {
  gameState.score = Math.max(0, gameState.score - pointsPenalty);
  gameState.timeRemaining = Math.max(
    0,
    gameState.timeRemaining - secondsPenalty,
  );
  SoundFX.error();
  renderHud();
  if (gameState.timeRemaining <= 0) {
    finishGame(false);
  }
}

function renderHud() {
  const unlockedCount = ROOM_ORDER.filter(
    (r) => gameState.seals[r].unlocked,
  ).length;
  dom.hudSealCount.textContent = `${unlockedCount} / 3 Seals Open`;
  dom.hudTimer.textContent = formatTime(gameState.timeRemaining);
  dom.hudTimer.classList.toggle(
    "hud-stat-val--warning",
    gameState.timeRemaining <= 120,
  );
  dom.hudScore.textContent = `${gameState.score} pts`;
  dom.btnMute.textContent = gameState.muted ? "Muted" : "Sound On";
  dom.btnMute.setAttribute("aria-pressed", String(gameState.muted));

  // Update each room tab seal indicator
  ROOM_ORDER.forEach((room) => {
    const statusEl = document.getElementById(`tab-status-${room}`);
    const isUnlocked = gameState.seals[room].unlocked;
    statusEl.textContent = isUnlocked ? "Open" : "Locked";
    statusEl.classList.toggle("room-tab-status--unlocked", isUnlocked);

    const svgLabel = document.getElementById(
      room === "zoology"
        ? "zoo-seal-status-svg"
        : room === "arts"
          ? "arts-seal-status-svg"
          : "astro-seal-status-svg",
    );
    if (svgLabel) {
      svgLabel.textContent = isUnlocked ? "SEAL OPEN" : "SEAL LOCKED";
      svgLabel.setAttribute("fill", isUnlocked ? "#34c38f" : "#f0cd83");
    }
  });
}

/**
 * Syncs SVG visual states (collected brush, dusted canvas, spinning orrery, etc.)
 */
function renderSceneVisuals() {
  // Zoology brush pickup visibility
  const brushHotspot = document.getElementById("hs-zoo-brush");
  brushHotspot.classList.toggle(
    "hotspot--collected",
    gameState.ownedItems.has("feather_brush"),
  );

  // Zoology drawer code display
  const drawerCodeEl = document.getElementById("zoo-drawer-code-label");
  drawerCodeEl.textContent = gameState.puzzles.zooDrawerSolved
    ? "OPEN"
    : gameState.puzzles.zooDrawerDigits.join(" - ");

  // Zoology terrarium oil visibility
  const oilEl = document.getElementById("zoo-terrarium-oil");
  oilEl.style.opacity = gameState.puzzles.zooTerrariumSolved ? "0.25" : "1";

  // Arts dusty canvas veil
  const dustEl = document.getElementById("arts-canvas-dust");
  dustEl.classList.toggle("dust-cleared", gameState.puzzles.artsCanvasBrushed);

  // Arts paint chest dial swatches
  const dotIds = ["arts-chest-dot-1", "arts-chest-dot-2", "arts-chest-dot-3"];
  dotIds.forEach((id, idx) => {
    const colorObj = PAINT_COLORS[gameState.puzzles.artsChestColors[idx]];
    document.getElementById(id).setAttribute("fill", colorObj.hex);
  });

  // Astronomy orrery spinning core & label
  const orreryCore = document.getElementById("astro-orrery-core");
  const orreryLabel = document.getElementById("astro-orrery-label");
  if (gameState.puzzles.astroOrreryRepaired) {
    orreryCore.setAttribute("fill", "#e5b96b");
    orreryCore.removeAttribute("stroke-dasharray");
    orreryCore.classList.add("orrery-spinning");
    orreryLabel.textContent = "RUNNING";
  } else {
    orreryCore.setAttribute("fill", "#2c3a57");
    orreryCore.setAttribute("stroke-dasharray", "4 3");
    orreryCore.classList.remove("orrery-spinning");
    orreryLabel.textContent = "NEEDS GEAR";
  }

  // Astronomy telescope rotation once calibrated
  const tube = document.getElementById("astro-telescope-tube");
  tube.setAttribute(
    "transform",
    gameState.puzzles.astroConsoleSolved
      ? "rotate(-52 164 250)"
      : "rotate(-32 164 250)",
  );
}

/**
 * Renders the 9-slot bottom inventory bar with active equip highlights.
 */
function renderInventory() {
  dom.inventoryGrid.innerHTML = "";

  INVENTORY_ORDER.forEach((itemId) => {
    const item = ITEM_CATALOG[itemId];
    const owned = gameState.ownedItems.has(itemId);
    const used = gameState.usedItems.has(itemId);
    const selected = gameState.selectedItem === itemId;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "inv-slot";

    if (!owned) {
      btn.classList.add("inv-slot--empty");
      btn.disabled = true;
      btn.setAttribute("aria-label", "Undiscovered artifact slot");
      btn.innerHTML = `<span class="inv-name">Empty</span><span class="inv-meta">${item.origin}</span>`;
    } else {
      btn.classList.add("inv-slot--owned");
      if (selected) btn.classList.add("inv-slot--selected");
      if (used) btn.classList.add("inv-slot--used");

      btn.setAttribute(
        "aria-label",
        `${item.name} from ${item.origin}${used ? " (Already used)" : ""}`,
      );
      btn.setAttribute("aria-pressed", String(selected));
      btn.innerHTML = `
        <span class="inv-icon">
        <img src="${item.icon}" alt="${item.name}" />
        </span>
        <span class="inv-name">${item.name}</span>
        <span class="inv-meta">${used ? "Used" : item.origin}</span>
      `;
      btn.addEventListener("click", () => toggleSelectItem(itemId));
    }

    dom.inventoryGrid.appendChild(btn);
  });

  if (gameState.selectedItem) {
    const active = ITEM_CATALOG[gameState.selectedItem];
    dom.activeItemBanner.textContent = `Equipped: ${active.name} — Click a target object or Exit Seal to use it.`;
    dom.activeItemBanner.classList.add("active-item-banner--equipped");
  } else {
    dom.activeItemBanner.textContent =
      "Select an artifact below, then click an object in any room to use it.";
    dom.activeItemBanner.classList.remove("active-item-banner--equipped");
  }
}

function toggleSelectItem(itemId) {
  if (!gameState.ownedItems.has(itemId) || gameState.usedItems.has(itemId))
    return;
  SoundFX.click();
  gameState.selectedItem = gameState.selectedItem === itemId ? null : itemId;
  renderInventory();
}

function giveItem(itemId) {
  if (!gameState.ownedItems.has(itemId)) {
    gameState.ownedItems.add(itemId);
    addScore(50);
    SoundFX.pickup();
  }
  renderInventory();
}

function markItemUsed(itemId) {
  gameState.usedItems.add(itemId);
  if (gameState.selectedItem === itemId) {
    gameState.selectedItem = null;
  }
  renderInventory();
}

// ---------------------------------------------------------------------------
// 7. SCREEN & ROOM NAVIGATION
// ---------------------------------------------------------------------------

function showScreen(screenName) {
  dom.startScreen.classList.toggle("screen--active", screenName === "TITLE");
  dom.startScreen.hidden = screenName !== "TITLE";

  dom.gameScreen.classList.toggle("screen--active", screenName === "PLAYING");
  dom.gameScreen.setAttribute("aria-hidden", String(screenName !== "PLAYING"));

  dom.gameoverScreen.classList.toggle(
    "screen--active",
    screenName === "GAME_OVER",
  );
  dom.gameoverScreen.hidden = screenName !== "GAME_OVER";
}

function switchRoom(roomId) {
  if (!ROOM_ORDER.includes(roomId) || gameState.phase !== "PLAYING") return;
  SoundFX.click();
  gameState.currentRoom = roomId;

  dom.roomTabs.forEach((tab) => {
    const active = tab.dataset.room === roomId;
    tab.classList.toggle("room-tab--active", active);
    tab.setAttribute("aria-pressed", String(active));
  });

  ROOM_ORDER.forEach((id) => {
    dom.roomSvgs[id].classList.toggle("room-svg--active", id === roomId);
  });

  const roomLabels = {
    zoology:
      "Entered Zoology Hall — inspect specimens, ledger, terrarium, and drawer lock.",
    arts: "Entered Arts Gallery — inspect frames, dusty canvas, bust, and paint chest.",
    astronomy:
      "Entered Astronomy Dome — inspect telescope console, orrery, and star notes.",
  };
  setClueMessage(roomLabels[roomId]);
}

function openModal(modalEl) {
  modalEl.hidden = false;
  const focusTarget = modalEl.querySelector("button, select");
  if (focusTarget) focusTarget.focus();
}

function closeModal(modalEl) {
  modalEl.hidden = true;
}

function closeAllModals() {
  closeModal(dom.modalInstructions);
  closeModal(dom.modalPuzzle);
}

// ---------------------------------------------------------------------------
// 8. GAME LIFECYCLE (Start, Timer Loop, Win/Loss Detection, Restart)
// ---------------------------------------------------------------------------

function startGame() {
  // Request landscape orientation on supported mobile browsers
  if (
    window.matchMedia("(max-width: 960px)").matches &&
    screen.orientation?.lock
  ) {
    screen.orientation.lock("landscape").catch(() => {
      // Browser does not allow orientation locking
    });
  }

  ensureAudioContext();
  stopTimer();

  const preservedMute = gameState.muted;
  gameState = createFreshState();
  gameState.muted = preservedMute;
  gameState.phase = "PLAYING";

  closeAllModals();
  showScreen("PLAYING");
  switchRoom("zoology");
  renderHud();
  renderSceneVisuals();
  renderInventory();
  setClueMessage(
    "You are locked inside the Mysteria’s Chamber! Explore all three rooms and gather cross-room artifacts to open every Exit Seal.",
  );

  timerIntervalId = window.setInterval(() => {
    if (gameState.phase !== "PLAYING") return;
    gameState.timeRemaining -= 1;
    renderHud();
    if (gameState.timeRemaining <= 0) {
      finishGame(false);
    }
  }, 1000);
}

function stopTimer() {
  if (timerIntervalId !== null) {
    window.clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

//delay finish
function checkWinCondition() {
  const allUnlocked = ROOM_ORDER.every(
    (room) => gameState.seals[room].unlocked,
  );
  if (allUnlocked) {
    stopTimer();

    window.setTimeout(() => {
      finishGame(true);
    }, 450);
  }
}

function finishGame(didWin) {
  if (gameState.phase !== "PLAYING") return;
  gameState.phase = "GAME_OVER";
  stopTimer();
  closeAllModals();
  //timebonus
  if (didWin) {
    const timeBonus = gameState.timeRemaining * 2;
    gameState.score += timeBonus;
    SoundFX.victory();
  } else {
    SoundFX.gameOver();
  }

  const prevHigh = loadHighScore();
  const isNewRecord = gameState.score > prevHigh;
  const bestScore = isNewRecord ? gameState.score : prevHigh;
  if (isNewRecord) {
    saveHighScore(bestScore);
  }

  const unlockedCount = ROOM_ORDER.filter(
    (r) => gameState.seals[r].unlocked,
  ).length;

  dom.gameoverKicker.textContent = didWin
    ? "All Chamber Seals Opened"
    : "Lockdown Engaged";
  dom.gameoverTitle.textContent = didWin ? "You Escaped!" : "Time Expired";
  dom.gameoverMessage.textContent = didWin
    ? `Brilliant deduction! You unlatched Zoology, Arts, and Astronomy with ${formatTime(gameState.timeRemaining)} to spare (including +${gameState.timeRemaining * 2} pts time bonus).`
    : "The museum security shutters sealed before all three wing locks could be opened.";

  dom.finalScore.textContent = `${gameState.score} pts`;
  dom.finalHighScore.textContent = `${bestScore} pts`;
  dom.finalSeals.textContent = `${unlockedCount} / 3`;
  dom.finalTime.textContent = formatTime(gameState.timeRemaining);
  dom.newRecordBanner.hidden = !isNewRecord;

  showScreen("GAME_OVER");
}

// ---------------------------------------------------------------------------
// 9. INTERACTIVE HOTSPOT & PUZZLE HANDLERS
// ---------------------------------------------------------------------------

function handleHotspotInteraction(hotspotId) {
  if (gameState.phase !== "PLAYING") return;

  switch (hotspotId) {
    // --- ROOM 1: ZOOLOGY ---
    case "zoo-jars":
      SoundFX.click();
      setClueMessage(
        "Specimen Plaque: Jar I = Stag Beetle (6 legs) · Jar II = Barn Owl (2 wings) · Jar III = Monarch Butterfly (4 wings).",
      );
      break;

    case "zoo-brush":
      if (!gameState.ownedItems.has("feather_brush")) {
        giveItem("feather_brush");
        renderSceneVisuals();
        setClueMessage(
          "Picked up Peacock Feather Brush! Soft plumes ideal for dusting fragile oil paintings in the Arts Gallery.",
          "success",
        );
      }
      break;

    case "zoo-ledger":
      SoundFX.click();
      setClueMessage(
        'Field Ledger: "Dust on the Arts canvas needs a gentle Feather Brush. Our Amber Seal requires a Sculptor’s Chisel (Arts) and Solar Lens (Astronomy)."',
      );
      break;

    case "zoo-drawer":
      openZooDrawerPuzzle();
      break;

    case "zoo-terrarium":
      openZooTerrariumPuzzle();
      break;

    case "zoo-exit-seal":
      handleSealInteraction("zoology");
      break;

    // --- ROOM 2: ARTS ---
    case "arts-frames":
      SoundFX.click();
      setClueMessage(
        'Gallery Plaque: "The Chromatic Mosaic Seal awaits an Ammonite Fossil from Zoology and a Meteorite Pigment Tile from Astronomy."',
      );
      break;

    case "arts-easel":
      if (gameState.puzzles.artsCanvasBrushed) {
        SoundFX.click();
        setClueMessage(
          "Cleaned Canvas: Three vivid pigment stripes remain — Crimson (top), Amber (middle), Cobalt (bottom).",
        );
      } else if (gameState.selectedItem === "feather_brush") {
        gameState.puzzles.artsCanvasBrushed = true;
        markItemUsed("feather_brush");
        addScore(50);
        SoundFX.solve();
        renderSceneVisuals();
        setClueMessage(
          "You sweep away the dust veil! Three brushstrokes appear in order: Crimson, Amber, Cobalt.",
          "success",
        );
      } else if (gameState.ownedItems.has("feather_brush")) {
        SoundFX.click();
        setClueMessage(
          "Thick dust covers this canvas. Select the Peacock Feather Brush in your inventory first, then click the easel.",
        );
      } else {
        SoundFX.click();
        setClueMessage(
          "Thick century-old dust coats the canvas. Bare hands would smear it—search Zoology for a delicate brush.",
        );
      }
      break;

    case "arts-bust":
      SoundFX.click();
      setClueMessage(
        'Urania Bust Inscription: "Three northern beacons guide the dome: the Hunter (Orion), the Harp (Lyra), and the Swan (Cygnus)."',
      );
      break;

    case "arts-paint-chest":
      openArtsChestPuzzle();
      break;

    case "arts-exit-seal":
      handleSealInteraction("arts");
      break;

    // --- ROOM 3: ASTRONOMY ---
    case "astro-desk":
      SoundFX.click();
      setClueMessage(
        'Observatory Log: "Our Celestial Hatch requires Botanical Amber Oil (Zoology) and a Gilded Astrolabe Ring (Arts)."',
      );
      break;

    case "astro-orrery":
      if (gameState.puzzles.astroOrreryRepaired) {
        SoundFX.click();
        setClueMessage(
          "The brass planetary orrery turns steadily. You already retrieved the Solar Crystal Lens from its base.",
        );
      } else if (gameState.selectedItem === "orrery_gear") {
        gameState.puzzles.astroOrreryRepaired = true;
        markItemUsed("orrery_gear");
        addScore(50);
        giveItem("solar_lens");
        SoundFX.solve();
        renderSceneVisuals();
        setClueMessage(
          "You fit the Brass Orrery Gear! The planets revolve and reveal a Solar Crystal Lens (needed in Zoology).",
          "success",
        );
      } else if (gameState.ownedItems.has("orrery_gear")) {
        SoundFX.click();
        setClueMessage(
          "A toothed gear is missing from the planetary drive. Select your Brass Orrery Gear below, then click the orrery.",
        );
      } else {
        SoundFX.click();
        setClueMessage(
          "The planetary orrery is jammed—its central brass gear is missing. Search the Zoology cabinets for a spare.",
        );
      }
      break;

    case "astro-console":
      openAstroConsolePuzzle();
      break;

    case "astro-exit-seal":
      handleSealInteraction("astronomy");
      break;

    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// 10. PUZZLE MODALS (Zoology Drawer, Terrarium, Arts Chest, Star Console, Seals)
// ---------------------------------------------------------------------------

/**
 * PUZZLE 1A: Zoology 3-Digit Specimen Drawer (Answer: 6 - 2 - 4)
 */
function openZooDrawerPuzzle() {
  if (gameState.puzzles.zooDrawerSolved) {
    SoundFX.click();
    setClueMessage(
      "The Zoology Specimen Drawer is already open; you collected the Brass Orrery Gear and Ammonite Seal.",
    );
    return;
  }

  SoundFX.click();
  dom.puzzleModalTitle.textContent = "Zoology Specimen Drawer Lock";

  const renderDrawerBody = (feedback = "", isOk = false) => {
    const digits = gameState.puzzles.zooDrawerDigits;
    dom.puzzleModalBody.innerHTML = `
      <p class="puzzle-desc">
        Enter the limb &amp; wing counts of Specimens <strong>I</strong>, <strong>II</strong>, and <strong>III</strong>
        displayed on the upper mahogany shelf.
      </p>
      <div class="dial-row">
        ${digits
          .map(
            (val, idx) => `
          <div class="digit-tumbler">
            <button type="button" class="tumbler-btn" data-digit-idx="${idx}" data-delta="1" aria-label="Increase digit ${idx + 1}">▲</button>
            <span class="tumbler-value">${val}</span>
            <button type="button" class="tumbler-btn" data-digit-idx="${idx}" data-delta="-1" aria-label="Decrease digit ${idx + 1}">▼</button>
          </div>
        `,
          )
          .join("")}
      </div>
      <p class="puzzle-feedback ${isOk ? "puzzle-feedback--ok" : ""}">${feedback}</p>
      <div class="modal-footer">
        <button type="button" id="btn-submit-drawer" class="btn btn--primary">Unlock Drawer</button>
      </div>
    `;

    dom.puzzleModalBody.querySelectorAll(".tumbler-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        SoundFX.click();
        const i = Number(btn.dataset.digitIdx);
        const delta = Number(btn.dataset.delta);
        gameState.puzzles.zooDrawerDigits[i] =
          (gameState.puzzles.zooDrawerDigits[i] + delta + 10) % 10;
        renderSceneVisuals();
        renderDrawerBody();
      });
    });

    document
      .getElementById("btn-submit-drawer")
      .addEventListener("click", () => {
        const code = gameState.puzzles.zooDrawerDigits.join("");
        if (code === "624") {
          gameState.puzzles.zooDrawerSolved = true;
          addScore(100);
          giveItem("orrery_gear");
          giveItem("ammonite_medallion");
          SoundFX.solve();
          renderSceneVisuals();
          closeModal(dom.modalPuzzle);
          setClueMessage(
            "Drawer unlocked (6-2-4)! Found Brass Orrery Gear (Astronomy) and Ammonite Seal (Arts Exit).",
            "success",
          );
        } else {
          applyPenalty(25, 15);
          renderDrawerBody(
            "Incorrect combination (-25 pts, -15s). Check the three jars on the shelf!",
          );
        }
      });
  };

  renderDrawerBody();
  openModal(dom.modalPuzzle);
}

/**
 * PUZZLE 1B: Zoology Glass Habitat Terrarium Match
 */
function openZooTerrariumPuzzle() {
  if (gameState.puzzles.zooTerrariumSolved) {
    SoundFX.click();
    setClueMessage(
      "The Glass Habitat Terrarium is open; you already retrieved the Botanical Amber Oil.",
    );
    return;
  }

  SoundFX.click();
  dom.puzzleModalTitle.textContent = "Habitat Terrarium Latch";

  dom.puzzleModalBody.innerHTML = `
    <p class="puzzle-desc">
      Match each zoological specimen to its native biome to release the glass terrarium latch.
    </p>
    <div class="habitat-rows">
      <div class="habitat-row">
        <label for="hab-beetle" class="habitat-creature">Emerald Scarab Beetle</label>
        <select id="hab-beetle" class="habitat-select">
          <option value="">Choose biome...</option>
          <option value="canopy">Rainforest Canopy</option>
          <option value="savanna">Arid Savanna</option>
          <option value="reef">Coral Reef</option>
        </select>
      </div>
      <div class="habitat-row">
        <label for="hab-cobra" class="habitat-creature">Golden Savannah Adder</label>
        <select id="hab-cobra" class="habitat-select">
          <option value="">Choose biome...</option>
          <option value="canopy">Rainforest Canopy</option>
          <option value="savanna">Arid Savanna</option>
          <option value="reef">Coral Reef</option>
        </select>
      </div>
      <div class="habitat-row">
        <label for="hab-nautilus" class="habitat-creature">Chambered Nautilus</label>
        <select id="hab-nautilus" class="habitat-select">
          <option value="">Choose biome...</option>
          <option value="canopy">Rainforest Canopy</option>
          <option value="savanna">Arid Savanna</option>
          <option value="reef">Coral Reef</option>
        </select>
      </div>
    </div>
    <p id="hab-feedback" class="puzzle-feedback"></p>
    <div class="modal-footer">
      <button type="button" id="btn-submit-habitat" class="btn btn--primary">Release Latch</button>
    </div>
  `;

  document
    .getElementById("btn-submit-habitat")
    .addEventListener("click", () => {
      const beetle = document.getElementById("hab-beetle").value;
      const cobra = document.getElementById("hab-cobra").value;
      const nautilus = document.getElementById("hab-nautilus").value;

      if (beetle === "canopy" && cobra === "savanna" && nautilus === "reef") {
        gameState.puzzles.zooTerrariumSolved = true;
        addScore(100);
        giveItem("amber_oil");
        SoundFX.solve();
        renderSceneVisuals();
        closeModal(dom.modalPuzzle);
        setClueMessage(
          "Terrarium unlatched! Retrieved Botanical Amber Oil (needed to lubricate the Astronomy Hatch).",
          "success",
        );
      } else {
        applyPenalty(25, 15);
        document.getElementById("hab-feedback").textContent =
          "Mismatch (-25 pts, -15s). Match each creature to its natural environment.";
      }
    });

  openModal(dom.modalPuzzle);
}

/**
 * PUZZLE 2: Arts Chromatic Paint Chest Lock (Answer: Crimson - Amber - Cobalt)
 */
function openArtsChestPuzzle() {
  if (gameState.puzzles.artsChestSolved) {
    SoundFX.click();
    setClueMessage(
      "The Paint Chest is open; you already retrieved the Sculptor’s Chisel, Star Blueprint, and Astrolabe Ring.",
    );
    return;
  }

  SoundFX.click();
  dom.puzzleModalTitle.textContent = "Chromatic Paint Chest";

  const renderChestBody = (feedback = "") => {
    const dials = gameState.puzzles.artsChestColors;
    dom.puzzleModalBody.innerHTML = `
      <p class="puzzle-desc">
        Click each pigment dial to cycle colors and match the 3-stroke sequence hidden beneath
        the dusty easel canvas (top to bottom).
      </p>
      <div class="dial-row">
        ${dials
          .map((colorIdx, slotIdx) => {
            const color = PAINT_COLORS[colorIdx];
            return `
            <button type="button" class="color-dial-btn" data-color-slot="${slotIdx}">
              <span class="color-swatch" style="background-color: ${color.hex};"></span>
              <span>${color.label}</span>
            </button>
          `;
          })
          .join("")}
      </div>
      <p class="puzzle-feedback">${feedback}</p>
      <div class="modal-footer">
        <button type="button" id="btn-submit-chest" class="btn btn--primary">Open Chest</button>
      </div>
    `;

    dom.puzzleModalBody.querySelectorAll(".color-dial-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        SoundFX.click();
        const idx = Number(btn.dataset.colorSlot);
        gameState.puzzles.artsChestColors[idx] =
          (gameState.puzzles.artsChestColors[idx] + 1) % PAINT_COLORS.length;
        renderSceneVisuals();
        renderChestBody();
      });
    });

    document
      .getElementById("btn-submit-chest")
      .addEventListener("click", () => {
        const selectedIds = gameState.puzzles.artsChestColors.map(
          (i) => PAINT_COLORS[i].id,
        );
        if (
          selectedIds[0] === "crimson" &&
          selectedIds[1] === "amber" &&
          selectedIds[2] === "cobalt"
        ) {
          gameState.puzzles.artsChestSolved = true;
          addScore(100);
          giveItem("sculptor_chisel");
          giveItem("star_blueprint");
          giveItem("astrolabe_ring");
          SoundFX.solve();
          closeModal(dom.modalPuzzle);
          setClueMessage(
            "Paint Chest opened! Acquired Sculptor’s Chisel (Zoology Exit), Star Blueprint (Astronomy Console), and Astrolabe Ring (Astronomy Exit).",
            "success",
          );
        } else {
          applyPenalty(25, 15);
          renderChestBody(
            "Wrong color triad (-25 pts, -15s). Sweep the dusty easel canvas first!",
          );
        }
      });
  };

  renderChestBody();
  openModal(dom.modalPuzzle);
}

/**
 * PUZZLE 3: Astronomy Star Dome Constellation Console (Answer: Orion, Lyra, Cygnus)
 */
function openAstroConsolePuzzle() {
  if (gameState.puzzles.astroConsoleSolved) {
    SoundFX.click();
    setClueMessage(
      "The Telescope is aligned to Orion, Lyra, and Cygnus; you retrieved the Meteorite Pigment Tile.",
    );
    return;
  }

  SoundFX.click();
  dom.puzzleModalTitle.textContent = "Star Dome Constellation Console";

  const renderConsoleBody = (feedback = "") => {
    const hasBlueprint = gameState.ownedItems.has("star_blueprint");
    const selected = gameState.puzzles.astroSelectedStars;

    dom.puzzleModalBody.innerHTML = `
      ${
        hasBlueprint
          ? `<div class="blueprint-callout"><strong>Constellation Blueprint (from Arts):</strong> Align the dome to <strong>Orion</strong>, <strong>Lyra</strong>, and <strong>Cygnus</strong>.</div>`
          : `<div class="blueprint-callout">You have not collected the <strong>Star Blueprint</strong> from the Arts Gallery yet (or examine Urania’s bust in Arts).</div>`
      }
      <p class="puzzle-desc">Select exactly <strong>3 constellations</strong> to rotate the observatory dome:</p>
      <div class="constellation-grid">
        ${CONSTELLATION_CHOICES.map((name) => {
          const isActive = selected.has(name);
          return `
            <button
              type="button"
              class="constellation-btn ${isActive ? "constellation-btn--active" : ""}"
              data-star="${name}"
              aria-pressed="${isActive}"
            >
              ${name}
            </button>
          `;
        }).join("")}
      </div>
      <p class="puzzle-feedback">${feedback}</p>
      <div class="modal-footer">
        <button type="button" id="btn-submit-stars" class="btn btn--primary">Align Telescope</button>
      </div>
    `;

    dom.puzzleModalBody
      .querySelectorAll(".constellation-btn")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          SoundFX.click();
          const star = btn.dataset.star;
          if (selected.has(star)) {
            selected.delete(star);
          } else if (selected.size < 3) {
            selected.add(star);
          } else {
            // Replace oldest selection cleanly if 3 already active
            const first = selected.values().next().value;
            selected.delete(first);
            selected.add(star);
          }
          renderConsoleBody();
        });
      });

    document
      .getElementById("btn-submit-stars")
      .addEventListener("click", () => {
        const valid =
          selected.size === 3 &&
          selected.has("Orion") &&
          selected.has("Lyra") &&
          selected.has("Cygnus");

        if (valid) {
          gameState.puzzles.astroConsoleSolved = true;
          if (hasBlueprint) markItemUsed("star_blueprint");
          addScore(100);
          giveItem("meteor_tile");
          SoundFX.solve();
          renderSceneVisuals();
          closeModal(dom.modalPuzzle);
          setClueMessage(
            "Dome aligned! The Observatory Vault opened, revealing the Meteorite Pigment Tile (needed for Arts Exit Seal).",
            "success",
          );
        } else {
          applyPenalty(25, 15);
          renderConsoleBody(
            "Misaligned coordinates (-25 pts, -15s). Select the 3 beacons named in Arts.",
          );
        }
      });
  };

  renderConsoleBody();
  openModal(dom.modalPuzzle);
}

/**
 * EXIT SEALS: Handles both direct item usage AND interactive Seal Socket Modal
 */
function handleSealInteraction(roomId) {
  const sealState = gameState.seals[roomId];
  const req = SEAL_REQUIREMENTS[roomId];

  if (sealState.unlocked) {
    SoundFX.click();
    setClueMessage(`${req.title} is already open!`, "success");
    return;
  }

  // If the player currently has a matching required item equipped, slot it immediately!
  if (gameState.selectedItem && req.items.includes(gameState.selectedItem)) {
    placeArtifactInSeal(roomId, gameState.selectedItem);
    return;
  }

  // Otherwise open the interactive Seal Modal showing both required cross-room items
  openSealModal(roomId);
}

function placeArtifactInSeal(roomId, itemId) {
  const sealState = gameState.seals[roomId];
  const req = SEAL_REQUIREMENTS[roomId];
  if (sealState.itemsPlaced.has(itemId) || !gameState.ownedItems.has(itemId))
    return;

  sealState.itemsPlaced.add(itemId);
  markItemUsed(itemId);
  addScore(50);

  if (req.items.every((id) => sealState.itemsPlaced.has(id))) {
    sealState.unlocked = true;
    addScore(200);
    SoundFX.sealOpen();
    renderHud();
    closeModal(dom.modalPuzzle);
    setClueMessage(`${req.title} UNLOCKED!`, "success");
    checkWinCondition();
  } else {
    SoundFX.solve();
    renderHud();
    setClueMessage(
      `Fitted ${ITEM_CATALOG[itemId].name} into ${req.title}. One more cross-room artifact required.`,
      "success",
    );
    if (!dom.modalPuzzle.hidden) {
      openSealModal(roomId);
    }
  }
}

function openSealModal(roomId) {
  const sealState = gameState.seals[roomId];
  const req = SEAL_REQUIREMENTS[roomId];

  SoundFX.click();
  dom.puzzleModalTitle.textContent = req.title;

  dom.puzzleModalBody.innerHTML = `
    <p class="puzzle-desc">${req.description}</p>
    <div class="seal-sockets">
      ${req.items
        .map((itemId) => {
          const item = ITEM_CATALOG[itemId];
          const placed = sealState.itemsPlaced.has(itemId);
          const owned = gameState.ownedItems.has(itemId);
          return `
          <div class="seal-socket ${placed ? "seal-socket--filled" : ""}">
            <div class="seal-socket-info">
              <strong>${item.name}</strong>
              <span>Found in ${item.origin} Wing</span>
            </div>
            ${
              placed
                ? `<span class="puzzle-feedback puzzle-feedback--ok">Fitted</span>`
                : owned
                  ? `<button type="button" class="btn btn--primary" data-place-seal="${itemId}">Insert Item</button>`
                  : `<span class="inv-meta">Not Found Yet</span>`
            }
          </div>
        `;
        })
        .join("")}
    </div>
  `;

  dom.puzzleModalBody.querySelectorAll("[data-place-seal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      placeArtifactInSeal(roomId, btn.dataset.placeSeal);
    });
  });

  openModal(dom.modalPuzzle);
}

// ---------------------------------------------------------------------------
// 11. CONTEXTUAL HINT ENGINE (-50 pts)
// ---------------------------------------------------------------------------

function triggerHint() {
  if (gameState.phase !== "PLAYING") return;

  // Check if the player has enough points
  if (gameState.score < 50) {
    setClueMessage(
      "Not enough points! You need at least 50 points to use a hint.",
      "error",
    );
    SoundFX.error();
    return;
  }

  SoundFX.click();

  let hint =
    "Inspect every object in all three wings to gather clues and artifacts.";

  if (!gameState.ownedItems.has("feather_brush")) {
    hint =
      "Hint: Pick up the Peacock Feather Brush from the upper shelf in Zoology.";
  } else if (!gameState.puzzles.zooDrawerSolved) {
    hint =
      "Hint: In Zoology, check the three specimen jars (6 legs, 2 wings, 4 wings) to unlock the 6-2-4 drawer.";
  } else if (!gameState.puzzles.zooTerrariumSolved) {
    hint =
      "Hint: In Zoology, match Beetle→Canopy, Adder→Savanna, Nautilus→Reef on the Glass Terrarium.";
  } else if (!gameState.puzzles.artsCanvasBrushed) {
    hint =
      "Hint: Go to Arts, equip the Peacock Feather Brush, and click the dusty canvas on the easel.";
  } else if (!gameState.puzzles.artsChestSolved) {
    hint =
      "Hint: In Arts, set the Paint Chest dials to Crimson, Amber, and Cobalt.";
  } else if (!gameState.puzzles.astroOrreryRepaired) {
    hint =
      "Hint: Go to Astronomy, equip the Brass Orrery Gear, and click the broken planetary orrery.";
  } else if (!gameState.puzzles.astroConsoleSolved) {
    hint =
      "Hint: In Astronomy, select Orion, Lyra, and Cygnus on the Star Dome Console.";
  } else {
    const lockedRoom = ROOM_ORDER.find((r) => !gameState.seals[r].unlocked);
    if (lockedRoom) {
      hint = `Hint: Click the Exit Seal in the ${lockedRoom.toUpperCase()} room to insert your collected cross-room artifacts!`;
    }
  }

  // Deduct 50 points only after passing the check
  addScore(-50);

  setClueMessage(`${hint} (-50 pts)`, "neutral");
}

// ---------------------------------------------------------------------------
// 12. EVENT LISTENERS (Mouse, Touch, & Keyboard Input)
// ---------------------------------------------------------------------------

function bindEvents() {
  // Start Screen & Game Over Navigation
  dom.btnStartGame.addEventListener("click", startGame);
  dom.btnPlayAgain.addEventListener("click", startGame);

  dom.btnBackTitle.addEventListener("click", () => {
    SoundFX.click();
    stopTimer();
    gameState.phase = "TITLE";
    dom.startHighScore.textContent = `${loadHighScore()} pts`;
    showScreen("TITLE");
  });

  // Instructions & Utility Buttons
  dom.btnOpenInstructions.addEventListener("click", () => {
    SoundFX.click();
    openModal(dom.modalInstructions);
  });

  dom.btnHelpIngame.addEventListener("click", () => {
    SoundFX.click();
    openModal(dom.modalInstructions);
  });

  dom.btnHint.addEventListener("click", triggerHint);

  dom.btnMute.addEventListener("click", () => {
    gameState.muted = !gameState.muted;
    renderHud();
    if (!gameState.muted) SoundFX.click();
  });

  // Modal Close Buttons & Backdrop Click
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      SoundFX.click();
      closeModal(document.getElementById(btn.dataset.closeModal));
    });
  });

  [dom.modalInstructions, dom.modalPuzzle].forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        SoundFX.click();
        closeModal(backdrop);
      }
    });
  });

  // Room Switcher Tabs
  dom.roomTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchRoom(tab.dataset.room));
  });

  // SVG Hotspots: Click/Tap + Keyboard Enter/Space Activation
  document.querySelectorAll("[data-hotspot]").forEach((el) => {
    el.addEventListener("click", () =>
      handleHotspotInteraction(el.dataset.hotspot),
    );
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleHotspotInteraction(el.dataset.hotspot);
      }
    });
  });

  // Global Keyboard Shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!dom.modalInstructions.hidden || !dom.modalPuzzle.hidden) {
        closeAllModals();
        return;
      }
      if (gameState.selectedItem) {
        gameState.selectedItem = null;
        renderInventory();
        return;
      }
    }

    if (gameState.phase !== "PLAYING") return;
    if (!dom.modalInstructions.hidden || !dom.modalPuzzle.hidden) return;

    // Ignore shortcuts when typing/selecting inside form controls
    const tag = document.activeElement?.tagName;
    if (tag === "SELECT" || tag === "INPUT") return;

    if (e.key === "1") switchRoom("zoology");
    else if (e.key === "2") switchRoom("arts");
    else if (e.key === "3") switchRoom("astronomy");
    else if (e.key === "ArrowRight") {
      const next =
        (ROOM_ORDER.indexOf(gameState.currentRoom) + 1) % ROOM_ORDER.length;
      switchRoom(ROOM_ORDER[next]);
    } else if (e.key === "ArrowLeft") {
      const prev =
        (ROOM_ORDER.indexOf(gameState.currentRoom) - 1 + ROOM_ORDER.length) %
        ROOM_ORDER.length;
      switchRoom(ROOM_ORDER[prev]);
    } else if (e.key.toLowerCase() === "h") {
      triggerHint();
    } else if (e.key.toLowerCase() === "i") {
      openModal(dom.modalInstructions);
    } else if (e.key.toLowerCase() === "m") {
      gameState.muted = !gameState.muted;
      renderHud();
    }
  });
}

// ---------------------------------------------------------------------------
// 13. INITIALIZATION ON PAGE LOAD
// ---------------------------------------------------------------------------

function init() {
  dom.startHighScore.textContent = `${loadHighScore()} pts`;
  bindEvents();
  showScreen("TITLE");
}

init();
