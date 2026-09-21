const MEGAN_BASE = 'https://apis.megan.qzz.io';
const MASTER_KEY = 'megan_admin_master';
const CANDIDATE_KEYS = [
  MASTER_KEY,
  process.env.MEGAN_API_KEY,
].filter((k, i, arr) => k && arr.indexOf(k) === i);

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

function cleanYouTubeUrl(rawUrl) {
  if (!rawUrl) return '';
  let u = rawUrl.trim();
  try {
    u = decodeURIComponent(u);
  } catch {}

  const match = u.match(/(?:youtu\.be\/|(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|v\/|live\/))([a-zA-Z0-9_-]{11})/i);
  if (match && match[1]) {
    return `https://www.youtube.com/watch?v=${match[1]}`;
  }

  if (u.includes('music.youtube.com')) {
    u = u.replace(/https?:\/\/music\.youtube\.com/i, 'https://www.youtube.com');
  }

  return u.split('&si=')[0].split('?si=')[0].trim();
}

async function fetchPinterest(inputUrl) {
  try {
    let finalUrl = inputUrl;
    let pinId = null;

    try {
      const headRes = await fetch(inputUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(6000),
      });
      finalUrl = headRes.url;
    } catch {}

    const idMatch = finalUrl.match(/\/pin\/(\d+)/i) || inputUrl.match(/\/pin\/(\d+)/i);
    if (idMatch) pinId = idMatch[1];

    let title = 'Pinterest Photo';
    const images = [];
    let videoUrl = null;

    if (pinId) {
      try {
        const apiUrl = `https://www.pinterest.com/resource/PinResource/get/?data=${encodeURIComponent(JSON.stringify({ options: { id: pinId } }))}`;
        const apiRes = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'X-Pinterest-PWS-Handler': 'www/[username].js',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (apiRes.ok) {
          const json = await apiRes.json();
          const pinData = json?.resource_response?.data;
          if (pinData) {
            title = pinData.title || pinData.grid_title || pinData.seo_title || title;

            if (pinData.carousel_data?.carousel_slots) {
              for (const slot of pinData.carousel_data.carousel_slots) {
                const imgUrl = slot.images?.orig?.url || slot.images?.['736x']?.url || Object.values(slot.images || {})[0]?.url;
                if (imgUrl) images.push(imgUrl.replace(/\/(?:[0-9]+x)\//, '/originals/'));
              }
            }

            if (pinData.story_pin_data?.pages) {
              for (const page of pinData.story_pin_data.pages) {
                const img = page.blocks?.find(b => b.image)?.image;
                const imgUrl = img?.images?.orig?.url || img?.images?.['736x']?.url || Object.values(img?.images || {})[0]?.url;
                if (imgUrl) images.push(imgUrl.replace(/\/(?:[0-9]+x)\//, '/originals/'));
              }
            }

            if (images.length === 0 && pinData.images) {
              const best = pinData.images.orig?.url || pinData.images['736x']?.url || pinData.images['474x']?.url || Object.values(pinData.images)[0]?.url;
              if (best) images.push(best.replace(/\/(?:[0-9]+x)\//, '/originals/'));
            }

            const videoList = pinData.videos?.video_list;
            if (videoList && typeof videoList === 'object') {
              const formats = Object.values(videoList).filter(f => f.url).sort((a, b) => (b.width || 0) - (a.width || 0));
              if (formats[0]?.url) videoUrl = formats[0].url;
            }
          }
        }
      } catch (err) {
        console.warn('[Pinterest] PinResource error:', err.message);
      }
    }

    if (images.length === 0 && !videoUrl) {
      try {
        const oembedRes = await fetch(`https://www.pinterest.com/oembed.json?url=${encodeURIComponent(finalUrl)}`, {
          signal: AbortSignal.timeout(6000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
        });
        if (oembedRes.ok) {
          const oe = await oembedRes.json();
          if (oe.title && oe.title.trim()) title = oe.title.trim();
          if (oe.thumbnail_url) images.push(oe.thumbnail_url.replace(/\/(?:[0-9]+x)\//, '/originals/'));
        }
      } catch {}
    }

    const blacklist = ['d53b014d86a6b6761bf649a0ed813c2b', 'logo_transparent', 'favicon', '75x75_RS'];
    const cleanImages = [...new Set(images)].filter(img => !blacklist.some(b => img.includes(b)));

    const meta = {
      uploadDate: pinData?.created_at || null,
      region: 'Global',
      shadowban: false,
      likes: pinData?.reaction_counts?.['1'] || pinData?.repin_count || 0,
      comments: pinData?.comment_count || 0,
      saves: pinData?.repin_count || 0,
      resolution: videoList ? `${Object.values(videoList)[0]?.width}×${Object.values(videoList)[0]?.height}` : (cleanImages.length > 0 ? 'Original' : null),
      duration: videoList ? Object.values(videoList)[0]?.duration : null,
      fps: videoList ? 30 : null,
    };

    if (cleanImages.length > 0) {
      return { success: true, type: 'gallery', title: title || 'Pinterest Şəkil', images: cleanImages, image: cleanImages[0], metadata: meta };
    }
    if (videoUrl) {
      return { success: true, type: 'video', title: title || 'Pinterest Video', video_url: videoUrl, metadata: meta };
    }
    return null;
  } catch (e) {
    console.warn('[Pinterest] extract error:', e.message);
    return null;
  }
}

async function meganGet(path, params = {}, timeout = 25000) {
  let lastError = null;

  for (const key of CANDIDATE_KEYS) {
    try {
      const url = new URL(`${MEGAN_BASE}${path}`);
      url.searchParams.set('apikey', key);
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

      if (!res.ok) {
        let errText = '';
        try { errText = await res.text(); } catch {}
        if (res.status === 401 || res.status === 403 || errText.includes('revoked') || errText.includes('API key')) {
          lastError = new Error(`Megan API HTTP ${res.status}: ${errText}`);
          continue;
        }
        throw new Error(`Megan API HTTP ${res.status}: ${errText}`);
      }

      const json = await res.json();
      if (json && json.success === false && (json.error?.includes('revoked') || json.error?.includes('API key'))) {
        lastError = new Error(json.error);
        continue;
      }
      return json;
    } catch (e) {
      lastError = e;
      if (e.name === 'TimeoutError' || e.message?.includes('aborted') || e.message?.includes('timeout')) {
        break;
      }
    }
  }

  throw lastError || new Error('Megan API request failed');
}

async function fetchYouTubeVideoWithFallback(targetUrl) {
  const videoEndpoints = ['/download/mp4', '/download/ytmp4', '/download/dlmp4', '/download/hd', '/download/video'];
  let lastErr = null;
  for (const ep of videoEndpoints) {
    try {
      const data = await meganGet(ep, { url: targetUrl }, 20000);
      if (data?.data && (data.data.downloadUrl || data.data.proxyUrl)) {
        return data;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('YouTube video yükləmə linki tapılmadı');
}

async function fetchYouTubeAudioWithFallback(targetUrl) {
  const audioEndpoints = ['/download/mp3', '/download/ytmp3', '/download/dlmp3', '/download/audio', '/download/yta'];
  let lastErr = null;
  for (const ep of audioEndpoints) {
    try {
      const data = await meganGet(ep, { url: targetUrl }, 20000);
      if (data?.data && (data.data.downloadUrl || data.data.proxyUrl)) {
        return data;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('YouTube audio yükləmə linki tapılmadı');
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
    if (CANDIDATE_KEYS.length === 0) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'MEGAN_API_KEY not set' }) };
    }

    const { action, url, query, format } = JSON.parse(event.body || '{}');

    let data;
    const targetYtUrl = action?.startsWith('yt-') && url ? cleanYouTubeUrl(url) : url;

    switch (action) {
      case 'yt-mp3':
        data = await fetchYouTubeAudioWithFallback(targetYtUrl);
        break;
      case 'yt-mp4':
        data = await fetchYouTubeVideoWithFallback(targetYtUrl);
        break;
      case 'yt-hd':
        try {
          data = await meganGet('/download/hd', { url: targetYtUrl }, 20000);
          if (!data?.data?.downloadUrl && !data?.data?.proxyUrl) throw new Error('No HD URL');
        } catch {
          data = await fetchYouTubeVideoWithFallback(targetYtUrl);
        }
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
      case 'yt-info': {
        let oeTitle = '';
        let oeAuthor = '';
        let oeThumb = '';
        let ytMeta = {
          resolution: '1080p (FHD)',
          fps: 30,
          region: 'Global',
          shadowban: false,
        };

        try {
          const oeRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(targetYtUrl)}&format=json`, {
            signal: AbortSignal.timeout(4000),
          });
          if (oeRes.ok) {
            const oe = await oeRes.json();
            oeTitle = oe.title || '';
            oeAuthor = oe.author_name || '';
            oeThumb = oe.thumbnail_url || '';
          }
        } catch {}

        try {
          const ytHtmlRes = await fetch(targetYtUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            signal: AbortSignal.timeout(4500),
          });
          if (ytHtmlRes.ok) {
            const html = await ytHtmlRes.text();
            const vm = html.match(/"viewCount":"(\d+)"/);
            const lm = html.match(/"lengthSeconds":"(\d+)"/);
            const lkm = html.match(/"likeCountIfIndifferentNumber":\s*"?(\d+)"?/);
            const pubm = html.match(/"publishDate":"([^"]+)"/) || html.match(/"uploadDate":"([^"]+)"/);
            if (vm) ytMeta.views = parseInt(vm[1], 10);
            if (lm) ytMeta.duration = parseInt(lm[1], 10);
            if (lkm) ytMeta.likes = parseInt(lkm[1], 10);
            if (pubm) ytMeta.uploadDate = pubm[1];
            if (ytMeta.views && ytMeta.likes) {
              ytMeta.engagement = `${(((ytMeta.likes) / ytMeta.views) * 100).toFixed(2)}%`;
            }
          }
        } catch {}

        try {
          data = await meganGet('/api/download/youtube/info', { url: targetYtUrl });
        } catch {}

        if (!oeTitle) {
          try {
            const dlMeta = await meganGet('/download/mp4', { url: targetYtUrl }, 8000);
            if (dlMeta?.data?.title) oeTitle = dlMeta.data.title;
            if (dlMeta?.data?.thumbnail && !oeThumb) oeThumb = dlMeta.data.thumbnail;
          } catch {}
        }

        if (!data) data = { status: { success: true }, data: {} };
        if (!data.data) data.data = {};
        if (oeTitle) data.data.title = oeTitle;
        if (oeAuthor) data.data.author = oeAuthor;
        if (oeThumb && !data.data.thumbnail) data.data.thumbnail = oeThumb;
        data.data.metadata = ytMeta;
        data.status = { success: true, code: 200, name: 'OK' };
        break;
      }

      case 'tiktok': {
        try {
          const tikwmRes = await fetch('https://www.tikwm.com/api/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `url=${encodeURIComponent(url)}&hd=1`,
            signal: AbortSignal.timeout(6000),
          });
          const tikwmData = await tikwmRes.json();
          if (tikwmData?.data) {
            const d = tikwmData.data;
            const fileSize = d.hd_size || d.size || 0;
            const dur = d.duration || 0;
            const bitrateKbps = (fileSize && dur) ? Math.round((fileSize * 8) / dur / 1000) : 0;
            const views = d.play_count || 0;
            const likes = d.digg_count || 0;
            const comments = d.comment_count || 0;
            const shares = d.share_count || 0;
            const saves = d.collect_count || 0;
            const engagement = views > 0 ? parseFloat((((likes + comments + shares + saves) / views) * 100).toFixed(2)) : 0;

            data = {
              status: { success: true, code: 200, name: 'OK' },
              data: {
                title: d.title || '',
                cover: d.cover || '',
                videoUrl: d.play || '',
                videoUrlNoWatermark: d.play || '',
                music: d.music || '',
                images: Array.isArray(d.images) ? d.images : [],
                metadata: {
                  uploadDate: d.create_time ? new Date(d.create_time * 1000).toISOString() : null,
                  region: d.region ? d.region.toUpperCase() : null,
                  shadowban: !!d.is_nff_or_nr,
                  resolution: Array.isArray(d.images) && d.images.length > 0 ? 'Original' : '1080×1920 (FHD)',
                  fps: 30,
                  bitrate: bitrateKbps ? `${bitrateKbps} kbps` : null,
                  duration: dur,
                  size: fileSize,
                  views,
                  likes,
                  comments,
                  shares,
                  saves,
                  engagement: engagement ? `${engagement}%` : null,
                },
              },
            };
          }
        } catch (e) {
          console.warn('[megan-proxy] TikWM TikTok fetch error:', e.message);
        }

        if (!data?.data?.videoUrl && (!data?.data?.images || data.data.images.length === 0)) {
          try {
            data = await meganGet('/api/download/tiktok', { url });
          } catch (e) {
            console.warn('[megan-proxy] Megan TikTok fallback error:', e.message);
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

      case 'facebook':
        data = await meganGet('/api/download/facebook', { url });
        break;
      case 'facebook-reel':
        data = await meganGet('/api/download/facebook/reel', { url });
        break;
      case 'facebook-info':
        data = await meganGet('/api/download/facebook/info', { url });
        break;

      case 'twitter':
        data = await meganGet('/api/download/twitter', { url });
        break;

      case 'snapchat':
        data = await meganGet('/api/download/snapchat', { url });
        break;

      case 'pinterest': {
        const pinData = await fetchPinterest(url);
        if (!pinData) throw new Error('Pinterest faylı tapılmadı');
        data = { status: { success: true }, data: pinData };
        break;
      }

      case 'probe-url': {
        try {
          const headRes = await fetch(url, {
            method: 'HEAD',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
            },
            signal: AbortSignal.timeout(5000),
          });
          const cl = headRes.headers.get('content-length');
          const ct = headRes.headers.get('content-type');
          data = {
            status: { success: true },
            data: {
              size: cl ? parseInt(cl, 10) : null,
              contentType: ct || null,
            },
          };
        } catch {
          data = { status: { success: true }, data: { size: null } };
        }
        break;
      }

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
