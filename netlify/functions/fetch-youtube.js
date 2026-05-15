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

export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { url, isAudioOnly } = JSON.parse(event.body);

    if (!url) {
      return { statusCode: 400, body: JSON.stringify({ error: "URL is required" }) };
    }

    const ytOptions = {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      forceIpv4: true, // Force IPv4 (YouTube often blocks IPv6 from AWS datacenters)
      ignoreNoFormatsError: true, // Output JSON even if no formats are found
      addHeader: [
        'referer:youtube.com',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      ]
    };

    // yt-dlp tries to write back to the cookies file on exit.
    // In Netlify Lambda, /var/task is read-only, so we must copy cookies.txt to /tmp first.
    const localCookiesPath = path.join(taskRoot, 'cookies.txt');
    const tmpCookiesPath = path.join(os.tmpdir(), 'youtube_cookies.txt');

    if (fs.existsSync(localCookiesPath)) {
      fs.copyFileSync(localCookiesPath, tmpCookiesPath);
      ytOptions.cookies = tmpCookiesPath;
      console.log('[fetch-youtube] Using local cookies.txt file copied to /tmp');
    } 
    // Fallback to YOUTUBE_COOKIES environment variable
    else if (process.env.YOUTUBE_COOKIES) {
      fs.writeFileSync(tmpCookiesPath, process.env.YOUTUBE_COOKIES);
      ytOptions.cookies = tmpCookiesPath;
      console.log('[fetch-youtube] Using cookies from YOUTUBE_COOKIES env var');
    }

    // Use yt-dlp to extract the video info, bypasses broken decipher in play-dl
    const info = await youtubedl(url, ytOptions);

    if (!info || !info.formats || info.formats.length === 0) {
      throw new Error("YouTube URL-ləri tapılmadı.");
    }

    let targetFormat;

    if (isAudioOnly) {
      // Find best audio-only format (usually m4a)
      const audioFormats = info.formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');
      targetFormat = audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
    }

    if (!targetFormat) {
      // Fallback: Best muxed format (audio + video)
      // Allow any extension (webm or mp4) as long as it has both audio and video
      const muxedFormats = info.formats.filter(f => f.acodec !== 'none' && f.vcodec !== 'none' && f.acodec && f.vcodec);
      targetFormat = muxedFormats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    }

    if (!targetFormat || !targetFormat.url) {
      console.error("[fetch-youtube] Available formats:", info.formats.map(f => ({ id: f.format_id, ext: f.ext, ac: f.acodec, vc: f.vcodec })));
      throw new Error("Uyğun format tapılmadı");
    }

    const videoTitle = info.title || 'video';
    const safeName = videoTitle.replace(/[^\w\s-]/g, '').trim().substring(0, 60) || 'youtube_video';
    const ext = targetFormat.ext || 'mp4';
    const filename = isAudioOnly ? `HUSEVN DOWNLOADER - ${safeName}.mp3` : `HUSEVN DOWNLOADER - ${safeName}.${ext}`;

    // Return a URL to our Netlify proxy which will stream it from the server's IP.
    const proxyUrl = `/.netlify/functions/proxy-youtube?url=${encodeURIComponent(targetFormat.url)}&filename=${encodeURIComponent(filename)}&audio=${isAudioOnly}`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        url: proxyUrl,
        ext: isAudioOnly ? 'mp3' : ext,
        status: "redirect"
      })
    };
  } catch (error) {
    console.error("YouTube Fetch Error:", error);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "YouTube yükləmə xətası", details: error.message })
    };
  }
};
