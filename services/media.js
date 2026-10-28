const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Write the PS script to a temp file to avoid backtick conflicts in JS strings
const PS_SCRIPT_PATH = path.join(os.tmpdir(), 'codewithsiril_media.ps1');

const PS_SCRIPT_CONTENT = [
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  '',
  '$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {',
  '  $_.Name -eq "AsTask" -and',
  '  $_.IsGenericMethodDefinition -and',
  '  $_.GetParameters().Count -eq 1',
  '} | Select-Object -First 1',
  '',
  'function Await($WinRtTask, $ResultType) {',
  '  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)',
  '  $netTask = $asTask.Invoke($null, @($WinRtTask))',
  '  $netTask.Wait(1200) | Out-Null',
  '  return $netTask.Result',
  '}',
  '',
  'try {',
  '  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType=WindowsRuntime] | Out-Null',
  '  $asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()',
  '  $manager = Await $asyncOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])',
  '',
  '  $sessions = $manager.GetSessions()',
  '  if ($sessions.Count -eq 0) {',
  '    Write-Output "SESSION::None|||0|0|"',
  '  } else {',
  '    foreach ($s in $sessions) {',
  '      try {',
  '        $propsOp = $s.TryGetMediaPropertiesAsync()',
  '        $props = Await $propsOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])',
  '        $info = $s.GetPlaybackInfo()',
  '        $status = if ($info) { $info.PlaybackStatus.ToString() } else { "None" }',
  '        $title = if ($props -and $props.Title) { $props.Title -replace "\\|", "-" } else { "" }',
  '        $artist = if ($props -and $props.Artist) { $props.Artist -replace "\\|", "-" } else { "" }',
  '        $t = $s.GetTimelineProperties()',
  '        $pos = if ($t) { [Math]::Round($t.Position.TotalSeconds) } else { 0 }',
  '        $dur = if ($t) { [Math]::Round($t.EndTime.TotalSeconds) } else { 0 }',
  '        $app = if ($s.SourceAppId) { $s.SourceAppId -replace "\\|", "-" } else { "" }',
  '        Write-Output "SESSION::$status|$title|$artist|$pos|$dur|$app"',
  '      } catch {}',
  '    }',
  '  }',
  '} catch {',
  '  Write-Output "SESSION::None|||0|0|"',
  '}',
].join('\n');

// Write script to temp file once
try {
  fs.writeFileSync(PS_SCRIPT_PATH, PS_SCRIPT_CONTENT, 'utf8');
} catch (e) {
  console.error('Failed to write media PS script:', e);
}

let timeoutId = null;
let isRunning = false;
let lastData = null;
let activeTrack = null;
let registeredCallback = null;

const https = require('https');
const thumbCache = new Map(); // Use Map to enforce LRU-like limit
const MAX_CACHE_ENTRIES = 30;

function fetchThumbnail(title, artist, cb) {
  if (!title) return cb(null);
  const key = `${title}-${artist}`.trim();
  if (thumbCache.has(key)) return cb(thumbCache.get(key));

  const query = encodeURIComponent(`${title} ${artist}`.trim());
  const url = `https://www.youtube.com/results?search_query=${query}`;

  const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
    let html = '';
    res.on('data', c => {
      html += c;
      // Abort early if videoId found to save bandwidth and memory
      if (html.includes('"videoId":"')) {
        req.destroy();
      }
    });
    res.on('close', () => {
      const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      if (match) {
        const thumbUrl = `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg`;
        if (thumbCache.size >= MAX_CACHE_ENTRIES) {
          const firstKey = thumbCache.keys().next().value;
          thumbCache.delete(firstKey);
        }
        thumbCache.set(key, thumbUrl);
        cb(thumbUrl);
      } else {
        thumbCache.set(key, null);
        cb(null);
      }
    });
  });
  req.on('error', () => {
    thumbCache.set(key, null);
    cb(null);
  });
  req.setTimeout(2500, () => {
    req.destroy();
    cb(null);
  });
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

function poll(callback) {
  if (!isRunning) return;
  if (isPolling) return; // Strictly prevent multiple powershell instances from running concurrently
  isPolling = true;

  execFile(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', PS_SCRIPT_PATH,
    ],
    { timeout: 3000 },
    (err, stdout, stderr) => {
      isPolling = false;
      if (!isRunning) return;

      if (err) {
        // Backoff on timeout or error
        scheduleNext(6000);
        return;
      }

      const lines = (stdout || '').trim().split(/\r?\n/);
      const sessions = [];

      function formatSource(appId) {
        if (!appId) return 'Media';
        const low = appId.toLowerCase();
        if (low.includes('spotify')) return 'Spotify';
        if (low.includes('applemusic') || low.includes('itunes')) return 'Apple Music';
        if (low.includes('vlc')) return 'VLC Media Player';
        if (low.includes('chrome')) return 'Google Chrome';
        if (low.includes('msedge') || low.includes('edge')) return 'Microsoft Edge';
        if (low.includes('firefox')) return 'Firefox';
        return 'Media';
      }

      for (const line of lines) {
        if (!line.startsWith('SESSION::')) continue;
        const raw = line.slice(9);
        const parts = raw.split('|');
        const status = parts[0] || 'None';
        const title = (parts[1] || '').trim();
        const artist = (parts[2] || '').trim();
        const position = parseInt(parts[3], 10) || 0;
        const duration = parseInt(parts[4], 10) || 0;
        const source = formatSource(parts[5]);

        if (title) {
          sessions.push({ status, title, artist, position, duration, source });
        }
      }

      // ─── Strict Active Playback Arbitration ─────────────────────
      let winner = null;
      const playingSessions = sessions.filter(s => s.status === 'Playing');

      if (playingSessions.length > 0) {
        // An actively playing session exists
        if (activeTrack) {
          const stillPlaying = playingSessions.find(s => s.title === activeTrack.title);
          if (stillPlaying) winner = stillPlaying;
        }
        if (!winner) {
          const substantial = playingSessions.find(s => s.duration > 15);
          winner = substantial || playingSessions[0];
        }
        activeTrack = winner;
      } else {
        // No session is currently playing!
        // Only report Paused if we were actively playing this track previously in the same app session
        if (activeTrack) {
          const pausedCurrent = sessions.find(s => s.title === activeTrack.title);
          if (pausedCurrent) {
            winner = Object.assign({}, pausedCurrent, { status: 'Paused' });
          } else {
            activeTrack = null;
          }
        }
      }

      if (!winner) {
        activeTrack = null;
        const empty = { status: 'None', title: '', artist: '', position: 0, duration: 0, thumbnail: null };
        const json = JSON.stringify(empty);
        if (json !== lastData) {
          lastData = json;
          callback(empty);
        }
        scheduleNext(3000);
        return;
      }

      const key = `${winner.title}-${winner.artist}`.trim();
      const existingThumb = thumbCache.get(key);

      const data = {
        status: winner.status,
        title: winner.title,
        artist: winner.artist,
        position: winner.position,
        duration: winner.duration,
        source: winner.source || 'Media',
        thumbnail: existingThumb || null,
      };

      const json = JSON.stringify(data);
      if (json !== lastData) {
        lastData = json;
        callback(data);
      }

      // If thumbnail not yet cached, fetch it in background
      if (winner.title && !thumbCache.has(key)) {
        fetchThumbnail(winner.title, winner.artist, (thumbUrl) => {
          if (thumbUrl && isRunning) {
            data.thumbnail = thumbUrl;
            lastData = JSON.stringify(data);
            callback(data);
          }
        });
      }

      // Adaptive polling rate: fast when playing (2.5s), moderate when paused (4.5s)
      const nextDelay = winner.status === 'Playing' ? 2500 : 4500;
      scheduleNext(nextDelay);
    }
  );
}

function pollNow() {
  if (isRunning && registeredCallback) {
    if (timeoutId) clearTimeout(timeoutId);
    poll(registeredCallback);
  }
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
  try { fs.unlinkSync(PS_SCRIPT_PATH); } catch (_) {}
}

module.exports = { start, stop, pollNow };
