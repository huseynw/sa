export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  const DEFAULT_QUALITIES = [144, 240, 360, 480, 720, 1080, 1440, 2160];

  try {
    const { url } = JSON.parse(event.body || '{}');
    if (!url) {
      return { statusCode: 200, headers, body: JSON.stringify({ qualities: DEFAULT_QUALITIES, fallback: true }) };
    }

    const match = url.match(
      /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (!match) {
      return { statusCode: 200, headers, body: JSON.stringify({ qualities: DEFAULT_QUALITIES, fallback: true }) };
    }

    const videoId = match[1];

    const instances = [
      'https://inv.nadeko.net',
      'https://invidious.privacyredirect.com',
      'https://yt.cdaut.de',
      'https://invidious.nerdvpn.de',
    ];

    for (const instance of instances) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const resp = await fetch(
          `${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);

        if (!resp.ok) continue;
        const data = await resp.json();

        const qualitySet = new Set();
        const rawStreams = {};

        (data.formatStreams || []).forEach(f => {
          const m = (f.qualityLabel || '').match(/(\d+)/);
          if (m) qualitySet.add(parseInt(m[1]));
        });

        (data.adaptiveFormats || []).forEach(f => {
          if ((f.type || '').startsWith('video/')) {
            const m = (f.qualityLabel || '').match(/(\d+)/);
            if (m) {
              const q = parseInt(m[1]);
              qualitySet.add(q);
              if (!rawStreams[q]) rawStreams[q] = {};
              if (f.type.includes('mp4')) rawStreams[q].mp4 = f.url;
              if (f.type.includes('webm')) rawStreams[q].webm = f.url;
            }
          }
        });

        const qualities = [...qualitySet]
          .filter(q => DEFAULT_QUALITIES.includes(q))
          .sort((a, b) => a - b);

        if (qualities.length > 0) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ qualities, videoId, rawStreams }),
          };
        }
      } catch {
        continue;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ qualities: DEFAULT_QUALITIES, fallback: true, rawStreams: {} }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ qualities: DEFAULT_QUALITIES, fallback: true, rawStreams: {} }),
    };
  }
};
