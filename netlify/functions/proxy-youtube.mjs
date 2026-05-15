export default async (req, context) => {
  try {
    const urlObj = new URL(req.url);
    const targetUrl = urlObj.searchParams.get('url');
    const filename = urlObj.searchParams.get('filename') || 'video.mp4';
    const isAudioOnly = urlObj.searchParams.get('audio') === 'true';

    if (!targetUrl) {
      return new Response("Missing URL", { status: 400 });
    }

    // Determine correct headers based on target URL
    const tUrl = new URL(targetUrl);
    let origin = 'https://www.youtube.com';
    let referer = 'https://www.youtube.com/';
    
    if (tUrl.hostname.includes('tiktok.com')) {
      origin = 'https://www.tiktok.com';
      referer = 'https://www.tiktok.com/';
    } else if (tUrl.hostname.includes('instagram.com')) {
      origin = 'https://www.instagram.com';
      referer = 'https://www.instagram.com/';
    }

    // Fetch the media from CDN
    const ytResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Origin': origin,
        'Referer': referer,
      }
    });

    if (!ytResponse.ok) {
      return new Response(`CDN Error: ${ytResponse.status}`, { status: ytResponse.status });
    }

    const contentType = isAudioOnly ? 'audio/mpeg' : 'video/mp4';

    // Pipe the response back to the client
    return new Response(ytResponse.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    return new Response(`Proxy Error: ${error.message}`, { status: 500 });
  }
};
