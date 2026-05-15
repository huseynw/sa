const { create } = require('youtube-dl-exec');
const path = require('path');
const os = require('os');
const fs = require('fs');

// In Netlify Lambda, files live under LAMBDA_TASK_ROOT (usually /var/task)
// On local dev (Windows/Linux), fall back to process.cwd()
const taskRoot = process.env.LAMBDA_TASK_ROOT || process.cwd();
const isWindows = os.platform() === 'win32';
const binName = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const binPath = path.join(taskRoot, 'node_modules', 'youtube-dl-exec', 'bin', binName);

console.log('[fetch-youtube] Platform:', os.platform());
console.log('[fetch-youtube] Binary path:', binPath);
console.log('[fetch-youtube] Binary exists:', fs.existsSync(binPath));

const youtubedl = create(binPath);

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

    // --- TIKTOK LOGIC (tikwm.com) ---
    if (url.includes('tiktok.com')) {
      const tikwmUrl = 'https://www.tikwm.com/api/';
      const params = new URLSearchParams({ url: url });
      
      const tikwmRes = await fetch(tikwmUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: params.toString()
      });

      const tikwmData = await tikwmRes.json();
      
      if (tikwmData.code !== 0 || !tikwmData.data) {
        throw new Error("TikTok mediası tapılmadı və ya keçid yanlışdır.");
      }
      
      const videoTitle = tikwmData.data.title || 'tiktok_video';
      const safeName = videoTitle.replace(/[^\w\s-]/g, '').trim().substring(0, 60) || 'tiktok_video';
      
      let finalUrl;
      let ext;

      if (isAudioOnly) {
        finalUrl = tikwmData.data.music || tikwmData.data.play;
        ext = 'mp3';
      } else {
        if (tikwmData.data.images && tikwmData.data.images.length > 0) {
          // Photo gallery fallback: return the first photo
          finalUrl = tikwmData.data.images[0];
          ext = 'jpeg';
        } else {
          // Normal Video
          finalUrl = tikwmData.data.play || tikwmData.data.wmplay;
          ext = 'mp4';
        }
      }

      // We CAN proxy tikwm links because they are not IP-locked!
      // This allows automatic download (XHR) instead of opening a new tab.
      const filename = isAudioOnly ? `HUSEVN DOWNLOADER - ${safeName}.mp3` : `HUSEVN DOWNLOADER - ${safeName}.${ext}`;
      const proxyUrl = `/.netlify/functions/proxy-youtube?url=${encodeURIComponent(finalUrl)}&filename=${encodeURIComponent(filename)}&audio=${isAudioOnly}`;

      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          title: videoTitle,
          url: proxyUrl,
          ext: ext,
          status: "redirect"
        }),
      };
    }

    // --- YOUTUBE LOGIC (RapidAPI) ---
    const videoId = extractVideoId(url);
    if (!videoId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid YouTube URL" }) };
    }

    const rapidApiKey = 'a9ff2b62a4mshc8b12f8b231650cp1f14f0jsn0a4f00cf5776';
    const res = await fetch(`https://youtube-media-downloader.p.rapidapi.com/v2/video/details?videoId=${videoId}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'youtube-media-downloader.p.rapidapi.com',
        'x-rapidapi-key': rapidApiKey
      }
    });

    if (!res.ok) {
      throw new Error(`RapidAPI Error: ${res.statusText}`);
    }

    const data = await res.json();
    let targetFormat;

    if (isAudioOnly) {
      if (data.audios && data.audios.items && data.audios.items.length > 0) {
        targetFormat = data.audios.items[0]; 
      }
    } else {
      if (data.videos && data.videos.items && data.videos.items.length > 0) {
        const videos = data.videos.items.filter(v => v.hasAudio === true);
        if (videos.length > 0) {
          targetFormat = videos.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
        } else {
          targetFormat = data.videos.items[0];
        }
      }
    }

    if (!targetFormat || !targetFormat.url) {
      throw new Error("Uyğun format tapılmadı");
    }

    const videoTitle = data.title || 'video';
    const safeName = videoTitle.replace(/[^\w\s-]/g, '').trim().substring(0, 60) || 'youtube_video';
    const ext = targetFormat.extension || 'mp4';
    const filename = isAudioOnly ? `HUSEVN DOWNLOADER - ${safeName}.mp3` : `HUSEVN DOWNLOADER - ${safeName}.${ext}`;

    // Return a URL to our Netlify proxy which will stream it from the server's IP.
    const proxyUrl = `/.netlify/functions/proxy-youtube?url=${encodeURIComponent(targetFormat.url)}&filename=${encodeURIComponent(filename)}&audio=${isAudioOnly}`;

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        title: videoTitle,
        url: proxyUrl,
        format: targetFormat.quality || null,
        ext: ext,
        filesize: targetFormat.size || null,
        status: "redirect"
      }),
    };
  } catch (error) {
    console.error("YouTube Fetch Error:", error);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "YouTube yükləmə xətası",
        details: error.message,
      }),
    };
  }
};
