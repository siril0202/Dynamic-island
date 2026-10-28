const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell } = require('electron');
const { exec, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Low-RAM Chromium Optimization Switches ────────────────────────
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64 --expose-gc');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('renderer-process-limit', '1');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('no-zygote');

// ─── Hot Reload (dev mode) ──────────────────────────────────────────
if (process.argv.includes('--dev')) {
  try {
    const electronBin = process.platform === 'win32'
      ? `${__dirname}/node_modules/.bin/electron.cmd`
      : `${__dirname}/node_modules/.bin/electron`;
    require('electron-reload')(__dirname, {
      electron: electronBin,
      watched: [
        `${__dirname}/renderer/index.html`,
        `${__dirname}/renderer/island.css`,
        `${__dirname}/renderer/island.js`,
        `${__dirname}/renderer/settings.html`,
      ],
      hardReset: false,
    });
  } catch (e) { /* ignore */ }
}

const mediaService = require('./services/media');
const batteryService = require('./services/battery');
const systemMonitor = require('./services/systemMonitor');
const lyricsService = require('./services/lyrics');

let islandWindow;
let settingsWindow;
let tray;

// Default appearance settings
const DEFAULT_SETTINGS = {
  opacity: 65, blur: 24, saturation: 180, brightness: 88,
  tint: '10,10,12', tintOpacity: 0,
  border: 12, shadow: 50, glow: 12, collapse: 1.5,
  dockMode: 'stealth',
  alwaysShow: false,
  pauseGraceDelay: 2.5,
  tempDisplayDuration: 3500,
  reducedMotion: false,
  animationSpeed: 1.0,
  animatedEyes: false,
  autoHideFullscreen: true,
  headphoneAlerts: true,
};

// Settings storage
const SETTINGS_FILE = path.join(app.getPath('userData'), 'island-settings.json');

function loadSavedSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULT_SETTINGS, parsed);
    }
  } catch (err) {
    console.error('[Settings] Failed to load:', err);
  }
  return Object.assign({}, DEFAULT_SETTINGS);
}

function saveSettingsToFile(settings) {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Settings] Failed to save:', err);
    return false;
  }
}

let currentSettings = loadSavedSettings();

// Fixed canvas dimensions
const ISLAND_WINDOW_W = 500;
const ISLAND_WINDOW_H = 200;
const ISLAND_TOP_OFFSET = 8;

let activeIslandGeometry = { width: 120, height: 30, isExpanded: false, isVisible: false };
let isCursorOverIsland = false;
let cursorInterval = null;

let winX = 0;
const winY = ISLAND_TOP_OFFSET;
const winW = ISLAND_WINDOW_W;
const winH = ISLAND_WINDOW_H;

function startCursorTracker() {
  if (cursorInterval) clearInterval(cursorInterval);
  cursorInterval = setInterval(() => {
    if (!islandWindow || islandWindow.isDestroyed()) return;

    // Do not capture mouse if island is completely hidden and cursor is not currently over it
    if (activeIslandGeometry.isVisible === false && !isCursorOverIsland) return;

    const cursor = screen.getCursorScreenPoint();
    const islandW = activeIslandGeometry.width || 120;
    const islandH = activeIslandGeometry.height || 30;
    const islandLeft = winX + Math.round((winW - islandW) / 2);
    const islandRight = islandLeft + islandW;
    const islandTop = winY;
    const islandBottom = islandTop + islandH;

    const over = (
      cursor.x >= islandLeft - 6 &&
      cursor.x <= islandRight + 6 &&
      cursor.y >= islandTop - 4 &&
      cursor.y <= islandBottom + 8
    );

    if (over !== isCursorOverIsland) {
      isCursorOverIsland = over;
      if (over) {
        islandWindow.setIgnoreMouseEvents(false);
        islandWindow.webContents.send('cursor-enter');
      } else {
        islandWindow.setIgnoreMouseEvents(true, { forward: true });
        islandWindow.webContents.send('cursor-leave');
      }
    }
  }, 60);
}

function createIslandWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea || { width: 1920, x: 0 };
  const screenW = workArea.width;
  const screenX = workArea.x || 0;
  winX = Math.round(screenX + (screenW - ISLAND_WINDOW_W) / 2);

  islandWindow = new BrowserWindow({
    title: 'CodeWithSiril Dynamic Island',
    width: ISLAND_WINDOW_W,
    height: ISLAND_WINDOW_H,
    x: winX,
    y: ISLAND_TOP_OFFSET,
    frame: false,
    transparent: true,
    backgroundColor: null,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: path.join(__dirname, 'assets', 'logo.png'),
    resizable: false,
    movable: false,
    hasShadow: false,
    focusable: true,
    roundedCorners: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  islandWindow.setIgnoreMouseEvents(true, { forward: true });
  islandWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  islandWindow.webContents.on('did-finish-load', () => {
    islandWindow.webContents.send('apply-settings', currentSettings);
  });

  islandWindow.setAlwaysOnTop(true, 'screen-saver');
  islandWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  islandWindow.moveTop();

  startCursorTracker();

  const topInterval = setInterval(() => {
    if (!islandWindow || islandWindow.isDestroyed()) {
      clearInterval(topInterval);
      return;
    }
    if (islandWindow.isVisible()) {
      islandWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  }, 5000);

  if (process.argv.includes('--dev')) {
    islandWindow.webContents.openDevTools({ mode: 'detach' });
  }

  islandWindow.on('closed', () => {
    if (cursorInterval) { clearInterval(cursorInterval); cursorInterval = null; }
    clearInterval(topInterval);
    islandWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const SETTINGS_W = 420;
  const SETTINGS_H = 690;
  settingsWindow = new BrowserWindow({
    title: 'CodeWithSiril Dynamic Island — Settings',
    width: SETTINGS_W,
    height: SETTINGS_H,
    x: Math.round(sw / 2 - SETTINGS_W / 2),
    y: Math.round(sh / 2 - SETTINGS_H / 2),
    frame: false,
    transparent: true,
    backgroundColor: null,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    icon: path.join(__dirname, 'assets', 'logo.png'),
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.setAlwaysOnTop(true, 'pop-up-menu');

  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function createTray() {
  let icon;
  try {
    const logoPath = path.join(__dirname, 'assets', 'logo.png');
    icon = nativeImage.createFromPath(logoPath);
    if (icon && !icon.isEmpty()) {
      icon = icon.resize({ width: 32, height: 32, quality: 'best' });
    } else {
      icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
    }
  } catch (e) {
    try {
      icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
    } catch (err) {
      icon = nativeImage.createEmpty();
    }
  }

  tray = new Tray(icon);
  tray.setToolTip('CodeWithSiril Dynamic Island — Right-click for options');

  const autostart = require('./scripts/autostart');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide',
      click: () => {
        if (islandWindow) {
          if (islandWindow.isVisible()) {
            islandWindow.hide();
          } else {
            islandWindow.show();
            islandWindow.setAlwaysOnTop(true, 'screen-saver');
            islandWindow.moveTop();
          }
        }
      },
    },
    {
      label: 'Appearance Settings...',
      click: () => createSettingsWindow(),
    },
    { type: 'separator' },
    {
      label: 'Official Website (CodeWithSiril)',
      click: () => shell.openExternal('https://codewithsiril.site'),
    },
    {
      label: 'Developer Portfolio',
      click: () => shell.openExternal('https://portfolio.codewithsiril.site'),
    },
    { type: 'separator' },
    {
      label: 'Start on Windows Boot',
      type: 'checkbox',
      checked: autostart.isEnabled(),
      click: (menuItem) => {
        if (menuItem.checked) { autostart.enable(); }
        else { autostart.disable(); }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(contextMenu);
}

// ─── IPC Handlers ──────────────────────────────────────────────────────────

ipcMain.on('resize-island', () => {});

ipcMain.on('island-bounds-update', (event, bounds) => {
  if (bounds) {
    activeIslandGeometry = Object.assign({}, activeIslandGeometry, bounds);
  }
});

// ─── Settings IPC ─────────────────────────────────────────────────────────
ipcMain.on('settings-close', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
});

ipcMain.on('open-external-url', (event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.on('settings-apply', (event, settings) => {
  Object.assign(currentSettings, settings);
  saveSettingsToFile(currentSettings);
  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.webContents.send('apply-settings', currentSettings);
  }
});

ipcMain.handle('settings-save', (event, settings) => {
  if (settings) Object.assign(currentSettings, settings);
  const ok = saveSettingsToFile(currentSettings);
  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.webContents.send('apply-settings', currentSettings);
  }
  return { success: ok, settings: currentSettings };
});

ipcMain.handle('settings-reset', () => {
  currentSettings = Object.assign({}, DEFAULT_SETTINGS);
  const ok = saveSettingsToFile(currentSettings);
  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.webContents.send('apply-settings', currentSettings);
  }
  return { success: ok, settings: currentSettings };
});

ipcMain.handle('settings-get', () => currentSettings);

const mediaController = require('./services/mediaController');

// Media playback control
const ALLOWED_MEDIA_ACTIONS = new Set(['play', 'next', 'prev', 'forward', 'rewind', 'mute']);
ipcMain.on('media-control', (event, action) => {
  if (typeof action === 'string' && ALLOWED_MEDIA_ACTIONS.has(action)) {
    mediaController.send(action);
    // Instant media sync: trigger quick polls to update UI immediately
    setTimeout(() => { try { mediaService.pollNow(); } catch (_) {} }, 250);
    setTimeout(() => { try { mediaService.pollNow(); } catch (_) {} }, 800);
  }
});

// Focus handling for text inputs (Quick Tasks todo-input)
ipcMain.on('input-focus', () => {
  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.setIgnoreMouseEvents(false);
    islandWindow.focus();
  }
});

ipcMain.on('input-blur', () => {
  // Let renderer manage collapse
});

// Volume Toggle
ipcMain.on('volume-toggle', () => {
  mediaController.send('mute');
});

// Open Sound Settings
ipcMain.on('open-sound-settings', () => {
  exec('explorer.exe ms-settings:sound');
});

// Lock screen action (the only remaining quick action)
ipcMain.on('quick-action', (event, action) => {
  if (typeof action !== 'string') return;
  if (action === 'lock') {
    exec('rundll32.exe user32.dll,LockWorkStation');
  }
});

// Synchronized lyrics retrieval
ipcMain.on('fetch-lyrics', (event, { track, artist }) => {
  lyricsService.fetchLyrics(track, artist, (lyrics) => {
    if (islandWindow && !islandWindow.isDestroyed()) {
      islandWindow.webContents.send('lyrics-update', { track, artist, lyrics });
    }
  });
});

// Click-through
let lastIgnoreMouseState = null;
ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (!islandWindow || islandWindow.isDestroyed()) return;
  const boolIgnore = Boolean(ignore);
  if (lastIgnoreMouseState === boolIgnore) return;
  lastIgnoreMouseState = boolIgnore;
  islandWindow.setIgnoreMouseEvents(boolIgnore, { forward: true });
  islandWindow.setAlwaysOnTop(true, 'screen-saver');
  islandWindow.moveTop();
});

// Open file from shelf
ipcMain.on('shelf-open-file', (event, filePath) => {
  if (filePath && typeof filePath === 'string') {
    try {
      shell.openPath(filePath);
    } catch (_) {}
  }
});

// Activity change for adaptive memory compaction
let currentIslandActivity = 'compact';
ipcMain.on('island-activity-change', (event, activity) => {
  if (typeof activity !== 'string') return;
  currentIslandActivity = activity;

  if (activity === 'compact' || activity === 'compactMedia') {
    setTimeout(() => {
      if (currentIslandActivity === 'compact' || currentIslandActivity === 'compactMedia') {
        trimAppMemory();
      }
    }, 2000);
  }
});

// ─── Start services ─────────────────────────────────────────────────────
function startServices() {
  // Media
  mediaService.start((data) => {
    if (islandWindow && !islandWindow.isDestroyed()) {
      islandWindow.webContents.send('media-update', data);
    }
  });

  // Battery
  batteryService.start((data) => {
    if (islandWindow && !islandWindow.isDestroyed()) {
      islandWindow.webContents.send('battery-update', data);
    }
  });

  // Native hardware event watcher (Caps Lock, Audio device, Volume, Brightness, Fullscreen)
  systemMonitor.start({
    keyboard: (data) => {
      if (islandWindow && !islandWindow.isDestroyed()) {
        islandWindow.webContents.send('keyboard-update', data);
      }
    },
    volume: (data) => {
      if (islandWindow && !islandWindow.isDestroyed()) {
        islandWindow.webContents.send('volume-update', data);
      }
    },
    brightness: (data) => {
      if (islandWindow && !islandWindow.isDestroyed()) {
        islandWindow.webContents.send('brightness-update', data);
      }
    },
    fullscreen: (isFs) => {
      if (currentSettings.autoHideFullscreen && islandWindow && !islandWindow.isDestroyed()) {
        if (isFs) {
          islandWindow.hide();
        } else {
          islandWindow.show();
          islandWindow.setAlwaysOnTop(true, 'screen-saver');
          islandWindow.moveTop();
        }
      }
      if (islandWindow && !islandWindow.isDestroyed()) {
        islandWindow.webContents.send('fullscreen-change', isFs);
      }
    },
    headphone: (data) => {
      if (currentSettings.headphoneAlerts !== false && islandWindow && !islandWindow.isDestroyed()) {
        islandWindow.webContents.send('headphone-update', data);
      }
    },
    power: (data) => {
      if (islandWindow && !islandWindow.isDestroyed()) {
        islandWindow.webContents.send('power-update', data);
        islandWindow.webContents.send('battery-update', {
          hasBattery: true,
          percent: data.percent,
          isCharging: data.isCharging,
          acConnected: data.isCharging,
        });
      }
    },
  });
}

// ─── Win32 Working Set Compaction ─────────────────────────────────────────
const TRIMMER_EXE = path.join(__dirname, 'scripts', 'trimmer.exe');

function trimAppMemory() {
  if (global.gc) { try { global.gc(); } catch (_) {} }
  if (fs.existsSync(TRIMMER_EXE)) {
    try { execFile(TRIMMER_EXE, [], { windowsHide: true }, () => {}); } catch (_) {}
  }
}

const idleTrimInterval = setInterval(() => {
  if (currentIslandActivity === 'compact' || currentIslandActivity === 'compactMedia') {
    trimAppMemory();
  }
}, 30000);

// ─── App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createIslandWindow();
  createTray();
  startServices();

  setTimeout(trimAppMemory, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createIslandWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  clearInterval(idleTrimInterval);
  try { mediaService.stop(); } catch (_) {}
  try { batteryService.stop(); } catch (_) {}
  try { mediaController.stop(); } catch (_) {}
  try { systemMonitor.stop(); } catch (_) {}
});
