/* ─────────────────────────────────────────────────────────────
   CodeWithSiril Dynamic Island — GSAP Activity Manager
   Real Phone-Like Behavior • Event-Driven Smart Visibility
   Hover to Expand • Leave to Collapse • Right-Click Menu Switcher
───────────────────────────────────────────────────────────── */

const island = document.getElementById('island');
const bridge = window.islandBridge;

// ─── Proportional Dimensions (px) ───────────────────────────
const SIZE = {
  compact:      { w: 120,  h: 30,  r: 15 },  // Authentic Vivo OriginOS Origin Island (120x30, r:15)
  compactMedia: { w: 164,  h: 30,  r: 15 },  // Vivo OriginOS media pill
  compactTimer: { w: 140,  h: 30,  r: 15 },  // Vivo OriginOS active timer pill
  charging:     { w: 226,  h: 32,  r: 16 },  // Vivo OriginOS slim charging pill
  faces:        { w: 380,  h: 168, r: 24 },  // Faces & Clock Style Studio
  music:        { w: 380,  h: 146, r: 24 },  // Expanded Now Playing
  timer:        { w: 380,  h: 146, r: 24 },  // Focus Timer
  water:        { w: 380,  h: 146, r: 24 },  // Hydration Tracker
  shelf:        { w: 380,  h: 146, r: 24 },  // Drag & Drop File Shelf
  todo:         { w: 380,  h: 146, r: 24 },  // Quick Task Checklist
  volume:       { w: 226,  h: 32,  r: 16 },  // Vivo OriginOS slim volume pill
  brightness:   { w: 226,  h: 32,  r: 16 },  // Vivo OriginOS slim brightness pill
  keyboard:     { w: 226,  h: 32,  r: 16 },  // Vivo OriginOS slim keyboard banner
  headphone:    { w: 236,  h: 32,  r: 16 },  // Vivo OriginOS slim airbuds pill
  battery:      { w: 236,  h: 32,  r: 16 },  // Vivo OriginOS slim battery alert
  notification: { w: 246,  h: 34,  r: 17 },  // Vivo OriginOS notification banner
};

// ─── Animation Tokens ───────────────────────────────────────
const APPLE_EASE = 'power3.out';

// ─── App Settings ───────────────────────────────────────────
let appSettings = {
  opacity: 88, blur: 24, saturation: 180, brightness: 88,
  tint: '10,10,14', tintOpacity: 0,
  border: 16, shadow: 45, glow: 15, collapse: 1.5,
  dockMode: 'stealth',
  alwaysShow: false,
  pauseGraceDelay: 2.5,
  tempDisplayDuration: 3500,
  reducedMotion: false,
  animationSpeed: 1.0,
  animatedEyes: false,
};

try {
  const cachedSettings = localStorage.getItem('dynamic_island_settings');
  if (cachedSettings) Object.assign(appSettings, JSON.parse(cachedSettings));
} catch (e) {}

// Temporary event types that auto-dismiss
const TEMP_ACTIVITIES = new Set([
  'notification', 'volume', 'brightness', 'keyboard', 'headphone', 'battery', 'charging'
]);

// Right-click feature menus
const FEATURE_MENUS = [
  { id: 'faces',     label: 'Face & Clock Studio', icon: '✨' },
  { id: 'music',     label: 'Now Playing',         icon: '🎵' },
  { id: 'timer',     label: 'Focus Timer',         icon: '⏱️' },
  { id: 'stopwatch', label: 'Stopwatch',           icon: '⚡' },
  { id: 'water',     label: 'Hydration Tracker',   icon: '💧' },
  { id: 'shelf',     label: 'File Shelf',          icon: '📁' },
  { id: 'todo',      label: 'Quick Tasks',         icon: '📝' },
];
let menuCycleIndex = 0;
let activeInteractiveTab = 'faces';

let currentActivity = 'compact';
let hovering = false;
let lockedActivity = null;
let ongoingActivity = null;
let tempEventTimer = null;
let isIslandVisible = false;

// Live Media State
let mediaData = { status: 'None', title: '', artist: '', source: 'Media' };
let mediaPauseGraceTimer = null;
let lastMediaPlaying = false;

// Battery State
let batteryData = { hasBattery: false, percent: 100, isCharging: false };
let lastKnownCharging = null;
let lastKnownLow = false;

// Timer State
let timerMode = 'timer'; // 'timer' | 'pomo' | 'stopwatch'
let timerSeconds = 5 * 60;
let timerMax = 5 * 60;
let timerRunning = false;
let timerInterval = null;
let timerActive = false;
let stopwatchSeconds = 0;
let stopwatchLaps = [];
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 36; // 226.195

// Hydration State
let waterIntake = 0;
let waterGoal = 8;
try {
  const savedWater = localStorage.getItem('water_intake_today');
  const savedDate = localStorage.getItem('water_intake_date');
  if (savedDate === new Date().toDateString() && savedWater) {
    waterIntake = parseInt(savedWater, 10) || 0;
  }
} catch (e) {}

// File Shelf State
let shelfFiles = [];
try {
  const savedShelf = localStorage.getItem('file_shelf');
  if (savedShelf) shelfFiles = JSON.parse(savedShelf);
} catch (e) {}

// To-Do State
let todoTasks = [];
try {
  const savedTodos = localStorage.getItem('island_todos');
  if (savedTodos) todoTasks = JSON.parse(savedTodos);
} catch (e) {}

// Active GSAP Tween
let morphTween = null;
let toastTimeout = null;

// ─── Helpers ────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function fmtTime(s) {
  const m = Math.floor(s / 60);
  return `${pad(m)}:${pad(s % 60)}`;
}
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Smart Visibility Controller ────────────────────────────
// The island is ONLY visible when something active is happening!
function shouldIslandBeVisible() {
  if (appSettings.alwaysShow) return true;
  if (hovering) return true;
  if (lockedActivity) return true;

  const isPlaying = (mediaData && mediaData.status === 'Playing');
  if (isPlaying || mediaPauseGraceTimer !== null) return true;
  if (timerActive && timerRunning) return true;
  if (currentActivity && TEMP_ACTIVITIES.has(currentActivity)) return true;

  return false;
}

function updateVisibility() {
  const shouldShow = shouldIslandBeVisible();

  if (shouldShow && !isIslandVisible) {
    isIslandVisible = true;
    island.style.pointerEvents = 'auto';
    gsap.killTweensOf(island);
    gsap.fromTo(island,
      { scale: 0.85, opacity: 0, transformOrigin: '50% 0%' },
      { scale: 1, opacity: 1, duration: 0.28, ease: 'power3.out', transformOrigin: '50% 0%' }
    );
  } else if (!shouldShow && isIslandVisible) {
    isIslandVisible = false;
    gsap.killTweensOf(island);
    gsap.to(island, {
      scale: 0.85, opacity: 0, duration: 0.25, ease: 'power2.in',
      transformOrigin: '50% 0%',
      onComplete: () => {
        island.style.pointerEvents = 'none';
      }
    });
  }

  // Report visibility status to Electron main process
  const targetSize = SIZE[currentActivity] || SIZE.compact;
  if (bridge && bridge.reportBounds) {
    bridge.reportBounds({
      width: targetSize.w,
      height: targetSize.h,
      isExpanded: !isCompactState(currentActivity),
      isVisible: shouldShow
    });
  }
}

function isCompactState(name) {
  return name === 'compact' || name === 'compactMedia' || name === 'compactTimer';
}

// ─── Activity Resolver ──────────────────────────────────────
function resolveActivity() {
  if (lockedActivity && hovering) return lockedActivity;

  const isPlaying = (mediaData && mediaData.status === 'Playing');
  const isMediaActive = isPlaying || (mediaPauseGraceTimer !== null);
  const isTimerOn = (timerActive && timerRunning);

  if (hovering) {
    if (isTimerOn) return 'timer';
    if (isMediaActive) return 'music';
    return activeInteractiveTab || 'faces';
  }

  if (isTimerOn) {
    return 'compactTimer';
  }

  if (isMediaActive) {
    return 'compactMedia';
  }

  return 'compact';
}

// ─── GSAP Morph Engine ──────────────────────────────────────
function morphIsland(targetSize, onComplete) {
  if (morphTween) morphTween.kill();

  const speed = appSettings.animationSpeed || 1.0;
  const isCollapsing = targetSize.w < island.offsetWidth;
  const duration = (isCollapsing ? 0.3 : 0.38) / speed;

  if (appSettings.reducedMotion) {
    gsap.set(island, { width: targetSize.w, height: targetSize.h, borderRadius: targetSize.r });
    if (onComplete) onComplete();
    return;
  }

  morphTween = gsap.to(island, {
    width: targetSize.w,
    height: targetSize.h,
    borderRadius: targetSize.r,
    duration: duration,
    ease: APPLE_EASE,
    onComplete: function () {
      if (onComplete) onComplete();
    },
  });
}

// ─── Show Activity (Main Entry) ─────────────────────────────
function showActivity(name, animate = true) {
  if (currentActivity === name && animate) return;
  currentActivity = name;

  const isCompact = isCompactState(name);
  const targetStateId = isCompact ? 'compact-state' : `${name}-expanded`;
  const targetState = document.getElementById(targetStateId);

  let targetSize = SIZE[name] || SIZE.compact;
  if (name === 'music' && lyricsOpen) {
    targetSize = { w: 460, h: 230, r: 30 };
  }

  const isPlaying = (mediaData && mediaData.status === 'Playing');
  const dockClass = appSettings.dockMode ? `dock-${appSettings.dockMode}` : 'dock-stealth';
  const islandClasses = `island ${isCompact ? 'compact ' + name : 'expanded ' + name} ${isPlaying ? 'playing' : ''} ${dockClass} ${hovering ? 'hovered' : ''}`;

  if (bridge && bridge.reportBounds) {
    bridge.reportBounds({
      width: targetSize.w,
      height: targetSize.h,
      isExpanded: !isCompact,
      isVisible: shouldIslandBeVisible()
    });
  }
  if (bridge && bridge.reportActivity) {
    bridge.reportActivity(name);
  }

  document.querySelectorAll('.state').forEach(el => gsap.killTweensOf(el));

  if (!animate || appSettings.reducedMotion) {
    document.querySelectorAll('.state').forEach(el => {
      if (el.id !== targetStateId) {
        el.classList.remove('active');
        gsap.set(el, { opacity: 0 });
      }
    });
    if (targetState) {
      targetState.classList.add('active');
      gsap.set(targetState, { opacity: 1, scale: 1 });
    }
    gsap.set(island, { width: targetSize.w, height: targetSize.h, borderRadius: targetSize.r });
    island.className = islandClasses;
    updateVisibility();
    updateCompactStateDOM(name);
    return;
  }

  island.className = islandClasses;

  // Crossfade inactive states
  document.querySelectorAll('.state').forEach(el => {
    if (el.id !== targetStateId) {
      gsap.to(el, {
        opacity: 0, scale: 0.96, duration: 0.12, ease: 'power2.in',
        onComplete: () => { el.classList.remove('active'); },
      });
    }
  });

  morphIsland(targetSize);

  if (targetState) {
    targetState.classList.add('active');
    gsap.fromTo(
      targetState,
      { opacity: 0, scale: 0.96 },
      { opacity: 1, scale: 1, duration: 0.22, ease: 'power3.out', delay: 0.04 }
    );
  }

  updateVisibility();
  updateCompactStateDOM(name);
  updateAnimatedEyes();
}

function updateCompactStateDOM(name) {
  const compactFace = document.getElementById('compact-face');
  const musicArt = document.getElementById('compact-music-art');
  const timerIcon = document.getElementById('compact-timer-icon');
  const musicWave = document.getElementById('compact-music-wave');
  const compactTime = document.getElementById('compact-time');

  if (name === 'compactTimer') {
    if (compactFace) compactFace.style.display = 'none';
    if (musicArt) musicArt.style.display = 'none';
    if (timerIcon) timerIcon.style.display = 'block';
    if (musicWave) musicWave.style.display = 'none';
    if (compactTime) {
      compactTime.style.display = 'block';
      compactTime.textContent = fmtTime(timerMode === 'stopwatch' ? stopwatchSeconds : timerSeconds);
    }
  } else if (name === 'compactMedia') {
    if (compactFace) compactFace.style.display = 'none';
    if (musicArt) musicArt.style.display = 'flex';
    if (timerIcon) timerIcon.style.display = 'none';
    if (musicWave) musicWave.style.display = 'flex';
    if (compactTime) compactTime.style.display = 'none';
  } else {
    // Normal compact idle capsule: Left side cute face with eyes & smile, right side live clock
    if (compactFace) compactFace.style.display = 'flex';
    if (musicArt) musicArt.style.display = 'none';
    if (timerIcon) timerIcon.style.display = 'none';
    if (musicWave) musicWave.style.display = 'none';
    if (compactTime) {
      compactTime.style.display = 'block';
      updateClock();
    }
  }
}

// ─── Show Temporary Event (Auto-Dismiss & Restore) ───────────
function showTempEvent(activityName, duration) {
  if (tempEventTimer) clearTimeout(tempEventTimer);

  const displayMs = duration || appSettings.tempDisplayDuration || 3500;
  showActivity(activityName);

  tempEventTimer = setTimeout(() => {
    tempEventTimer = null;
    if (currentActivity === activityName && !hovering && !lockedActivity) {
      // Restore ongoing activity or hide completely!
      update();
    }
  }, displayMs);
}

// ─── Interaction & Auto-Collapse Engine ──────────────────────
let collapseTimer = null;

function cancelCollapseTimer() {
  if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
}

window.collapseIsland = function (e) {
  if (e) e.stopPropagation();
  cancelCollapseTimer();
  lockedActivity = null;
  hovering = false;
  island.classList.remove('hovered');
  update();
};

function scheduleAutoCollapse(customDelayMs) {
  cancelCollapseTimer();
  const delaySec = (appSettings && appSettings.collapse) ? appSettings.collapse : 1.5;
  const delayMs = customDelayMs !== undefined ? customDelayMs : Math.max(450, delaySec * 1000);
  collapseTimer = setTimeout(() => { window.collapseIsland(); }, delayMs);
}

// ─── Hover-to-Expand / Leave-to-Collapse ─────────────────────
// Triggered via OS-level mouse watcher in main.js
if (bridge && bridge.onCursorEnter) {
  bridge.onCursorEnter(() => {
    cancelCollapseTimer();
    if (!hovering) {
      hovering = true;
      island.classList.add('hovered');

      // Expand to relevant interactive panel
      if (isCompactState(currentActivity)) {
        let target = 'faces';
        if (timerActive && timerRunning) {
          target = 'timer';
        } else if (mediaData && mediaData.status === 'Playing') {
          target = 'music';
        } else {
          target = activeInteractiveTab || 'faces';
        }
        lockedActivity = target;
        showActivity(target);
      }
    }
  });
}

if (bridge && bridge.onCursorLeave) {
  bridge.onCursorLeave(() => {
    scheduleAutoCollapse(450);
  });
}

// Local in-window mouse safety checks
window.addEventListener('mouseleave', () => scheduleAutoCollapse(400));
document.addEventListener('mouseleave', () => scheduleAutoCollapse(400));
window.addEventListener('blur', () => window.collapseIsland());
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.collapseIsland(); });

document.addEventListener('click', (e) => {
  if (!e.target.closest('#island')) window.collapseIsland();
});

// Click on Island
island.addEventListener('click', (e) => {
  if (e.target.closest('button') || e.target.closest('.ctrl-btn') || e.target.closest('#scrub-track') ||
      e.target.closest('.timer-act-btn') || e.target.closest('.water-drink-btn') || e.target.closest('input') ||
      e.target.closest('.tm-chip') || e.target.closest('.water-reset-btn') ||
      e.target.closest('.preset-btn') || e.target.closest('.shelf-file-card')) {
    cancelCollapseTimer();
    return;
  }

  if (isCompactState(currentActivity)) {
    cancelCollapseTimer();
    hovering = true;
    island.classList.add('hovered');

    let targetTab = 'faces';
    if (timerActive && timerRunning) {
      targetTab = 'timer';
    } else if (mediaData && mediaData.status === 'Playing') {
      targetTab = 'music';
    } else {
      targetTab = activeInteractiveTab || 'faces';
    }
    lockedActivity = targetTab;
    activeInteractiveTab = targetTab;
    showActivity(targetTab);
  }
});

// ─── Right-Click Menu Switcher (No permanent menu bar) ────────
island.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  cancelCollapseTimer();
  hovering = true;
  island.classList.add('hovered');

  // Cycle to next feature menu
  menuCycleIndex = (menuCycleIndex + 1) % FEATURE_MENUS.length;
  const nextMenu = FEATURE_MENUS[menuCycleIndex];
  activeInteractiveTab = nextMenu.id;
  lockedActivity = nextMenu.id;

  if (nextMenu.id === 'stopwatch') {
    setTimerMode('stopwatch');
    showActivity('timer');
  } else if (nextMenu.id === 'timer') {
    setTimerMode('timer');
    showActivity('timer');
  } else {
    showActivity(nextMenu.id);
  }

  // Flash subtle floating toast
  showMenuToast(nextMenu.icon, nextMenu.label);
});

function showMenuToast(icon, label) {
  const toast = document.getElementById('menu-switch-toast');
  const tIcon = document.getElementById('toast-icon');
  const tLabel = document.getElementById('toast-label');
  if (!toast) return;

  if (tIcon) tIcon.textContent = icon;
  if (tLabel) tLabel.textContent = label;

  toast.style.display = 'flex';
  gsap.killTweensOf(toast);
  gsap.fromTo(toast,
    { opacity: 0, y: -6, scale: 0.95 },
    { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: 'back.out(2)' }
  );

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    gsap.to(toast, {
      opacity: 0, y: -4, duration: 0.25, ease: 'power2.in',
      onComplete: () => { toast.style.display = 'none'; }
    });
  }, 1200);
}

// ─── Main Update Loop ────────────────────────────────────────
function update() {
  const act = resolveActivity();
  showActivity(act);
}

// ─── FACE & CLOCK STUDIO ────────────────────────────────────
let selectedFaceStyle = localStorage.getItem('island_face_style') || 'classic';
let selectedClockStyle = localStorage.getItem('island_clock_style') || '24h';

const FACE_STYLES = {
  classic: {
    html: `
      <div class="face-eyes">
        <span class="face-eye eye-left"><span class="pupil"></span></span>
        <span class="face-eye eye-right"><span class="pupil"></span></span>
      </div>
      <svg class="face-smile-svg" viewBox="0 0 14 6" width="14" height="6">
        <path d="M 2 1.5 Q 7 5.5 12 1.5" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      </svg>`
  },
  wink: {
    html: `
      <div class="face-eyes">
        <span class="face-eye-wink">^</span>
        <span class="face-eye eye-right"><span class="pupil"></span></span>
      </div>
      <svg class="face-smile-svg" viewBox="0 0 14 6" width="14" height="6">
        <path d="M 2 2.5 Q 7 5.5 12 1" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      </svg>`
  },
  blush: {
    html: `
      <div class="face-eyes">
        <span class="face-eye eye-left"><span class="pupil"></span><span class="blush-dot"></span></span>
        <span class="face-eye eye-right"><span class="pupil"></span><span class="blush-dot"></span></span>
      </div>
      <svg class="face-smile-svg" viewBox="0 0 14 6" width="14" height="6">
        <path d="M 2 1.5 Q 7 5.5 12 1.5" stroke="#ff7597" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      </svg>`
  },
  sunglasses: {
    html: `
      <div class="face-glasses">
        <span class="glass-lens"></span>
        <span class="glass-bridge"></span>
        <span class="glass-lens"></span>
      </div>
      <svg class="face-smile-svg" viewBox="0 0 14 6" width="14" height="6">
        <path d="M 3 2.5 Q 8 4.5 12 1" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      </svg>`
  },
  starry: {
    html: `
      <div class="face-eyes">
        <span class="star-eye">★</span>
        <span class="star-eye">★</span>
      </div>
      <svg class="face-smile-svg" viewBox="0 0 14 6" width="14" height="6">
        <path d="M 2 1 Q 7 6 12 1" stroke="#ffd60a" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      </svg>`
  },
  sleepy: {
    html: `
      <div class="face-eyes">
        <span class="sleep-eye">︶</span>
        <span class="sleep-eye">︶</span>
      </div>
      <svg class="face-smile-svg" viewBox="0 0 14 6" width="14" height="6">
        <path d="M 4 2 Q 7 4 10 2" stroke="#93c5fd" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      </svg>`
  },
  heart: {
    html: `
      <div class="face-eyes">
        <span class="heart-eye">♥</span>
        <span class="heart-eye">♥</span>
      </div>
      <svg class="face-smile-svg" viewBox="0 0 14 6" width="14" height="6">
        <path d="M 2 1.5 Q 7 5.5 12 1.5" stroke="#ff2d55" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      </svg>`
  },
  playful: {
    html: `
      <div class="face-eyes">
        <span class="face-eye eye-left"><span class="pupil"></span></span>
        <span class="face-eye eye-right"><span class="pupil"></span></span>
      </div>
      <div class="face-tongue-wrap">
        <svg class="face-smile-svg" viewBox="0 0 14 6" width="14" height="6">
          <path d="M 2 1.5 Q 7 5.5 12 1.5" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" fill="none"/>
        </svg>
        <span class="mini-tongue"></span>
      </div>`
  }
};

window.selectFaceStyle = function (styleKey) {
  if (!FACE_STYLES[styleKey]) return;
  selectedFaceStyle = styleKey;
  try { localStorage.setItem('island_face_style', styleKey); } catch (e) {}

  document.querySelectorAll('.face-style-chip').forEach(el => {
    el.classList.toggle('selected', el.dataset.face === styleKey);
  });

  const faceEl = document.getElementById('compact-face');
  if (faceEl) {
    faceEl.innerHTML = FACE_STYLES[styleKey].html;
    gsap.fromTo(faceEl, { scale: 0.8 }, { scale: 1, duration: 0.25, ease: 'back.out(2)' });
  }
};

window.selectClockStyle = function (styleKey) {
  selectedClockStyle = styleKey;
  try { localStorage.setItem('island_clock_style', styleKey); } catch (e) {}

  document.querySelectorAll('.clock-style-btn').forEach(el => {
    el.classList.toggle('selected', el.dataset.clock === styleKey);
  });

  updateClock();
  const timeEl = document.getElementById('compact-time');
  if (timeEl) gsap.fromTo(timeEl, { scale: 0.85 }, { scale: 1, duration: 0.2, ease: 'power2.out' });
};

function updateStudioClockPreviews() {
  const now = new Date();
  const hrs24 = now.getHours();
  const mins = pad(now.getMinutes());
  const secs = pad(now.getSeconds());
  const ampm = hrs24 >= 12 ? 'PM' : 'AM';
  const hrs12 = pad(hrs24 % 12 || 12);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const el24 = document.getElementById('clk-prev-24h');
  const el12 = document.getElementById('clk-prev-12h');
  const elSec = document.getElementById('clk-prev-sec');
  const elMin = document.getElementById('clk-prev-min');
  const elDay = document.getElementById('clk-prev-day');

  if (el24) el24.textContent = `${pad(hrs24)}:${mins}`;
  if (el12) el12.textContent = `${hrs12}:${mins} ${ampm}`;
  if (elSec) elSec.textContent = `${pad(hrs24)}:${mins}:${secs}`;
  if (elMin) elMin.textContent = `${pad(hrs24)}•${mins}`;
  if (elDay) elDay.textContent = `${days[now.getDay()]} ${pad(hrs24)}:${mins}`;
}

// ─── Clock Engine ───────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('compact-time');
  if (!el || currentActivity === 'compactTimer') return;
  const now = new Date();
  const hrs24 = now.getHours();
  const mins = pad(now.getMinutes());
  const secs = pad(now.getSeconds());

  if (selectedClockStyle === '12h') {
    const ampm = hrs24 >= 12 ? 'PM' : 'AM';
    const hrs12 = pad(hrs24 % 12 || 12);
    el.textContent = `${hrs12}:${mins} ${ampm}`;
  } else if (selectedClockStyle === 'seconds') {
    el.textContent = `${pad(hrs24)}:${mins}:${secs}`;
  } else if (selectedClockStyle === 'minimal') {
    el.textContent = `${pad(hrs24)}•${mins}`;
  } else if (selectedClockStyle === 'day') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    el.textContent = `${days[now.getDay()]} ${pad(hrs24)}:${mins}`;
  } else {
    el.textContent = `${pad(hrs24)}:${mins}`;
  }
}

// Initialize styles immediately
function initFaceAndClockStudioUI() {
  const faceEl = document.getElementById('compact-face');
  if (faceEl && FACE_STYLES[selectedFaceStyle]) {
    faceEl.innerHTML = FACE_STYLES[selectedFaceStyle].html;
  }
  document.querySelectorAll('.face-style-chip').forEach(el => {
    el.classList.toggle('selected', el.dataset.face === selectedFaceStyle);
  });
  document.querySelectorAll('.clock-style-btn').forEach(el => {
    el.classList.toggle('selected', el.dataset.clock === selectedClockStyle);
  });
  updateStudioClockPreviews();
}

updateClock();
setInterval(updateClock, 1000);
setInterval(updateStudioClockPreviews, 1000);
setTimeout(initFaceAndClockStudioUI, 100);

// ─── MEDIA ───────────────────────────────────────────────────
const VIBRANT_PALETTE = [
  { color: '#ff2d55', glow: 'rgba(255, 45, 85, 0.45)' },
  { color: '#ff375f', glow: 'rgba(255, 55, 95, 0.45)' },
  { color: '#ff9f0a', glow: 'rgba(255, 159, 10, 0.45)' },
  { color: '#30d158', glow: 'rgba(48, 209, 88, 0.45)' },
  { color: '#0a84ff', glow: 'rgba(10, 132, 255, 0.45)' },
  { color: '#bf5af2', glow: 'rgba(191, 90, 242, 0.45)' },
  { color: '#ff3b30', glow: 'rgba(255, 59, 48, 0.45)' },
  { color: '#5e5ce6', glow: 'rgba(94, 92, 230, 0.45)' },
];

function stringHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function setMediaAccent(color, glow) {
  document.documentElement.style.setProperty('--media-accent', color);
  document.documentElement.style.setProperty('--media-accent-glow', glow);
}

function extractColorFromImg(imgEl) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, 16, 16);
    const imgData = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < imgData.length; i += 4) {
      const br = (imgData[i] + imgData[i+1] + imgData[i+2]) / 3;
      if (br > 40 && br < 225) { r += imgData[i]; g += imgData[i+1]; b += imgData[i+2]; count++; }
    }
    if (count > 0) {
      const rgb = `rgb(${Math.round(r/count)}, ${Math.round(g/count)}, ${Math.round(b/count)})`;
      const rgba = `rgba(${Math.round(r/count)}, ${Math.round(g/count)}, ${Math.round(b/count)}, 0.55)`;
      setMediaAccent(rgb, rgba);
    }
  } catch (e) {}
}

function updateMusicUI(data) {
  const isPlaying = (data && data.status === 'Playing');
  const title = (data && data.title) ? data.title : 'Not Playing';
  const artist = (data && data.artist) ? data.artist : (data.source || 'Media');

  const titleEl = document.getElementById('music-title');
  const artistEl = document.getElementById('music-artist');
  const headerTitleEl = document.getElementById('music-header-title');

  if (titleEl) titleEl.textContent = title;
  if (artistEl) artistEl.textContent = artist;
  if (headerTitleEl) headerTitleEl.textContent = (data && data.source) ? `Now Playing (${data.source})` : 'Now Playing';

  const compactImg = document.getElementById('compact-thumb-img');
  const compactDefault = document.getElementById('compact-music-default-icon');
  const expandedImg = document.getElementById('expanded-thumb-img');
  const expandedPlaceholder = document.getElementById('album-art-placeholder');

  if (data && data.thumbnail) {
    if (compactImg) {
      compactImg.crossOrigin = 'Anonymous';
      compactImg.src = data.thumbnail;
      compactImg.style.display = 'block';
      compactImg.onload = () => extractColorFromImg(compactImg);
    }
    if (compactDefault) compactDefault.style.display = 'none';
    if (expandedImg) { expandedImg.src = data.thumbnail; expandedImg.style.display = 'block'; }
    if (expandedPlaceholder) expandedPlaceholder.style.display = 'none';
  } else {
    if (compactImg) compactImg.style.display = 'none';
    if (compactDefault) compactDefault.style.display = 'block';
    if (expandedImg) expandedImg.style.display = 'none';
    if (expandedPlaceholder) expandedPlaceholder.style.display = 'flex';
    if (title && title !== 'Not Playing') {
      const pal = VIBRANT_PALETTE[stringHash(title) % VIBRANT_PALETTE.length];
      setMediaAccent(pal.color, pal.glow);
    }
  }

  if (data && data.duration && data.duration > 0) {
    musicTotal = data.duration;
    if (data.position !== undefined && data.position >= 0) musicElapsed = data.position;
    updateMusicTimes();
  }

  island.classList.toggle('playing', isPlaying);

  // Playback state transition logic
  if (isPlaying) {
    if (mediaPauseGraceTimer) {
      clearTimeout(mediaPauseGraceTimer);
      mediaPauseGraceTimer = null;
    }
    ongoingActivity = 'music';
    lastMediaPlaying = true;
    update();
  } else {
    // Paused or Stopped
    if (lastMediaPlaying) {
      if (!mediaPauseGraceTimer) {
        // Allow configurable grace delay before hiding paused music
        const delaySec = (appSettings && appSettings.pauseGraceDelay) ? appSettings.pauseGraceDelay : 2.5;
        const delayMs = Math.round(delaySec * 1000);
        mediaPauseGraceTimer = setTimeout(() => {
          mediaPauseGraceTimer = null;
          lastMediaPlaying = false;
          if (ongoingActivity === 'music') ongoingActivity = null;
          if (!hovering && !lockedActivity && !timerRunning) {
            update();
          }
        }, delayMs);
        update(); // Maintain compact/expanded pill during grace window
      }
    } else {
      ongoingActivity = null;
      if (!hovering && !lockedActivity && !timerRunning) {
        update();
      }
    }
  }
}

// ─── SYNCHRONIZED LYRICS ────────────────────────────────────
let currentLyrics = [];
let lyricsOpen = false;

window.toggleLyrics = function (e) {
  if (e) e.stopPropagation();
  cancelCollapseTimer();
  lyricsOpen = !lyricsOpen;

  const drawer = document.getElementById('lyrics-drawer');
  const btn = document.getElementById('lyrics-toggle-btn');
  if (btn) btn.classList.toggle('active', lyricsOpen);
  if (drawer) drawer.style.display = lyricsOpen ? 'block' : 'none';

  if (lyricsOpen) {
    morphIsland({ w: 460, h: 230, r: 30 });
    if ((!currentLyrics || currentLyrics.length === 0) && mediaData.title && mediaData.title !== 'Not Playing') {
      const container = document.getElementById('lyrics-list');
      if (container) container.innerHTML = '<div class="lyrics-loading">Loading synchronized lyrics…</div>';
      if (bridge && bridge.fetchLyrics) bridge.fetchLyrics(mediaData.title, mediaData.artist);
    } else {
      renderLyrics();
    }
  } else {
    morphIsland(SIZE.music);
  }
};

if (bridge && bridge.onLyrics) {
  bridge.onLyrics(({ lyrics }) => {
    currentLyrics = lyrics || [];
    renderLyrics();
  });
}

function renderLyrics() {
  const container = document.getElementById('lyrics-list');
  if (!container) return;
  if (!currentLyrics || currentLyrics.length === 0) {
    container.innerHTML = '<div class="lyrics-loading">No synchronized lyrics available for this track</div>';
    return;
  }
  container.innerHTML = currentLyrics.map((l, i) =>
    `<div class="lyrics-line" id="lyric-line-${i}" onclick="seekToLyric(${l.time})">${escapeHtml(l.text)}</div>`
  ).join('');
  updateActiveLyricLine();
}

window.seekToLyric = function (timeSec) {
  if (timeSec < 0 || musicTotal <= 0) return;
  musicElapsed = Math.min(musicTotal, Math.round(timeSec));
  updateMusicTimes();
  if (bridge && bridge.mediaControl) bridge.mediaControl('forward');
};

function updateActiveLyricLine() {
  if (!lyricsOpen || !currentLyrics || currentLyrics.length === 0) return;
  let activeIdx = -1;
  for (let i = 0; i < currentLyrics.length; i++) {
    if (currentLyrics[i].time >= 0 && currentLyrics[i].time <= musicElapsed) {
      activeIdx = i;
    } else if (currentLyrics[i].time > musicElapsed) {
      break;
    }
  }

  document.querySelectorAll('.lyrics-line').forEach((el, idx) => {
    const isActive = (idx === activeIdx);
    el.classList.toggle('active', isActive);
    if (isActive) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

if (bridge && bridge.onMedia) {
  bridge.onMedia((data) => {
    mediaData = data;
    updateMusicUI(data);
  });
}

// ─── BATTERY & CHARGING POPUP ────────────────────────────────
function updateBatteryUI(data) {
  const pct = data.percent || 0;
  const isCharging = Boolean(data.isCharging || data.acConnected);

  const fill = document.getElementById('battery-fill');
  if (fill) gsap.to(fill, { width: `${pct}%`, duration: 0.8, ease: 'power2.out' });

  const pctText = document.getElementById('battery-percent-text');
  if (pctText) pctText.textContent = `${pct}%`;

  const status = document.getElementById('battery-status-text');
  if (status) {
    if (!data.hasBattery)     status.textContent = 'Desktop PC';
    else if (isCharging)      status.textContent = '⚡ Charging';
    else if (pct < 10)        status.textContent = '⚠️ Critical Battery';
    else if (pct < 20)        status.textContent = '🔴 Low Battery';
    else                      status.textContent = 'On Battery';
  }

  const bar = document.getElementById('battery-bar-fill');
  if (bar) {
    gsap.to(bar, { width: `${pct}%`, duration: 0.8, ease: 'power2.out' });
    bar.style.background = pct < 20 ? '#ff3b30' : pct < 40 ? '#ff9f0a' : '#34c759';
  }

  island.classList.toggle('charging', isCharging);
  island.classList.toggle('low-battery', pct < 20 && !isCharging);

  // Event detection: trigger on genuine state transitions (plugged, unplugged, low battery)
  if (lastKnownCharging !== null) {
    if (!lastKnownCharging && isCharging) {
      // Charger plugged in!
      triggerChargingAnimation(pct);
    } else if (lastKnownCharging && !isCharging) {
      // Charger unplugged!
      triggerPowerDisconnectedAnimation(pct);
    }
  }

  // Low battery trigger (dropped <= 20% on battery)
  if (!isCharging && pct > 0 && pct <= 20 && !lastKnownLow) {
    triggerLowBatteryAlert(pct);
  }

  lastKnownCharging = isCharging;
  lastKnownLow = pct <= 20;
}

function triggerChargingAnimation(pct) {
  const pctVal = (pct !== undefined && pct !== null) ? pct : (batteryData.percent || 100);
  const chText = document.getElementById('charging-text');
  const chPct = document.getElementById('charging-pct');
  const chFill = document.getElementById('charging-bar-fill');
  const boltIcon = document.querySelector('.charging-bolt-icon');
  const halo = document.getElementById('charging-bolt-halo');

  if (boltIcon) boltIcon.textContent = '⚡';
  if (halo) halo.classList.remove('disconnected');
  island.classList.remove('disconnected');

  if (chText) {
    chText.textContent = pctVal >= 80 ? 'Fast Charging' : 'Charging';
  }

  // Smooth live number counter up to target percentage
  if (chPct) {
    const startVal = Math.max(0, pctVal - 18);
    const counterObj = { val: startVal };
    gsap.killTweensOf(counterObj);
    gsap.to(counterObj, {
      val: pctVal,
      duration: 1.0,
      ease: 'power2.out',
      onUpdate: () => {
        chPct.textContent = `${Math.round(counterObj.val)}%`;
      }
    });
  }

  // Dynamic shimmering battery progress line
  if (chFill) {
    gsap.killTweensOf(chFill);
    gsap.fromTo(chFill,
      { width: '0%' },
      { width: `${pctVal}%`, duration: 1.15, ease: 'power3.out' }
    );
  }

  // Dynamic spring bounce for the emerald lightning bolt halo
  if (halo) {
    gsap.killTweensOf(halo);
    gsap.fromTo(halo,
      { scale: 0.35, rotation: -35, opacity: 0 },
      {
        scale: 1.25, rotation: 8, opacity: 1, duration: 0.45, ease: 'back.out(2.4)',
        onComplete: () => {
          gsap.to(halo, { scale: 1, rotation: 0, duration: 0.28, ease: 'power2.out' });
        }
      }
    );
  }

  showTempEvent('charging', 3600);
}

function triggerPowerDisconnectedAnimation(pct) {
  const pctVal = (pct !== undefined && pct !== null) ? pct : (batteryData.percent || 100);
  const chText = document.getElementById('charging-text');
  const chPct = document.getElementById('charging-pct');
  const chFill = document.getElementById('charging-bar-fill');
  const boltIcon = document.querySelector('.charging-bolt-icon');
  const halo = document.getElementById('charging-bolt-halo');

  if (chText) chText.textContent = 'Disconnected';
  if (chPct) chPct.textContent = `${pctVal}%`;

  if (boltIcon) boltIcon.textContent = '🔌';
  if (halo) {
    halo.classList.add('disconnected');
    gsap.killTweensOf(halo);
    gsap.fromTo(halo,
      { scale: 0.4, rotation: -20, opacity: 0 },
      {
        scale: 1.18, rotation: 0, opacity: 1, duration: 0.38, ease: 'back.out(2.2)',
        onComplete: () => { gsap.to(halo, { scale: 1, duration: 0.2 }); }
      }
    );
  }

  if (chFill) {
    gsap.killTweensOf(chFill);
    gsap.to(chFill, { width: `${pctVal}%`, duration: 0.6, ease: 'power2.out' });
  }

  island.classList.add('disconnected');
  showTempEvent('charging', 3200);

  setTimeout(() => {
    if (boltIcon) boltIcon.textContent = '⚡';
    if (halo) halo.classList.remove('disconnected');
    island.classList.remove('disconnected');
  }, 3300);
}

function triggerLowBatteryAlert(pct) {
  const pctVal = (pct !== undefined && pct !== null) ? pct : (batteryData.percent || 15);
  const status = document.getElementById('battery-status-text');
  const pctText = document.getElementById('battery-percent-text');
  const bar = document.getElementById('battery-bar-fill');
  const fill = document.getElementById('battery-fill');

  if (status) status.textContent = pctVal <= 10 ? '⚠️ Critical Battery!' : '🔴 Low Battery — Connect Charger';
  if (pctText) pctText.textContent = `${pctVal}%`;
  if (bar) {
    bar.style.width = `${pctVal}%`;
    bar.style.background = '#ff3b30';
  }
  if (fill) {
    fill.style.width = `${pctVal}%`;
    fill.style.background = '#ff3b30';
  }

  showTempEvent('battery', 4000);
}

if (bridge && bridge.onBattery) {
  bridge.onBattery((data) => {
    batteryData = data;
    updateBatteryUI(data);
  });
}

if (bridge && bridge.onPower) {
  bridge.onPower((data) => {
    const isCharging = Boolean(data.isCharging);
    const pct = data.percent || 50;
    if (lastKnownCharging !== null) {
      if (isCharging && !lastKnownCharging) {
        triggerChargingAnimation(pct);
      } else if (!isCharging && lastKnownCharging) {
        triggerPowerDisconnectedAnimation(pct);
      }
    }
    if (!isCharging && pct > 0 && pct <= 20 && !lastKnownLow) {
      triggerLowBatteryAlert(pct);
    }
    batteryData.isCharging = isCharging;
    batteryData.percent = pct;
    batteryData.hasBattery = true;
    lastKnownCharging = isCharging;
    lastKnownLow = pct <= 20;
  });
}

// ─── VOLUME INDICATOR ────────────────────────────────────────
if (bridge && bridge.onVolume) {
  let lastVolumeLevel = -1;
  bridge.onVolume((data) => {
    const level = data.level;
    if (level === lastVolumeLevel) return;
    lastVolumeLevel = level;

    const fill = document.getElementById('vol-ind-fill');
    const pct = document.getElementById('vol-ind-pct');
    if (fill) fill.style.width = `${level}%`;
    if (pct) pct.textContent = `${level}%`;

    if (!hovering && !lockedActivity) showTempEvent('volume', 1800);
  });
}

// ─── BRIGHTNESS INDICATOR ────────────────────────────────────
if (bridge && bridge.onBrightness) {
  let lastBrightness = -1;
  bridge.onBrightness((data) => {
    const level = data.level;
    if (level === lastBrightness) return;
    lastBrightness = level;

    const fill = document.getElementById('brightness-ind-fill');
    const pct = document.getElementById('brightness-ind-pct');
    if (fill) fill.style.width = `${level}%`;
    if (pct) pct.textContent = `${level}%`;

    if (!hovering && !lockedActivity) showTempEvent('brightness', 1800);
  });
}

// ─── KEYBOARD / CAPS LOCK INDICATOR ──────────────────────────
let initialKeyboardPassed = false;
if (bridge && bridge.onKeyboard) {
  bridge.onKeyboard((data) => {
    if (!initialKeyboardPassed) {
      initialKeyboardPassed = true;
      return;
    }
    const titleEl = document.getElementById('keyboard-title');
    const bodyEl = document.getElementById('keyboard-body');
    if (titleEl) titleEl.textContent = data.key || 'Caps Lock';
    if (bodyEl) bodyEl.textContent = data.state || 'ON';

    if (!hovering && !lockedActivity) showTempEvent('keyboard', 1800);
  });
}

// ─── HEADPHONE / AIRBUDS STATUS ──────────────────────────────
if (bridge && bridge.onHeadphone) {
  bridge.onHeadphone((data) => {
    const titleEl = document.getElementById('headphone-title');
    const bodyEl = document.getElementById('headphone-body');
    const iconEl = document.getElementById('headphone-icon');
    const dotEl = document.getElementById('headphone-status-dot');
    const badgeEl = document.getElementById('headphone-badge');
    const halo = document.getElementById('headphone-halo');

    const devName = data.name || (data.connected ? 'Airbuds' : 'Audio Device');
    if (titleEl) titleEl.textContent = devName;

    if (bodyEl) {
      let statusText = data.connected ? 'Connected' : 'Disconnected';
      if (data.battery !== undefined && data.battery !== null) {
        statusText += ` • ${data.battery}%`;
      }
      bodyEl.textContent = statusText;
    }

    if (dotEl) {
      dotEl.classList.toggle('disconnected', !data.connected);
    }

    if (badgeEl) {
      badgeEl.textContent = data.connected ? 'Bluetooth Audio' : 'Disconnected';
    }

    if (iconEl) {
      iconEl.textContent = data.connected ? '🎧' : '🔇';
    }

    if (halo) {
      gsap.killTweensOf(halo);
      gsap.fromTo(halo,
        { scale: 0.4, rotation: -20, opacity: 0 },
        {
          scale: 1.2, rotation: 6, opacity: 1, duration: 0.4, ease: 'back.out(2.2)',
          onComplete: () => { gsap.to(halo, { scale: 1, rotation: 0, duration: 0.25 }); }
        }
      );
    }

    if (!hovering && !lockedActivity) {
      showTempEvent('headphone', 3600);
    }
  });
}

// ─── REBUILT CENTERED TIMER & STOPWATCH ──────────────────────
window.setTimerMode = function (mode) {
  timerMode = mode;
  document.querySelectorAll('.tm-chip').forEach(c => c.classList.remove('active'));
  const activeChip = document.getElementById(`tm-${mode === 'stopwatch' ? 'sw' : mode === 'pomo' ? 'pomo' : 'timer'}`);
  if (activeChip) activeChip.classList.add('active');

  const label = document.getElementById('timer-label');
  const headerTitle = document.getElementById('timer-header-title');
  const lapBtn = document.getElementById('timer-lap-btn');
  const presetsRow = document.getElementById('timer-presets-row');
  const lapsContainer = document.getElementById('stopwatch-laps-container');

  if (mode === 'pomo') {
    timerMax = 25 * 60;
    timerSeconds = timerMax;
    if (label) label.textContent = 'POMODORO';
    if (headerTitle) headerTitle.textContent = 'Pomodoro Focus';
    if (lapBtn) lapBtn.style.display = 'none';
    if (presetsRow) presetsRow.style.display = 'flex';
    if (lapsContainer) lapsContainer.style.display = 'none';
  } else if (mode === 'stopwatch') {
    stopwatchSeconds = 0;
    if (label) label.textContent = 'STOPWATCH';
    if (headerTitle) headerTitle.textContent = 'Stopwatch';
    if (lapBtn) lapBtn.style.display = 'inline-flex';
    if (presetsRow) presetsRow.style.display = 'none';
    if (lapsContainer) lapsContainer.style.display = 'block';
  } else {
    timerMax = 5 * 60;
    timerSeconds = timerMax;
    if (label) label.textContent = 'FOCUS';
    if (headerTitle) headerTitle.textContent = 'Focus Timer';
    if (lapBtn) lapBtn.style.display = 'none';
    if (presetsRow) presetsRow.style.display = 'flex';
    if (lapsContainer) lapsContainer.style.display = 'none';
  }
  timerControl('reset');
};

function updateTimerDisplay() {
  const el = document.getElementById('timer-display');
  const prog = document.getElementById('timer-ring-progress');
  const compactTimeEl = document.getElementById('compact-time');

  if (timerMode === 'stopwatch') {
    const timeStr = fmtTime(stopwatchSeconds);
    if (el) el.textContent = timeStr;
    if (currentActivity === 'compactTimer' && compactTimeEl) compactTimeEl.textContent = timeStr;

    if (prog) {
      const lapRatio = (stopwatchSeconds % 60) / 60;
      gsap.to(prog, {
        attr: { 'stroke-dashoffset': TIMER_CIRCUMFERENCE * (1 - lapRatio) },
        duration: 0.3, ease: 'linear'
      });
    }
  } else {
    const timeStr = fmtTime(timerSeconds);
    if (el) el.textContent = timeStr;
    if (currentActivity === 'compactTimer' && compactTimeEl) compactTimeEl.textContent = timeStr;

    if (prog) {
      const ratio = timerMax > 0 ? timerSeconds / timerMax : 0;
      gsap.to(prog, {
        attr: { 'stroke-dashoffset': TIMER_CIRCUMFERENCE * (1 - ratio) },
        duration: 0.5, ease: 'power2.out'
      });
    }
  }
}

window.addTimerTime = function (sec) {
  if (timerMode === 'stopwatch') return;
  timerSeconds += sec;
  timerMax += sec;
  updateTimerDisplay();
};

window.timerControl = function (action) {
  const btn = document.getElementById('timer-start-btn');
  if (action === 'toggle') {
    if (timerMode === 'stopwatch') {
      timerRunning = !timerRunning;
      if (btn) btn.textContent = timerRunning ? 'Pause' : 'Resume';
      if (timerRunning) {
        ongoingActivity = 'timer';
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
          stopwatchSeconds++;
          updateTimerDisplay();
        }, 1000);
      } else {
        clearInterval(timerInterval);
      }
      updateTimerDisplay();
      update();
      return;
    }

    if (!timerActive) {
      timerActive = true;
      if (timerSeconds === 0) timerSeconds = timerMax;
    }
    timerRunning = !timerRunning;
    if (btn) btn.textContent = timerRunning ? 'Pause' : 'Resume';
    if (timerRunning) {
      ongoingActivity = 'timer';
      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        timerSeconds = Math.max(0, timerSeconds - 1);
        updateTimerDisplay();
        if (timerSeconds === 0) {
          timerRunning = false;
          timerActive = false;
          clearInterval(timerInterval);
          if (btn) btn.textContent = 'Start';
          ongoingActivity = null;
          showNotification('⏱️', timerMode === 'pomo' ? 'Pomodoro Completed' : 'Timer Finished', 'Time is up! Great focus session.');
          update();
        }
      }, 1000);
    } else {
      clearInterval(timerInterval);
    }
    updateTimerDisplay();
    update();
  } else if (action === 'reset') {
    clearInterval(timerInterval);
    timerRunning = false;
    timerActive = false;
    if (timerMode === 'stopwatch') {
      stopwatchSeconds = 0;
      stopwatchLaps = [];
      renderStopwatchLaps();
    } else {
      timerSeconds = timerMax;
    }
    ongoingActivity = null;
    if (btn) btn.textContent = 'Start';
    updateTimerDisplay();
    update();
  } else if (action === 'lap') {
    if (timerMode === 'stopwatch' && timerRunning) {
      stopwatchLaps.unshift({
        num: stopwatchLaps.length + 1,
        time: fmtTime(stopwatchSeconds)
      });
      renderStopwatchLaps();
    }
  }
};

function renderStopwatchLaps() {
  const container = document.getElementById('stopwatch-laps-list');
  if (!container) return;
  if (stopwatchLaps.length === 0) {
    container.innerHTML = '<div class="laps-empty">No laps recorded yet</div>';
    return;
  }
  container.innerHTML = stopwatchLaps.map(l => `
    <div class="stopwatch-lap-item">
      <span class="lap-num">Lap ${l.num}</span>
      <span class="lap-time">${l.time}</span>
    </div>
  `).join('');
}
updateTimerDisplay();

// ─── WATER TRACKER ───────────────────────────────────────────
function updateWaterUI() {
  const title = document.getElementById('water-title');
  const progress = document.getElementById('water-progress');
  const glasses = document.querySelectorAll('.water-glass');

  if (title) {
    title.textContent = waterIntake >= waterGoal ? '🎉 Daily Goal Reached!' : 'Drink Water';
  }
  if (progress) {
    progress.textContent = `${waterIntake} / ${waterGoal} glasses (${waterIntake * 250} ml)`;
  }
  glasses.forEach((glass, idx) => {
    glass.classList.toggle('filled', idx < waterIntake);
  });
}
updateWaterUI();

window.addWaterIntake = function () {
  waterIntake++;
  try {
    localStorage.setItem('water_intake_today', String(waterIntake));
    localStorage.setItem('water_intake_date', new Date().toDateString());
  } catch (_) {}
  updateWaterUI();
  if (waterIntake === waterGoal) {
    showNotification('💧', 'Hydration Goal Reached', 'Awesome job! You met your 8-glass daily goal.');
  }
};

window.resetWaterIntake = function () {
  waterIntake = 0;
  try {
    localStorage.setItem('water_intake_today', '0');
  } catch (_) {}
  updateWaterUI();
};

// ─── FILE SHELF (DRAG & DROP) ────────────────────────────────
function updateShelfUI() {
  const container = document.getElementById('shelf-files');
  const bottomBar = document.getElementById('shelf-bottom-bar');
  if (!container) return;

  if (shelfFiles.length === 0) {
    container.innerHTML = '<div class="shelf-empty">No stashed files. Drop files anywhere onto the island.</div>';
    if (bottomBar) bottomBar.style.display = 'none';
    return;
  }

  if (bottomBar) bottomBar.style.display = 'flex';
  container.innerHTML = shelfFiles.map((f, i) => `
    <div class="shelf-file-card" onclick="openShelfFileItem(${i})" title="Click to open file in Explorer">
      <span>📄</span>
      <span class="shelf-card-name">${escapeHtml(f.name || 'File')}</span>
      <button class="shelf-card-del" onclick="event.stopPropagation(); removeShelfFile(${i})">×</button>
    </div>
  `).join('');
}
updateShelfUI();

window.openShelfFileItem = function (idx) {
  const file = shelfFiles[idx];
  if (file && file.path && bridge && bridge.openShelfFile) {
    bridge.openShelfFile(file.path);
  }
};

window.removeShelfFile = function (idx) {
  shelfFiles.splice(idx, 1);
  try { localStorage.setItem('file_shelf', JSON.stringify(shelfFiles)); } catch (_) {}
  updateShelfUI();
};

window.clearShelfFiles = function () {
  shelfFiles = [];
  try { localStorage.setItem('file_shelf', JSON.stringify(shelfFiles)); } catch (_) {}
  updateShelfUI();
};

island.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!hovering) hovering = true;
  lockedActivity = 'shelf';
  activeInteractiveTab = 'shelf';
  showActivity('shelf');
});

island.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer && e.dataTransfer.files) {
    for (const file of e.dataTransfer.files) {
      if (shelfFiles.length >= 12) break;
      const exists = shelfFiles.some(f => f.path === file.path);
      if (!exists) {
        shelfFiles.push({ name: file.name, path: file.path, size: file.size });
      }
    }
    try { localStorage.setItem('file_shelf', JSON.stringify(shelfFiles)); } catch (_) {}
    updateShelfUI();
  }
  scheduleAutoCollapse(2500);
});

island.addEventListener('dragleave', (e) => {
  e.preventDefault();
  scheduleAutoCollapse(1200);
});

// ─── TO-DO TASK LIST ─────────────────────────────────────────
function renderTodos() {
  const listEl = document.getElementById('todo-list');
  const countEl = document.getElementById('todo-count');
  const remaining = todoTasks.filter(t => !t.done).length;

  if (countEl) countEl.textContent = `${remaining} task${remaining === 1 ? '' : 's'} remaining`;
  if (!listEl) return;

  if (todoTasks.length === 0) {
    listEl.innerHTML = '<div style="font-size: 10px; color: rgba(255,255,255,0.35); text-align: center; padding: 10px 0;">No pending tasks</div>';
    return;
  }

  listEl.innerHTML = todoTasks.map((t, idx) => `
    <div class="todo-item ${t.done ? 'done' : ''}">
      <div class="todo-left-wrap" onclick="toggleTodoTask(${idx})">
        <input type="checkbox" class="todo-checkbox" ${t.done ? 'checked' : ''} onclick="event.stopPropagation(); toggleTodoTask(${idx})" />
        <span>${escapeHtml(t.text)}</span>
      </div>
      <button class="todo-del" onclick="deleteTodoTask(${idx})">×</button>
    </div>
  `).join('');
}
renderTodos();

window.addTodoTask = function () {
  const input = document.getElementById('todo-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  todoTasks.unshift({ text: val, done: false, time: Date.now() });
  try { localStorage.setItem('island_todos', JSON.stringify(todoTasks)); } catch (_) {}
  input.value = '';
  renderTodos();
  input.focus();
};

const todoInputEl = document.getElementById('todo-input');
if (todoInputEl) {
  todoInputEl.addEventListener('focus', () => {
    cancelCollapseTimer();
    lockedActivity = 'todo';
    if (bridge && bridge.focusInput) bridge.focusInput();
  });
  todoInputEl.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelCollapseTimer();
    lockedActivity = 'todo';
    if (bridge && bridge.focusInput) bridge.focusInput();
  });
  todoInputEl.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      window.addTodoTask();
    }
  });
  todoInputEl.addEventListener('blur', () => {
    if (bridge && bridge.blurInput) bridge.blurInput();
  });
}

window.toggleTodoTask = function (idx) {
  if (todoTasks[idx]) {
    todoTasks[idx].done = !todoTasks[idx].done;
    try { localStorage.setItem('island_todos', JSON.stringify(todoTasks)); } catch (_) {}
    renderTodos();
  }
};

window.deleteTodoTask = function (idx) {
  todoTasks.splice(idx, 1);
  try { localStorage.setItem('island_todos', JSON.stringify(todoTasks)); } catch (_) {}
  renderTodos();
};

window.clearCompletedTodos = function () {
  todoTasks = todoTasks.filter(t => !t.done);
  try { localStorage.setItem('island_todos', JSON.stringify(todoTasks)); } catch (_) {}
  renderTodos();
};

// ─── NOTIFICATION BANNER ─────────────────────────────────────
function showNotification(icon, title, body) {
  const iconEl = document.getElementById('notif-icon');
  const titleEl = document.getElementById('notif-title');
  const bodyEl = document.getElementById('notif-body');
  if (iconEl) iconEl.textContent = icon;
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.textContent = body;
  showTempEvent('notification', 3500);
}

// ─── INITIALIZATION (COMPLETELY HIDDEN UNLESS ACTIVE) ─────────
// Start island as hidden by default
island.style.opacity = '0';
island.style.pointerEvents = 'none';
gsap.set(island, { scale: 0.85, opacity: 0, transformOrigin: '50% 0%' });
isIslandVisible = false;

showActivity('compact', false);
if (bridge && bridge.setIgnoreMouse) bridge.setIgnoreMouse(true);

// ─── APPEARANCE SETTINGS ────────────────────────────────────
function applyAppSettings(s) {
  appSettings = Object.assign({}, appSettings, s);

  const baseA    = (appSettings.opacity / 100).toFixed(3);
  const tintA    = (appSettings.tintOpacity / 100).toFixed(3);
  const borderA  = (appSettings.border / 100).toFixed(3);
  const shadowA  = (appSettings.shadow / 100).toFixed(3);
  const glowA    = (appSettings.glow / 100).toFixed(3);

  const bg = parseFloat(tintA) > 0
    ? `rgba(${appSettings.tint}, ${Math.max(parseFloat(baseA), parseFloat(tintA))})`
    : `rgba(10, 10, 14, ${baseA})`;

  island.style.background = bg;
  island.style.border = `0.5px solid rgba(255, 255, 255, ${borderA})`;
  const sNum = parseFloat(shadowA);
  const s1 = (sNum * 0.55).toFixed(3);
  const s2 = (sNum * 0.35).toFixed(3);
  island.style.boxShadow = sNum > 0
    ? `0 14px 28px -6px rgba(0, 0, 0, ${s1}), 0 4px 10px -2px rgba(0, 0, 0, ${s2}), inset 0 1px 0 rgba(255, 255, 255, ${glowA})`
    : `inset 0 1px 0 rgba(255, 255, 255, ${glowA})`;

  document.documentElement.style.setProperty('--island-bg', bg);

  const dockClass = appSettings.dockMode || 'stealth';
  ['dock-stealth', 'dock-corner', 'dock-autohide', 'dock-center'].forEach(cls => island.classList.remove(cls));
  island.classList.add(`dock-${dockClass}`);

  updateVisibility();
  updateAnimatedEyes();
}

function updateAnimatedEyes() {
  const face = document.getElementById('compact-face');
  const clock = document.getElementById('compact-time');
  const isIdleCompact = (currentActivity === 'compact' && !hovering && (!mediaData || mediaData.status !== 'Playing'));

  if (isIdleCompact) {
    if (face) face.style.display = 'flex';
    if (clock) clock.style.display = 'block';
  }
}

if (bridge && bridge.onSettings) {
  bridge.onSettings(function (s) {
    applyAppSettings(s);
    try { localStorage.setItem('dynamic_island_settings', JSON.stringify(appSettings)); } catch (e) {}
  });
}
applyAppSettings(appSettings);

// ─── MEDIA CONTROLS & SCRUBBER ──────────────────────────────
window.mediaControl = function (action) {
  if (action === 'play') {
    const isNowPlaying = !island.classList.contains('playing');
    island.classList.toggle('playing', isNowPlaying);
    mediaData.status = isNowPlaying ? 'Playing' : 'Paused';
    if (!isNowPlaying) scheduleAutoCollapse(1000);
  } else if (action === 'forward') {
    musicElapsed = Math.min(musicTotal, musicElapsed + 10);
    updateMusicTimes();
  } else if (action === 'rewind') {
    musicElapsed = Math.max(0, musicElapsed - 10);
    updateMusicTimes();
  }
  if (bridge && bridge.mediaControl) bridge.mediaControl(action);
};

window.seekScrubber = function (e) {
  const track = document.getElementById('scrub-track');
  if (!track || musicTotal <= 0) return;
  const rect = track.getBoundingClientRect();
  const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const pct = clickX / rect.width;
  const newPos = Math.round(pct * musicTotal);
  const delta = newPos - musicElapsed;
  musicElapsed = newPos;
  updateMusicTimes();
  if (bridge && bridge.mediaControl) bridge.mediaControl(delta >= 0 ? 'forward' : 'rewind');
};

let isMuted = false;

window.toggleVolume = function (e) {
  if (e) e.stopPropagation();
  cancelCollapseTimer();
  isMuted = !isMuted;
  const onIcon = document.querySelector('.vol-icon-on');
  const muteIcon = document.querySelector('.vol-icon-muted');
  if (onIcon && muteIcon) {
    onIcon.style.display = isMuted ? 'none' : 'block';
    muteIcon.style.display = isMuted ? 'block' : 'none';
  }
  const speakerBtn = document.getElementById('speaker-icon');
  if (speakerBtn) gsap.fromTo(speakerBtn, { scale: 0.8 }, { scale: 1, duration: 0.2, ease: 'back.out(2)' });
  if (bridge && bridge.toggleMute) bridge.toggleMute();
};

window.openSoundSettings = function (e) {
  if (e) e.stopPropagation();
  cancelCollapseTimer();
  if (bridge && bridge.openSoundSettings) bridge.openSoundSettings();
};

// Playback time tracking
let musicElapsed = 0;
let musicTotal = 0;

function formatTime(totalSec) {
  if (!totalSec || isNaN(totalSec) || totalSec < 0) return '0:00';
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = Math.floor(totalSec % 60);
  if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(secs)}`;
  return `${mins}:${pad(secs)}`;
}

function updateMusicTimes() {
  const currEl = document.getElementById('music-time-current');
  const totalEl = document.getElementById('music-time-total');
  const fillEl = document.getElementById('progress-fill');
  if (!currEl || !totalEl || !fillEl) return;
  currEl.textContent = formatTime(musicElapsed);
  const rem = Math.max(0, musicTotal - musicElapsed);
  totalEl.textContent = `-${formatTime(rem)}`;
  const pct = musicTotal > 0 ? Math.min(100, (musicElapsed / musicTotal) * 100) : 0;
  fillEl.style.width = `${pct}%`;
  updateActiveLyricLine();
}
updateMusicTimes();

setInterval(() => {
  if (island.classList.contains('playing') && musicTotal > 0) {
    musicElapsed = Math.min(musicTotal, musicElapsed + 1);
    updateMusicTimes();
  }
}, 1000);
