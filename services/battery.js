const si = require('systeminformation');

let timeoutId = null;
let isRunning = false;
let lastData = null;
let registeredCallback = null;

function scheduleNext(delayMs) {
  if (!isRunning) return;
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    if (isRunning && registeredCallback) {
      poll(registeredCallback);
    }
  }, delayMs);
}

async function poll(callback) {
  if (!isRunning) return;
  let nextDelay = 2500; // Fast responsive polling for laptop charger events

  try {
    const battery = await si.battery();
    const hasBattery = Boolean(battery && (battery.hasBattery || battery.maxCapacity > 0 || battery.percent > 0));
    const isCharging = Boolean(battery && (battery.isCharging || battery.acConnected));
    const data = {
      hasBattery: hasBattery,
      percent: Math.round((battery && battery.percent) ? battery.percent : 100),
      isCharging: isCharging,
      acConnected: Boolean(battery && battery.acConnected),
      timeRemaining: (battery && battery.timeRemaining) || 0,
    };

    const json = JSON.stringify(data);
    if (json !== lastData) {
      lastData = json;
      callback(data);
    }

    if (!hasBattery) {
      nextDelay = 15000;
    } else if (data.isCharging) {
      nextDelay = 2500;
    } else {
      nextDelay = 2500;
    }
  } catch (e) {
    const fallback = { hasBattery: true, percent: 100, isCharging: false, acConnected: false };
    const json = JSON.stringify(fallback);
    if (json !== lastData) {
      lastData = json;
      callback(fallback);
    }
    nextDelay = 5000;
  }

  scheduleNext(nextDelay);
}

function start(callback) {
  registeredCallback = callback;
  isRunning = true;
  poll(callback);
}

function stop() {
  isRunning = false;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  registeredCallback = null;
}

module.exports = { start, stop };
