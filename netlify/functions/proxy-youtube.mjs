export default async (req, context) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const urlObj = new URL(req.url);
    const targetUrl = urlObj.searchParams.get('url');
    const filename = urlObj.searchParams.get('filename') || 'media.mp4';
    const isAudioOnly = urlObj.searchParams.get('audio') === 'true';

    if (!targetUrl) {
      return new Response("Missing URL", { status: 400 });
    }

    // Determine correct headers based on target URL
    const tUrl = new URL(targetUrl);
    let origin = 'https://www.youtube.com';
    let referer = 'https://www.youtube.com/';
    
    if (tUrl.hostname.includes('tiktok.com') || tUrl.hostname.includes('tikwm.com') || tUrl.hostname.includes('musical.ly')) {
      origin = 'https://www.tiktok.com';
      referer = 'https://www.tiktok.com/';
    } else if (tUrl.hostname.includes('instagram.com') || tUrl.hostname.includes('cdninstagram.com')) {
      origin = 'https://www.instagram.com';
      referer = 'https://www.instagram.com/';
    } else if (tUrl.hostname.includes('facebook.com') || tUrl.hostname.includes('fbcdn.net')) {
      origin = 'https://www.facebook.com';
      referer = 'https://www.facebook.com/';
    } else if (tUrl.hostname.includes('invidious') || tUrl.hostname.includes('inv.') || 
               tUrl.hostname.includes('yt.') || tUrl.hostname.includes('vid.') ||
               tUrl.hostname.includes('y.com.sb') || tUrl.hostname.includes('thepixora')) {
      origin = 'https://www.youtube.com';
      referer = 'https://www.youtube.com/';
    }

    // Fetch the media from CDN
    const mediaResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Origin': origin,
        'Referer': referer,
      }
    });

    if (!mediaResponse.ok) {
      return new Response(`CDN Error: ${mediaResponse.status}`, { status: mediaResponse.status });
    }

    let contentType = isAudioOnly ? 'audio/mpeg' : (mediaResponse.headers.get('content-type') || 'video/mp4');
    if (filename.toLowerCase().endsWith('.mp3')) contentType = 'audio/mpeg';
    else if (filename.toLowerCase().endsWith('.mp4')) contentType = 'video/mp4';

    const contentLength = mediaResponse.headers.get('content-length');
    const cleanAsciiName = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    const encodedName = encodeURIComponent(filename);

    // Pipe the response back to client with forced attachment download & CORS headers
    const responseHeaders = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${cleanAsciiName}"; filename*=UTF-8''${encodedName}`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };
    if (contentLength) responseHeaders['Content-Length'] = contentLength;

    return new Response(mediaResponse.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(`Proxy Error: ${error.message}`, { status: 500 });
  }
};
