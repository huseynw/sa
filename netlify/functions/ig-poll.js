const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const id = event.queryStringParameters?.id;
  if (!id) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'id required' }) };
  }

  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'ig-cache', consistency: 'strong' });
    const raw = await store.get(id, { type: 'text' });

    if (!raw) {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ status: 'processing' }) };
    }

    const result = JSON.parse(raw);

    if (result.status === 'done' || result.status === 'error') {
      await store.delete(id);
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) };
  } catch (err) {
    console.error('[ig-poll] Error:', err.message);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
