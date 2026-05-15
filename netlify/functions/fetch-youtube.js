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
      // Find best audio-only format
      if (data.audios && data.audios.items && data.audios.items.length > 0) {
        targetFormat = data.audios.items[0]; // Usually highest quality m4a/mp3 is first
      }
    } else {
      // Find best muxed video format (usually 360p/720p mp4)
      if (data.videos && data.videos.items && data.videos.items.length > 0) {
        // Sort by height descending to get best quality (up to 720p usually for muxed)
        const videos = data.videos.items.filter(v => v.hasAudio === true);
        if (videos.length > 0) {
          targetFormat = videos.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
        } else {
          // If no video with audio, just take the first video
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
