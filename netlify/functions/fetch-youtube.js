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

// Invidious instances to try in order (they proxy YouTube streams through their own servers, NO IP-lock issues)
const INVIDIOUS_INSTANCES = [
  'https://inv.thepixora.com',
  'https://invidious.adminforge.de',
  'https://invidious.fdn.fr',
];

function extractVideoId(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : null;
}

async function fetchFromInvidious(videoId) {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(
        `${base}/api/v1/videos/${videoId}?fields=title,author,formatStreams,adaptiveFormats`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (data.title) return { data, base };
    } catch (e) {
      console.warn(`[fetch-youtube] Invidious instance failed: ${base}`, e.message);
    }
  }
  throw new Error('Bütün Invidious serverləri cavab vermədi.');
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
