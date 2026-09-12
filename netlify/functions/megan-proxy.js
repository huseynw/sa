const MEGAN_BASE = 'https://apis.megan.qzz.io';
const API_KEY = process.env.MEGAN_API_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function cleanInstagramUrl(rawUrl) {
  if (!rawUrl) return '';
  const match = rawUrl.match(/https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv|stories\/[a-zA-Z0-9._]+)\/([A-Za-z0-9_-]+)/i);
  if (match) {
    return match[0] + '/';
  }
  return rawUrl.split('?')[0].trim();
}

async function meganGet(path, params = {}, timeout = 5000) {
  const url = new URL(`${MEGAN_BASE}${path}`);
  url.searchParams.set('apikey', API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(timeout),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
    },
  });
  if (!res.ok) throw new Error(`Megan API HTTP ${res.status}`);
  return res.json();
}

async function searchYouTubeDirect(query) {
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'az,en;q=0.9',
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`YouTube HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
  if (!match) throw new Error('No ytInitialData');
  const parsed = JSON.parse(match[1]);
  const contents = parsed?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
  if (!contents || !Array.isArray(contents)) throw new Error('No contents');

  const results = [];
  for (const c of contents) {
    const v = c.videoRenderer;
    if (v && v.videoId) {
      results.push({
        videoId: v.videoId,
        title: v.title?.runs?.map(r => r.text).join('') || '',
        author: v.ownerText?.runs?.[0]?.text || '',
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        duration: v.lengthText?.simpleText || '',
        views: v.viewCountText?.simpleText || '',
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      });
    }
  }
  return results;
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
        try {
          const directResults = await searchYouTubeDirect(query);
          if (directResults && directResults.length > 0) {
            data = {
              status: { success: true },
              data: { results: directResults },
            };
            break;
          }
        } catch (e) {
          console.warn('[megan-proxy] Direct YT search failed, fallback to Megan:', e.message);
        }
        data = await meganGet('/api/search/youtube', { q: query });
        break;
      case 'yt-info':
        data = await meganGet('/api/download/youtube/info', { url });
        break;

      // ── TikTok ──
      case 'tiktok': {
        try {
          data = await meganGet('/api/download/tiktok', { url });
        } catch (e) {
          console.warn('[megan-proxy] Megan TikTok fetch error:', e.message);
        }

        // TikTok şəkil slide postları üçün şəkillər siyahısını yoxla və tamamla
        const hasImages = Array.isArray(data?.data?.images) && data.data.images.length > 0;
        if (!hasImages) {
          try {
            const tikwmRes = await fetch('https://www.tikwm.com/api/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `url=${encodeURIComponent(url)}&hd=1`,
              signal: AbortSignal.timeout(6000),
            });
            const tikwmData = await tikwmRes.json();
            if (tikwmData?.data) {
              if (!data) data = { status: { success: true }, data: {} };
              if (!data.data) data.data = {};
              if (Array.isArray(tikwmData.data.images) && tikwmData.data.images.length > 0) {
                data.data.images = tikwmData.data.images;
              }
              if (!data.data.title && tikwmData.data.title) data.data.title = tikwmData.data.title;
              if (!data.data.cover && tikwmData.data.cover) data.data.cover = tikwmData.data.cover;
              if (!data.data.music && tikwmData.data.music) data.data.music = tikwmData.data.music;
              if (!data.data.videoUrl && tikwmData.data.play) data.data.videoUrl = tikwmData.data.play;
              data.status = { success: true };
            }
          } catch (err) {
            console.warn('[megan-proxy] TikWM image fallback failed:', err.message);
          }
        }
        break;
      }
      case 'tiktok-audio':
        try {
          const tikwmRes = await fetch('https://www.tikwm.com/api/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `url=${encodeURIComponent(url)}&hd=1`,
            signal: AbortSignal.timeout(8000),
          });
          const tikwmData = await tikwmRes.json();
          if (tikwmData?.data?.music) {
            data = {
              status: { success: true },
              data: {
                music: tikwmData.data.music,
                title: tikwmData.data.title || '',
              },
            };
          } else {
            throw new Error('TikWM: music not found');
          }
        } catch (e) {
          console.error('[megan-proxy] TikWM fallback failed:', e.message);
          data = await meganGet('/api/download/tiktok', { url });
        }
        break;
      case 'tiktok-info':
        data = await meganGet('/api/download/tiktok/info', { url });
        break;

      // ── Instagram ──
      case 'instagram': {
        const cleanUrl = cleanInstagramUrl(url);
        data = await meganGet('/api/download/instagram', { url: cleanUrl }, 25000);
        break;
      }
      case 'instagram-story': {
        const cleanUrl = cleanInstagramUrl(url);
        data = await meganGet('/api/download/instagram/story', { url: cleanUrl }, 25000);
        break;
      }

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
