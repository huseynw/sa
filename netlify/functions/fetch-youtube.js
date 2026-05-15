const { create } = require('youtube-dl-exec');
const path = require('path');
const os = require('os');
const fs = require('fs');

// In Netlify Lambda, files live under LAMBDA_TASK_ROOT (usually /var/task)
const taskRoot = process.env.LAMBDA_TASK_ROOT || process.cwd();
const isWindows = os.platform() === 'win32';
const binName = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const binPath = path.join(taskRoot, 'node_modules', 'youtube-dl-exec', 'bin', binName);

const youtubedl = create(binPath);

// Large pool of Invidious instances — tried in PARALLEL to avoid Lambda timeout
const INVIDIOUS_INSTANCES = [
  'https://inv.thepixora.com',
  'https://invidious.adminforge.de',
  'https://invidious.fdn.fr',
  'https://iv.datura.network',
  'https://invidious.privacydev.net',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.artemislena.eu',
  'https://invidious.flokinet.to',
  'https://inv.clip.bike',
  'https://inv.vern.cc',
  'https://invidious.lunar.icu',
  'https://yt.cdaut.de',
  'https://invidious.tiekoetter.com',
  'https://invidious.asir.dev',
  'https://invidious.protokolla.fi',
  'https://invidious.perennialte.ch',
  'https://invidious.reallyaweso.me',
  'https://vid.puffyan.us',
  'https://y.com.sb',
];

async function fetchFromInvidious(videoId) {
  // Try ALL instances in parallel with a 5s timeout each — return first success
  const tryInstance = async (base) => {
    const res = await fetch(
      `${base}/api/v1/videos/${videoId}?fields=title,formatStreams,adaptiveFormats`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.title) throw new Error('no title in response');
    return { data, base };
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let failures = 0;
    const total = INVIDIOUS_INSTANCES.length;

    INVIDIOUS_INSTANCES.forEach(base => {
      tryInstance(base).then(result => {
        if (!settled) { settled = true; resolve(result); }
      }).catch(() => {
        failures++;
        if (failures === total && !settled) {
          reject(new Error('Bütün Invidious serverləri cavab vermədi.'));
        }
      });
    });
  });
}


function extractVideoId(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : null;
}

export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { url, isAudioOnly } = JSON.parse(event.body);

    if (!url) {
      return { statusCode: 400, body: JSON.stringify({ error: "URL is required" }) };
    }

    // --- TIKTOK LOGIC (tikwm.com API) ---
    if (url.includes('tiktok.com')) {
      const params = new URLSearchParams({ url });
      const tikwmRes = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: params.toString()
      });
      const tikwmData = await tikwmRes.json();

      if (tikwmData.code !== 0 || !tikwmData.data) {
        throw new Error('TikTok mediası tapılmadı və ya keçid yanlışdır.');
      }

      const videoTitle = tikwmData.data.title || 'tiktok_video';
      const safeName = videoTitle.replace(/[^\w\s-]/g, '').trim().substring(0, 60) || 'tiktok_video';
      let finalUrl, ext;

      if (isAudioOnly) {
        finalUrl = tikwmData.data.music || tikwmData.data.play;
        ext = 'mp3';
      } else if (tikwmData.data.images && tikwmData.data.images.length > 0) {
        finalUrl = tikwmData.data.images[0];
        ext = 'jpeg';
      } else {
        finalUrl = tikwmData.data.play || tikwmData.data.wmplay;
        ext = 'mp4';
      }

      const filename = isAudioOnly
        ? `HUSEVN DOWNLOADER - ${safeName}.mp3`
        : `HUSEVN DOWNLOADER - ${safeName}.${ext}`;
      const proxyUrl = `/.netlify/functions/proxy-youtube?url=${encodeURIComponent(finalUrl)}&filename=${encodeURIComponent(filename)}&audio=${isAudioOnly}`;

      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ title: videoTitle, url: proxyUrl, ext, status: 'redirect' }),
      };
    }

    // --- YOUTUBE LOGIC (Invidious proxy — no IP-lock!) ---
    const videoId = extractVideoId(url);
    if (!videoId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Yanlış YouTube URL-i' }) };
    }

    const { data, base: invBase } = await fetchFromInvidious(videoId);
    console.log('[fetch-youtube] Using Invidious:', invBase, 'for', videoId);

    const videoTitle = data.title || 'video';
    const safeName = videoTitle.replace(/[^\w\s-]/g, '').trim().substring(0, 60) || 'youtube_video';

    let streamUrl, ext;

    if (isAudioOnly) {
      // Prefer m4a audio adaptive format
      const audioFmt = (data.adaptiveFormats || []).find(f => f.type?.includes('audio/mp4'))
        || (data.adaptiveFormats || []).find(f => f.type?.includes('audio'));
      if (!audioFmt) throw new Error('Audio format tapılmadı');
      const qs = new URL(audioFmt.url).search;
      streamUrl = `${invBase}/videoplayback${qs}`;
      ext = 'm4a';
    } else {
      // Use muxed 360p stream (formatStreams) — has both video+audio, no merging needed
      const muxedFmt = (data.formatStreams || []).find(f => f.itag === '18')
        || data.formatStreams?.[0];
      if (!muxedFmt) throw new Error('Video format tapılmadı');
      const qs = new URL(muxedFmt.url).search;
      streamUrl = `${invBase}/videoplayback${qs}`;
      ext = 'mp4';
    }

    const filename = isAudioOnly
      ? `HUSEVN DOWNLOADER - ${safeName}.m4a`
      : `HUSEVN DOWNLOADER - ${safeName}.mp4`;

    // Invidious proxy URLs are NOT IP-locked — proxy through our server for clean filename download
    const proxyUrl = `/.netlify/functions/proxy-youtube?url=${encodeURIComponent(streamUrl)}&filename=${encodeURIComponent(filename)}&audio=${isAudioOnly}`;

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        title: videoTitle,
        url: proxyUrl,
        ext: isAudioOnly ? 'm4a' : 'mp4',
        status: 'redirect',
      }),
    };
  } catch (error) {
    console.error('YouTube Fetch Error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'YouTube yükləmə xətası', details: error.message }),
    };
  }
};
