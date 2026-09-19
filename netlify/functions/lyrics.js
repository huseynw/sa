const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractLyricsContainers(html) {
  const containers = [];
  const marker = 'data-lyrics-container="true"';
  let pos = 0;

  while ((pos = html.indexOf(marker, pos)) !== -1) {
    const divStart = html.lastIndexOf('<div', pos);
    if (divStart === -1) {
      pos += marker.length;
      continue;
    }
    const openTagEnd = html.indexOf('>', pos);
    if (openTagEnd === -1) break;

    let depth = 1;
    let curr = openTagEnd + 1;
    const contentStart = curr;

    while (depth > 0 && curr < html.length) {
      const nextOpen = html.indexOf('<div', curr);
      const nextClose = html.indexOf('</div>', curr);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        curr = nextOpen + 4;
      } else {
        depth--;
        if (depth === 0) {
          containers.push(html.substring(contentStart, nextClose));
          pos = nextClose + 6;
          break;
        }
        curr = nextClose + 6;
      }
    }
  }

  return containers;
}

function cleanGeniusText(htmlContent) {
  return htmlContent
    .replace(/<div[^>]*data-exclude-from-selection="true"[\s\S]*?<\/div>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const GENIUS_TOKEN = process.env.GENIUS_ACCESS_TOKEN || 'P6DUapfQdiQLQeEQXQRPfXlMfnaJ5-XSL0BozL0gR49RbjIEdkZDZs6FixXkhJra';
const MEGAN_KEY = 'megan_admin_master';

async function searchMeganLyrics(query) {
  try {
    const url = `https://apis.megan.qzz.io/download/lyrics?apikey=${MEGAN_KEY}&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.status?.success || !json.data) return [];
    const d = json.data;
    if (!d.lyrics && !d.syncedLyrics) return [];

    const hasSynced = Boolean(d.syncedLyrics && d.syncedLyrics.trim().length > 0);
    return [{
      id: `megan-${Date.now()}`,
      rawId: 'megan-1',
      title: d.title || query,
      artist: d.author || 'Artist',
      album: d.album || '',
      duration: d.duration ? Math.round(d.duration) : null,
      thumbnail: null,
      source: 'lrclib',
      isSynced: hasSynced,
      type: hasSynced ? 'synced' : 'plain',
      instrumental: false,
      plainLyrics: d.lyrics || (hasSynced ? d.syncedLyrics.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim() : ''),
      syncedLyrics: d.syncedLyrics || '',
      url: null,
    }];
  } catch (err) {
    console.warn('[Megan Lyrics Error]:', err.message);
    return [];
  }
}

async function searchLrclib(query) {
  try {
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'HusevnDownloader/2.0 (contact: support@husevn.dev)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];
    const items = await res.json();
    if (!Array.isArray(items)) return [];

    return items.map(item => {
      const hasSynced = Boolean(item.syncedLyrics && item.syncedLyrics.trim().length > 0);
      return {
        id: `lrclib-${item.id}`,
        rawId: item.id,
        title: item.trackName || item.name || 'Unknown Title',
        artist: item.artistName || 'Unknown Artist',
        album: item.albumName || '',
        duration: item.duration ? Math.round(item.duration) : null,
        thumbnail: null,
        source: 'lrclib',
        isSynced: hasSynced,
        type: hasSynced ? 'synced' : 'plain',
        instrumental: Boolean(item.instrumental),
        plainLyrics: item.plainLyrics || (hasSynced ? item.syncedLyrics.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim() : ''),
        syncedLyrics: item.syncedLyrics || '',
        url: null,
      };
    });
  } catch (err) {
    console.error('[LRCLIB Error]:', err.message);
    return [];
  }
}

async function searchGenius(query) {
  try {
    const url = `https://api.genius.com/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${GENIUS_TOKEN}`,
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const hits = data?.response?.hits || [];

    return hits.map(hit => {
      const r = hit.result || {};
      return {
        id: `genius-${r.id}`,
        rawId: r.id,
        title: r.title || 'Unknown Title',
        artist: r.artist_names || r.primary_artist?.name || 'Unknown Artist',
        album: null,
        duration: null,
        thumbnail: r.song_art_image_thumbnail_url || r.header_image_thumbnail_url || null,
        source: 'genius',
        isSynced: false,
        type: 'plain',
        instrumental: Boolean(r.instrumental),
        plainLyrics: null,
        syncedLyrics: '',
        url: r.url || null,
        path: r.path || null,
      };
    });
  } catch (err) {
    console.error('[Genius Search Error]:', err.message);
    return [];
  }
}

async function fetchGeniusLyrics(pageUrl) {
  if (!pageUrl) throw new Error('No pageUrl provided');
  const fullUrl = pageUrl.startsWith('http') ? pageUrl : `https://genius.com${pageUrl}`;

  try {
    const res = await fetch(fullUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const html = await res.text();
      const containers = extractLyricsContainers(html);

      if (containers.length > 0) {
        const rawLyrics = containers.map(cleanGeniusText).filter(Boolean).join('\n\n');
        let clean = rawLyrics;
        const firstBracket = clean.indexOf('[');
        if (firstBracket > 0 && firstBracket < 250) {
          const headerPrefix = clean.substring(0, firstBracket);
          if (/lyrics|contributors|translations/i.test(headerPrefix)) {
            clean = clean.substring(firstBracket).trim();
          }
        }
        if (clean && clean.length > 20) return clean;
      }
    }
  } catch (err) {
    console.warn('[Genius HTML fetch failed, trying Megan fallback]:', err.message);
  }

  try {
    const cleanQuery = fullUrl.split('/').pop().replace(/-lyrics$/i, '').replace(/-/g, ' ');
    if (cleanQuery) {
      const mUrl = `https://apis.megan.qzz.io/download/lyrics?apikey=${MEGAN_KEY}&q=${encodeURIComponent(cleanQuery)}`;
      const mRes = await fetch(mUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(6000),
      });
      if (mRes.ok) {
        const mJson = await mRes.json();
        if (mJson.status?.success && mJson.data?.lyrics) {
          return mJson.data.lyrics;
        }
      }
    }
  } catch (mErr) {
    console.warn('[Megan fallback failed]:', mErr.message);
  }

  return 'Lyrics not found.';
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  try {
    let payload = {};
    if (event.httpMethod === 'POST') {
      payload = JSON.parse(event.body || '{}');
    } else if (event.httpMethod === 'GET') {
      payload = event.queryStringParameters || {};
    }

    const { action = 'search', q = '', source = 'all', url = '', limit = 15 } = payload;
    const maxResults = parseInt(limit, 10) || 15;

    if (action === 'genius-lyrics') {
      if (!url) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ success: false, error: 'URL is required' }),
        };
      }
      const lyrics = await fetchGeniusLyrics(url);
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: true, lyrics }),
      };
    }

    if (action === 'search') {
      const query = q.trim();
      if (!query) {
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ success: true, results: [], total: 0 }),
        };
      }

      let meganPromise = Promise.resolve([]);
      let lrclibPromise = Promise.resolve([]);
      let geniusPromise = Promise.resolve([]);

      if (source === 'all' || source === 'lrclib') {
        meganPromise = searchMeganLyrics(query);
        lrclibPromise = searchLrclib(query);
      }
      if (source === 'all' || source === 'genius') {
        geniusPromise = searchGenius(query);
      }

      const [meganResults, lrclibResults, geniusResults] = await Promise.all([meganPromise, lrclibPromise, geniusPromise]);
      const allLrc = [...meganResults, ...lrclibResults];

      let combined = [];

      if (source === 'lrclib') {
        combined = allLrc.slice(0, maxResults);
      } else if (source === 'genius') {
        combined = geniusResults.slice(0, maxResults);
      } else {
        const syncedLrc = allLrc.filter(i => i.isSynced);
        const plainLrc = allLrc.filter(i => !i.isSynced);

        combined = [];
        let sIdx = 0, gIdx = 0, pIdx = 0;

        while (combined.length < maxResults && (sIdx < syncedLrc.length || gIdx < geniusResults.length || pIdx < plainLrc.length)) {
          if (sIdx < syncedLrc.length) {
            combined.push(syncedLrc[sIdx++]);
            if (combined.length >= maxResults) break;
          }
          if (gIdx < geniusResults.length) {
            combined.push(geniusResults[gIdx++]);
            if (combined.length >= maxResults) break;
          }
          if (pIdx < plainLrc.length) {
            combined.push(plainLrc[pIdx++]);
            if (combined.length >= maxResults) break;
          }
        }
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          query,
          source,
          results: combined.slice(0, maxResults),
          total: combined.length,
          stats: {
            lrclibCount: lrclibResults.length,
            geniusCount: geniusResults.length,
            syncedCount: combined.filter(r => r.isSynced).length,
            plainCount: combined.filter(r => !r.isSynced).length,
          },
        }),
      };
    }

    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
    };
  } catch (error) {
    console.error('[Lyrics Handler Error]:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: error.message || 'Internal Server Error' }),
    };
  }
};
