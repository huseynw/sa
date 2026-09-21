const MEGAN_BASE = 'https://apis.megan.qzz.io';
const MASTER_KEY = 'megan_admin_master';
const CANDIDATE_KEYS = [
  MASTER_KEY,
  process.env.MEGAN_API_KEY,
].filter((k, i, arr) => k && arr.indexOf(k) === i);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

function toProxiedUrl(targetUrl, filename = 'media.mp4') {
  if (!targetUrl || typeof targetUrl !== 'string') return targetUrl;
  return targetUrl;
}

function sanitizeFilename(name) {
  if (!name) return 'Media';
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F#%&{}\\<>*?/$!'":@+`|=]/g, '')
    .slice(0, 60);
}

async function recordShortcutDownload(platform) {
  if (!platform) return;
  const norm = platform.toLowerCase();

  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'site-stats', consistency: 'strong' });
    let stats = (await store.get('stats', { type: 'json' })) || {
      totalVisits: 0,
      totalDownloads: 0,
      platformDownloads: {
        youtube: 0,
        tiktok: 0,
        instagram: 0,
        pinterest: 0,
        facebook: 0,
      },
      lastUpdated: new Date().toISOString(),
    };
    stats.totalDownloads = (stats.totalDownloads || 0) + 1;
    stats.platformDownloads = stats.platformDownloads || {};
    stats.platformDownloads[norm] = (stats.platformDownloads[norm] || 0) + 1;
    stats.lastUpdated = new Date().toISOString();
    await store.setJSON('stats', stats);
    return;
  } catch {}

  try {
    await fetch('https://husevndownloader.netlify.app/api/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'download', platform: norm }),
      signal: AbortSignal.timeout(3500),
    });
  } catch (err) {
    console.warn('[Stats] Failed to record shortcut download:', err.message);
  }
}

async function successResponse(data) {
  if (data.platform) {
    try {
      await recordShortcutDownload(data.platform);
    } catch {}
  }

  const rawTitle = data.title || 'Media';
  const cleanTitle = sanitizeFilename(rawTitle.replace(/^HUSEVN DOWNLOADER\s*-\s*/i, '')) || 'Media';
  const brandedTitle = `HUSEVN DOWNLOADER - ${cleanTitle}`;
  const mp3Filename = `${brandedTitle}.mp3`;
  const videoFilename = `${brandedTitle}.mp4`;

  const res = {
    success: true,
    ...data,
    title: brandedTitle,
    raw_title: rawTitle,
    filename: mp3Filename,
    mp3_name: mp3Filename,
    video_name: videoFilename,
  };
  if (data.video_url) {
    const pVideo = toProxiedUrl(data.video_url, videoFilename);
    res.video_url = pVideo;
    res.video = pVideo;
  }
  if (data.audio_url) {
    const pAudio = toProxiedUrl(data.audio_url, mp3Filename);
    res.audio_url = pAudio;
    res.mp3 = pAudio;
  }
  if (Array.isArray(data.images)) {
    const pImages = data.images.map((url, i) => toProxiedUrl(url, `photo_${i + 1}.jpg`));
    res.images = pImages;
    res.photo_names = pImages.map((_, i) => `Photo ${i + 1}`);
    const photosDict = {};
    pImages.forEach((url, i) => {
      photosDict[`Photo ${i + 1}`] = url;
    });
    res.photos = photosDict;
    res.photo_list = pImages.map((url, i) => ({
      name: `Photo ${i + 1}`,
      photo: url,
      url,
    }));
  }
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify(res),
  };
}

function buildPhotosDict(images = []) {
  const dict = {};
  images.forEach((img, idx) => {
    dict[`Photo ${idx + 1}`] = toProxiedUrl(img, `photo_${idx + 1}.jpg`);
  });
  return dict;
}

function cleanUrl(rawUrl) {
  if (!rawUrl) return '';
  let u = rawUrl.trim();
  try {
    u = decodeURIComponent(u);
  } catch {}
  const match = u.match(/https?:\/\/[^\s"'<>]+/i);
  if (match) u = match[0];
  return u.trim();
}

function cleanInstagramUrl(rawUrl) {
  if (!rawUrl) return '';
  const match = rawUrl.match(/https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:(?:share\/)?(?:p|reel|reels|tv)|stories\/[a-zA-Z0-9._]+)\/([A-Za-z0-9_-]+)/i);
  if (match) {
    const id = match[1];
    if (match[0].includes('reel')) {
      return `https://www.instagram.com/reel/${id}/`;
    }
    return `https://www.instagram.com/p/${id}/`;
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
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
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

  throw lastError || new Error('Megan API xətası');
}

async function fetchCobalt(url, isAudioOnly = false) {
  const cobaltUrls = [
    process.env.COBALT_API_URL,
  ].filter(Boolean);

  const cobaltPayload = {
    url,
    videoQuality: 'max',
    filenameStyle: 'nerdy',
    downloadMode: isAudioOnly ? 'audio' : 'auto',
    audioFormat: isAudioOnly ? 'mp3' : undefined,
  };

  for (const targetUrl of cobaltUrls) {
    try {
      const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
      if (targetUrl === process.env.COBALT_API_URL && process.env.COBALT_API_KEY) {
        headers['Authorization'] = `Api-Key ${process.env.COBALT_API_KEY}`;
      }
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(cobaltPayload),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (data && (data.status === 'picker' || data.url)) {
        return data;
      }
    } catch {
    }
  }
  return null;
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

    if (images.length === 0 && !videoUrl) {
      try {
        const pageRes = await fetch(finalUrl, {
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
          signal: AbortSignal.timeout(8000),
        });
        const html = await pageRes.text();
        const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && title === 'Pinterest Photo') title = titleMatch[1].replace(/\s*\|\s*Pinterest.*$/i, '').trim();
        const regex = /https:\/\/i\.pinimg\.com\/(?:originals|[0-9]+x)\/([0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{32}\.(?:jpg|png|webp|jpeg))/gi;
        let m;
        while ((m = regex.exec(html)) !== null) {
          images.push('https://i.pinimg.com/originals/' + m[1]);
        }
      } catch {}
    }

    const blacklist = ['d53b014d86a6b6761bf649a0ed813c2b', 'logo_transparent', 'favicon', '75x75_RS'];
    const cleanImages = [...new Set(images)].filter(img => !blacklist.some(b => img.includes(b)));

    if (cleanImages.length > 0) {
      return { success: true, type: 'gallery', title: title || 'Pinterest Şəkil', images: cleanImages, image: cleanImages[0] };
    }
    if (videoUrl) {
      return { success: true, type: 'video', title: title || 'Pinterest Video', video_url: videoUrl };
    }

    return null;
  } catch (e) {
    console.warn('[Pinterest] extract error:', e.message);
    return null;
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  let inputUrl = '';
  if (event.httpMethod === 'GET') {
    if (event.rawQuery) {
      const idx = event.rawQuery.indexOf('url=');
      if (idx !== -1) {
        const rawPart = event.rawQuery.slice(idx + 4);
        try {
          inputUrl = decodeURIComponent(rawPart);
        } catch {
          inputUrl = rawPart;
        }
      }
    }
    if (!inputUrl) {
      inputUrl = event.queryStringParameters?.url || '';
    }
  } else if (event.httpMethod === 'POST') {
    try {
      const parsed = JSON.parse(event.body || '{}');
      inputUrl = parsed.url || parsed.link || '';
    } catch {
      inputUrl = event.body || '';
    }
  }

  inputUrl = cleanUrl(inputUrl);

  if (!inputUrl) {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'error: Link daxil edilməyib. Zəhmət olmasa linki yoxlayın.',
      }),
    };
  }

  const lowerUrl = inputUrl.toLowerCase();

  try {
    if (lowerUrl.includes('tiktok.com')) {
      let videoUrl = '';
      let musicUrl = '';
      let images = [];
      let title = 'TikTok Media';

      let targetUrl = inputUrl;
      if (targetUrl.includes('vm.tiktok.com') || targetUrl.includes('vt.tiktok.com') || targetUrl.includes('/t/')) {
        try {
          const res = await fetch(targetUrl, {
            method: 'HEAD',
            redirect: 'follow',
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            },
            signal: AbortSignal.timeout(3500),
          });
          if (res.url && res.url !== targetUrl) {
            targetUrl = res.url.split('?')[0];
          }
        } catch {}
      }

      try {
        const tikwmRes = await fetch('https://www.tikwm.com/api/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `url=${encodeURIComponent(targetUrl)}&hd=1`,
          signal: AbortSignal.timeout(7000),
        });
        const tikwmData = await tikwmRes.json();
        if (tikwmData?.data) {
          if (tikwmData.data.play) videoUrl = tikwmData.data.play;
          if (tikwmData.data.music) musicUrl = tikwmData.data.music;
          if (tikwmData.data.title) title = tikwmData.data.title;
          if (Array.isArray(tikwmData.data.images) && tikwmData.data.images.length > 0) {
            images = tikwmData.data.images;
          }
        }
      } catch (e) {
        console.warn('[Shortcut] TikTok TikWM error:', e.message);
      }

      if (!videoUrl && images.length === 0) {
        try {
          const data = await meganGet('/api/download/tiktok', { url: targetUrl }, 15000);
          if (!videoUrl) {
            videoUrl =
              data?.data?.videoNoWatermarkProxyUrl ||
              data?.data?.videoProxyUrl ||
              data?.data?.videoUrlNoWatermark ||
              data?.data?.videoUrl ||
              '';
          }
          if (!musicUrl && data?.data?.music) musicUrl = data.data.music;
          if (!title && data?.data?.title) title = data.data.title;
          if (images.length === 0 && Array.isArray(data?.data?.images) && data.data.images.length > 0) {
            images = data.data.images;
          }
        } catch (err) {
          console.warn('[Shortcut] TikTok Megan error:', err.message);
        }
      }

      if (!musicUrl && videoUrl) {
        musicUrl = videoUrl;
      }

      if (images.length > 0) {
        return successResponse({
          platform: 'tiktok',
          type: 'gallery',
          title,
          count: images.length,
          images,
          photos: buildPhotosDict(images),
          audio_url: musicUrl || null,
        });
      }

      if (videoUrl) {
        return successResponse({
          platform: 'tiktok',
          type: 'video',
          title,
          video_url: videoUrl,
          audio_url: musicUrl || null,
        });
      }

      throw new Error('TikTok videosu və ya şəkilləri tapılmadı.');
    }

    const isYouTube = lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be') || lowerUrl.includes('music.youtube');
    if (isYouTube) {
      const cleanYtUrl = cleanYouTubeUrl(inputUrl);

      const titlePromise = (async () => {
        try {
          const oeRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(cleanYtUrl)}&format=json`, {
            signal: AbortSignal.timeout(3500),
          });
          if (oeRes.ok) {
            const oe = await oeRes.json();
            return oe.title || '';
          }
        } catch {}
        return '';
      })();

      const videoPromise = (async () => {
        const videoEndpoints = ['/download/mp4', '/download/ytmp4', '/download/dlmp4', '/download/hd', '/download/video'];
        for (const ep of videoEndpoints) {
          try {
            const vData = await meganGet(ep, { url: cleanYtUrl }, 8000);
            const vUrl = vData?.data?.downloadUrl || vData?.data?.proxyUrl;
            if (vUrl) return { url: vUrl, title: vData.data?.title || '' };
          } catch {}
        }
        return null;
      })();

      const audioPromise = (async () => {
        const audioEndpoints = ['/download/mp3', '/download/ytmp3', '/download/dlmp3', '/download/audio', '/download/yta'];
        for (const ep of audioEndpoints) {
          try {
            const aData = await meganGet(ep, { url: cleanYtUrl }, 8000);
            const aUrl = aData?.data?.downloadUrl || aData?.data?.proxyUrl;
            if (aUrl) return { url: aUrl, title: aData.data?.title || '' };
          } catch {}
        }
        return null;
      })();

      const [oeTitle, vResult, aResult] = await Promise.all([titlePromise, videoPromise, audioPromise]);

      let videoUrl = vResult?.url || '';
      let audioUrl = aResult?.url || '';
      let title = oeTitle || vResult?.title || aResult?.title || 'YouTube Video';

      if (!audioUrl && videoUrl) audioUrl = videoUrl;
      if (!videoUrl && audioUrl) videoUrl = audioUrl;

      if (!videoUrl && !audioUrl) {
        const cobaltData = await fetchCobalt(cleanYtUrl);
        if (cobaltData?.url) {
          return successResponse({
            platform: 'youtube',
            type: 'video',
            title: title || 'YouTube Video',
            video_url: cobaltData.url,
            audio_url: cobaltData.url,
          });
        }
        throw new Error('YouTube yükləmə linkləri əldə edilə bilmədi.');
      }

      return successResponse({
        platform: 'youtube',
        type: 'video',
        title,
        video_url: videoUrl || null,
        audio_url: audioUrl || null,
      });
    }

    if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) {
      const cleanIgUrl = cleanInstagramUrl(inputUrl);
      let igData = null;
      try {
        igData = await meganGet('/api/download/instagram', { url: cleanIgUrl }, 25000);
      } catch (err) {
        console.warn('[Shortcut] Instagram Megan error:', err.message);
      }

      const d = igData?.data;
      let images = [];
      let videoUrl = '';
      let title = 'Instagram Media';

      if (d) {
        if (Array.isArray(d.images) && d.images.length > 0) {
          images = d.images.map(img => (typeof img === 'string' ? img : img.url || img.thumb)).filter(Boolean);
        } else if (Array.isArray(d.media) && d.media.length > 0) {
          const photoItems = d.media.filter(m => m.type === 'image' || !m.type?.includes('video'));
          const videoItems = d.media.filter(m => m.type === 'video');
          if (photoItems.length > 1) {
            images = photoItems.map(m => m.proxyUrl || m.url).filter(Boolean);
          } else if (videoItems.length > 0) {
            videoUrl = videoItems[0].proxyUrl || videoItems[0].url;
          } else if (photoItems.length === 1) {
            images = [photoItems[0].proxyUrl || photoItems[0].url].filter(Boolean);
          }
        }

        if (!videoUrl && (d.video || d.videoUrl || d.download)) {
          videoUrl = d.video || d.videoUrl || d.download;
        }
        if (d.title) title = d.title;
      }

      const idMatch = cleanIgUrl.match(/\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/i);
      const igId = idMatch ? idMatch[1] : '';
      let audioUrl = null;
      if (videoUrl && igId) {
        videoUrl = `https://husevndownloader.netlify.app/api/proxy?ig=${igId}`;
        audioUrl = `https://husevndownloader.netlify.app/api/proxy?ig=${igId}&audio=true`;
      }

      if (images.length === 0 && !videoUrl) {
        const cobaltData = await fetchCobalt(cleanIgUrl);
        if (cobaltData) {
          if (cobaltData.status === 'picker' && Array.isArray(cobaltData.picker)) {
            images = cobaltData.picker.map(item => item.url).filter(Boolean);
          } else if (cobaltData.url) {
            if (cobaltData.type === 'photo' || cobaltData.ext === 'jpg' || cobaltData.ext === 'png') {
              images = [cobaltData.url];
            } else {
              videoUrl = cobaltData.url;
            }
          }
        }
      }

      if (images.length > 0) {
        return successResponse({
          platform: 'instagram',
          type: 'gallery',
          title,
          count: images.length,
          images,
          photos: buildPhotosDict(images),
          audio_url: audioUrl,
        });
      }

      if (videoUrl) {
        return successResponse({
          platform: 'instagram',
          type: 'video',
          title,
          video_url: videoUrl,
          audio_url: audioUrl,
        });
      }

      throw new Error('Instagram postundan video və ya şəkil çıxarıla bilmədi.');
    }

    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch') || lowerUrl.includes('fb.com')) {
      const fbData = await meganGet('/api/download/facebook', { url: inputUrl }, 20000);
      const d = fbData?.data;
      const videoUrl = d?.hdUrl || d?.sdUrl || d?.download || d?.url;
      if (videoUrl) {
        return successResponse({
          platform: 'facebook',
          type: 'video',
          title: d?.title || 'Facebook Video',
          video_url: videoUrl,
          audio_url: null,
        });
      }
      throw new Error('Facebook videosu tapılmadı.');
    }

    const isPinterest = lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it');

    if (isPinterest) {
      const pinData = await fetchPinterest(inputUrl);
      if (pinData) {
        if (pinData.type === 'gallery' && pinData.images?.length > 0) {
          return successResponse({
            platform: 'pinterest',
            type: 'gallery',
            title: pinData.title || 'Pinterest Şəkil',
            count: pinData.images.length,
            images: pinData.images,
            audio_url: null,
          });
        }
        if (pinData.type === 'video' && pinData.video_url) {
          return successResponse({
            platform: 'pinterest',
            type: 'video',
            title: pinData.title || 'Pinterest Video',
            video_url: pinData.video_url,
            audio_url: null,
          });
        }
      }
    }

    const cobaltData = await fetchCobalt(inputUrl);
    if (cobaltData) {
      if (cobaltData.status === 'picker' && Array.isArray(cobaltData.picker)) {
        const images = cobaltData.picker.map(i => i.url).filter(Boolean);
        return successResponse({
          platform: 'pinterest',
          type: 'gallery',
          title: 'Pinterest Şəkillər',
          count: images.length,
          images,
          audio_url: null,
        });
      } else if (cobaltData.url) {
        const isPhoto = cobaltData.type === 'photo' || cobaltData.ext === 'jpg' || cobaltData.ext === 'png';
        if (isPhoto) {
          return successResponse({
            platform: 'pinterest',
            type: 'gallery',
            title: 'Pinterest Şəkil',
            count: 1,
            images: [cobaltData.url],
            audio_url: null,
          });
        } else {
          return successResponse({
            platform: 'pinterest',
            type: 'video',
            title: 'Pinterest Video',
            video_url: cobaltData.url,
            audio_url: null,
          });
        }
      }
    }

    throw new Error('Dəstəklənməyən və ya yüklənə bilməyən link: ' + (inputUrl || 'boş'));

  } catch (err) {
    console.error('[Shortcut] Error processing link:', err.message);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'error: ' + (err.message || 'Media faylları əldə edilərkən xəta baş verdi.'),
      }),
    };
  }
};

