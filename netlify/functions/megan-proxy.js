const MEGAN_BASE = 'https://apis.megan.qzz.io';
const API_KEY = process.env.MEGAN_API_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function meganGet(path, params = {}) {
  const url = new URL(`${MEGAN_BASE}${path}`);
  url.searchParams.set('apikey', API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(7000) });
      if (!res.ok) throw new Error(`Megan API HTTP ${res.status}`);
      const data = await res.json();
      if (data?.status?.success === false && attempt < 2) {
        console.error(`[megan-proxy] success=false (attempt ${attempt + 1}/3):`, data?.status?.error || 'empty response');
        await new Promise(r => setTimeout(r, 800));
        continue;
      }
      return data;
    } catch (err) {
      lastError = err;
      console.error(`[megan-proxy] attempt ${attempt + 1}/3 failed for ${path}:`, err.message);
      if (attempt < 2) await new Promise(r => setTimeout(r, 800));
    }
  }
  throw lastError;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    if (!API_KEY) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'MEGAN_API_KEY not set' }) };
    }

    const { action, url, query, format } = JSON.parse(event.body || '{}');

    let data;

    switch (action) {
      // ── YouTube ──
      case 'yt-mp3':
        data = await meganGet('/download/mp3', { url });
        break;
      case 'yt-mp4':
        data = await meganGet('/download/mp4', { url });
        break;
      case 'yt-hd':
        data = await meganGet('/download/hd', { url });
        break;
      case 'yt-search':
        data = await meganGet('/api/search/youtube', { q: query });
        break;
      case 'yt-info':
        data = await meganGet('/api/download/youtube/info', { url });
        break;

      // ── TikTok ──
      case 'tiktok':
        data = await meganGet('/api/download/tiktok', { url });
        break;
      case 'tiktok-audio':
        data = await meganGet('/api/download/tiktok/audio', { url });
        break;
      case 'tiktok-info':
        data = await meganGet('/api/download/tiktok/info', { url });
        break;

      // ── Instagram ──
      case 'instagram':
        data = await meganGet('/api/download/instagram', { url });
        break;
      case 'instagram-story':
        data = await meganGet('/api/download/instagram/story', { url });
        break;

      // ── Facebook ──
      case 'facebook':
        data = await meganGet('/api/download/facebook', { url });
        break;
      case 'facebook-reel':
        data = await meganGet('/api/download/facebook/reel', { url });
        break;
      case 'facebook-info':
        data = await meganGet('/api/download/facebook/info', { url });
        break;

      // ── Twitter ──
      case 'twitter':
        data = await meganGet('/api/download/twitter', { url });
        break;

      // ── Snapchat ──
      case 'snapchat':
        data = await meganGet('/api/download/snapchat', { url });
        break;

      default:
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid action: ' + action }) };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('[megan-proxy] Error:', error.message);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message || 'Megan API xətası' }),
    };
  }
};
