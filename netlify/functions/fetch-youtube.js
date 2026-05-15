const youtubedl = require('youtube-dl-exec');

export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { url, isAudioOnly } = JSON.parse(event.body);

    if (!url) {
      return { statusCode: 400, body: JSON.stringify({ error: "URL is required" }) };
    }

    // Use yt-dlp to extract the video info, bypasses broken decipher in play-dl
    const info = await youtubedl(url, {
      dumpJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: [
        'referer:youtube.com',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      ]
    });

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
      // Fallback: Best muxed format (audio + video, usually 360p or 720p mp4)
      const muxedFormats = info.formats.filter(f => f.acodec !== 'none' && f.vcodec !== 'none' && f.ext === 'mp4');
      // Sort by height descending
      targetFormat = muxedFormats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    }

    if (!targetFormat || !targetFormat.url) {
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
