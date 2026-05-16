// Proxy for the loader.to / savenow.to API to bypass CORS restrictions.
// The browser cannot call p.savenow.to directly because it lacks CORS headers.
// This function runs server-side on Netlify, which has no CORS restrictions.

const DOMAINS = ['p.savenow.to', 'p.lbserver.xyz'];
const API_KEY = 'dfcb6d76f2f6a9894gjkege8a4ab232222';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { action, url, format, jobId } = body;

    // Spoof Referer/Origin so the API thinks the request comes from loader.to itself
    const spoofedHeaders = {
      'Referer': 'https://loader.to/',
      'Origin': 'https://loader.to',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
    };

    if (action === 'start') {
      // Step 1: start conversion job
      if (!url || !format) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'url and format required' }) };
      }

      let lastErr = null;
      for (const domain of DOMAINS) {
        try {
          const apiUrl = `https://${domain}/ajax/download.php?format=${encodeURIComponent(format)}&url=${encodeURIComponent(url)}&api=${API_KEY}`;
          const res = await fetch(apiUrl, {
            headers: spoofedHeaders,
            signal: AbortSignal.timeout(10000)
          });
          const text = await res.text();
          console.log(`[yt-loader] ${domain} start response (${res.status}):`, text.substring(0, 200));
          const data = JSON.parse(text);
          if (data.success) {
            return {
              statusCode: 200,
              headers: CORS_HEADERS,
              body: JSON.stringify({ ...data, domain }),
            };
          }
          lastErr = new Error(data.text || data.message || `API failure: ${text}`);
        } catch (err) {
          console.warn(`[yt-loader] Domain ${domain} failed:`, err.message);
          lastErr = err;
        }
      }
      throw lastErr || new Error('All domains failed');

    } else if (action === 'progress') {
      // Step 2: poll progress
      const { domain } = body;
      if (!jobId || !domain) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'jobId and domain required' }) };
      }
      const res = await fetch(`https://${domain}/ajax/progress.php?id=${jobId}`, {
        headers: spoofedHeaders,
        signal: AbortSignal.timeout(10000)
      });
      const data = await res.json();
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(data),
      };

    } else {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid action' }) };
    }

  } catch (error) {
    console.error('[yt-loader] Error:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message || 'Server error' }),
    };
  }
};
