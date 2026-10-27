const si = require('systeminformation');

let smoothRx = 0;
let smoothTx = 0;
let isRunning = false;
let isActiveMode = false;
let timeoutId = null;
let registeredCallback = null;

function formatSpeed(bytesPerSec) {
  if (bytesPerSec < 100) return '0.0 KB/s';
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

let isPolling = false;

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
  if (isPolling) return;
  isPolling = true;

  try {
    const nets = await si.networkStats();
    isPolling = false;
    if (!isRunning) return;

    if (nets && nets.length > 0) {
      // Sum across all active interfaces
      let rawRx = 0, rawTx = 0;
      for (const net of nets) {
        rawRx += net.rx_sec || 0;
        rawTx += net.tx_sec || 0;
      }

      // Exponential moving average for smooth, non-jittery readouts
      smoothRx = smoothRx === 0 ? rawRx : (smoothRx * 0.65 + rawRx * 0.35);
      smoothTx = smoothTx === 0 ? rawTx : (smoothTx * 0.65 + rawTx * 0.35);

      const data = {
        download: formatSpeed(smoothRx),
        upload: formatSpeed(smoothTx),
        downloadRaw: Math.round(smoothRx),
        uploadRaw: Math.round(smoothTx),
      };
      callback(data);
    }
  } catch (e) {
    isPolling = false;
  }

  // If user is actively viewing network panel: 2.5s; if island is compact idle: 15s backoff
  const nextDelay = isActiveMode ? 2500 : 15000;
  scheduleNext(nextDelay);
}

function setActive(active) {
  const changed = (isActiveMode !== active);
  isActiveMode = active;
  if (changed && active && isRunning && registeredCallback) {
    // Immediately poll if user just opened network activity
    poll(registeredCallback);
  }
}

function start(callback) {
  registeredCallback = callback;
  isRunning = true;
  // First baseline call after 1s
  setTimeout(() => {
    if (isRunning) poll(callback);
  }, 1000);
}

function stop() {
  isRunning = false;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  registeredCallback = null;
}

module.exports = { start, stop, setActive };
