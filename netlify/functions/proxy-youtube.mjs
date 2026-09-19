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
    const igId = urlObj.searchParams.get('ig');
    let targetUrl = urlObj.searchParams.get('url');
    let filename = urlObj.searchParams.get('filename') || 'media.mp4';
    const isAudioOnly = urlObj.searchParams.get('audio') === 'true';

    if (igId) {
      if (!urlObj.searchParams.has('filename')) {
        filename = isAudioOnly ? `instagram_${igId}.mp3` : `instagram_${igId}.mp4`;
      }
      const apiKey = process.env.MEGAN_API_KEY;
      const meganUrl = `https://apis.megan.qzz.io/api/download/instagram?url=https://www.instagram.com/p/${encodeURIComponent(igId)}/&apikey=${apiKey}`;
      const meganRes = await fetch(meganUrl, {
        signal: AbortSignal.timeout(20000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        }
      });
      if (meganRes.ok) {
        const meganData = await meganRes.json();
        const d = meganData?.data;
        if (isAudioOnly && (d?.audio || d?.music)) {
          targetUrl = d.audio || d.music;
        } else {
          if (d?.media) {
            const v = d.media.find(m => m.type === 'video');
            if (v) targetUrl = v.proxyUrl || v.url;
          }
          if (!targetUrl) targetUrl = d?.video || d?.videoUrl || d?.download;
          if (!targetUrl && d?.images?.[0]) targetUrl = d.images[0];
        }
      }
    }

    if (!targetUrl) {
      return new Response("Missing URL", { status: 400 });
    }

    const tUrl = new URL(targetUrl);
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    };
    
    if (tUrl.hostname.includes('tiktok.com') || tUrl.hostname.includes('tikwm.com') || tUrl.hostname.includes('musical.ly')) {
      reqHeaders['Origin'] = 'https://www.tiktok.com';
      reqHeaders['Referer'] = 'https://www.tiktok.com/';
    } else if (tUrl.hostname.includes('cdninstagram.com')) {
      reqHeaders['Origin'] = 'https://www.instagram.com';
      reqHeaders['Referer'] = 'https://www.instagram.com/';
    } else if (tUrl.hostname.includes('pinimg.com') || tUrl.hostname.includes('pinterest.com')) {
      reqHeaders['Referer'] = 'https://www.pinterest.com/';
      reqHeaders['Origin'] = 'https://www.pinterest.com';
    } else if (tUrl.hostname.includes('facebook.com') || tUrl.hostname.includes('fbcdn.net')) {
      reqHeaders['Origin'] = 'https://www.facebook.com';
      reqHeaders['Referer'] = 'https://www.facebook.com/';
    } else if (tUrl.hostname.includes('invidious') || tUrl.hostname.includes('inv.') || 
               tUrl.hostname.includes('yt.') || tUrl.hostname.includes('vid.') ||
               tUrl.hostname.includes('y.com.sb') || tUrl.hostname.includes('thepixora')) {
      reqHeaders['Origin'] = 'https://www.youtube.com';
      reqHeaders['Referer'] = 'https://www.youtube.com/';
    }

    const mediaResponse = await fetch(targetUrl, {
      headers: reqHeaders,
    });

    if (!mediaResponse.ok) {
      return new Response(`CDN Error: ${mediaResponse.status}`, { status: mediaResponse.status });
    }

    let contentType = isAudioOnly ? 'audio/mpeg' : (mediaResponse.headers.get('content-type') || 'video/mp4');
    const lowerName = filename.toLowerCase();
    if (lowerName.endsWith('.mp3')) contentType = 'audio/mpeg';
    else if (lowerName.endsWith('.mp4')) contentType = 'video/mp4';
    else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (lowerName.endsWith('.png')) contentType = 'image/png';
    else if (lowerName.endsWith('.webp')) contentType = 'image/webp';

    const contentLength = mediaResponse.headers.get('content-length');
    const cleanAsciiName = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    const encodedName = encodeURIComponent(filename);

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
