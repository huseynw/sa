const MEGAN_BASE = 'https://apis.megan.qzz.io';
const API_KEY = process.env.MEGAN_API_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const { url, id } = JSON.parse(event.body || '{}');
  if (!url || !id) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'url and id required' }) };
  }

  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name: 'ig-cache', consistency: 'strong' });

  await store.set(id, JSON.stringify({ status: 'processing' }));

  fetch(`${MEGAN_BASE}/api/download/instagram?url=${encodeURIComponent(url)}&apikey=${API_KEY}`, {
    signal: AbortSignal.timeout(13000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
  })
    .then(res => res.json())
    .then(async (data) => {
      console.log('[ig-bg] Done, storing result for', id);
      await store.set(id, JSON.stringify({ status: 'done', data }));
    })
    .catch(async (err) => {
      console.error('[ig-bg] Error:', err.message);
      await store.set(id, JSON.stringify({ status: 'error', error: err.message }));
    });

  return { statusCode: 202, headers: CORS_HEADERS, body: JSON.stringify({ id }) };
};
