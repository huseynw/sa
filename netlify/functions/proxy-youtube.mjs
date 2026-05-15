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
    
    if (tUrl.hostname.includes('tiktok.com') || tUrl.hostname.includes('tikwm.com')) {
      origin = 'https://www.tiktok.com';
      referer = 'https://www.tiktok.com/';
    } else if (tUrl.hostname.includes('instagram.com')) {
      origin = 'https://www.instagram.com';
      referer = 'https://www.instagram.com/';
    } else if (tUrl.hostname.includes('invidious') || tUrl.hostname.includes('inv.') || 
               tUrl.hostname.includes('yt.') || tUrl.hostname.includes('vid.') ||
               tUrl.hostname.includes('y.com.sb') || tUrl.hostname.includes('thepixora')) {
      // Invidious proxy — use YouTube as referer so it fetches correctly
      origin = 'https://www.youtube.com';
      referer = 'https://www.youtube.com/';
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
    const contentLength = ytResponse.headers.get('content-length');

    // Pipe the response back to the client
    const responseHeaders = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*',
    };
    if (contentLength) responseHeaders['Content-Length'] = contentLength;

    return new Response(ytResponse.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(`Proxy Error: ${error.message}`, { status: 500 });
  }
};
