const https = require('https');

const lyricsCache = new Map();
const MAX_CACHE_ENTRIES = 50;

function parseLrc(lrcText) {
  if (!lrcText || typeof lrcText !== 'string') return [];
  const lines = lrcText.split(/\r?\n/);
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let match;
    const timestamps = [];
    while ((match = timeRegex.exec(trimmed)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = parseFloat('0.' + match[3]);
      timestamps.push(minutes * 60 + seconds + ms);
    }

    const text = trimmed.replace(timeRegex, '').trim();
    if (timestamps.length > 0 && text) {
      for (const time of timestamps) {
        result.push({ time, text });
      }
    } else if (text && timestamps.length === 0) {
      // Unsynced line
      result.push({ time: -1, text });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

function fetchLyrics(track, artist, cb) {
  if (!track || track === 'Not Playing') {
    return cb(null);
  }

  const cacheKey = `${track}-${artist || ''}`.toLowerCase().trim();
  if (lyricsCache.has(cacheKey)) {
    return cb(lyricsCache.get(cacheKey));
  }

  const cleanTrack = encodeURIComponent(track.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim());
  const cleanArtist = encodeURIComponent((artist || '').replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim());

  const url = `https://lrclib.net/api/get?track_name=${cleanTrack}&artist_name=${cleanArtist}`;

  const req = https.get(url, {
    headers: { 'User-Agent': 'CodeWithSiril-DynamicIsland/1.0.0' },
    timeout: 3500,
  }, (res) => {
    let raw = '';
    res.on('data', chunk => { raw += chunk; });
    res.on('end', () => {
      try {
        if (res.statusCode === 200) {
          const json = JSON.parse(raw);
          let parsed = [];
          if (json.syncedLyrics) {
            parsed = parseLrc(json.syncedLyrics);
          } else if (json.plainLyrics) {
            parsed = json.plainLyrics.split(/\r?\n/).map((t, idx) => ({ time: -1, text: t.trim() })).filter(l => l.text);
          }

          if (lyricsCache.size >= MAX_CACHE_ENTRIES) {
            const firstKey = lyricsCache.keys().next().value;
            lyricsCache.delete(firstKey);
          }
          lyricsCache.set(cacheKey, parsed);
          cb(parsed);
        } else {
          lyricsCache.set(cacheKey, null);
          cb(null);
        }
      } catch (e) {
        lyricsCache.set(cacheKey, null);
        cb(null);
      }
    });
  });

  req.on('error', () => {
    lyricsCache.set(cacheKey, null);
    cb(null);
  });

  req.on('timeout', () => {
    req.destroy();
    lyricsCache.set(cacheKey, null);
    cb(null);
  });
}

module.exports = { fetchLyrics, parseLrc };
