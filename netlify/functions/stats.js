import { getStore } from '@netlify/blobs';

const STORE_NAME = 'site-stats';
const STATS_KEY  = 'stats';

const DEFAULT_STATS = {
  totalVisits: 0,
  totalDownloads: 0,
  platformDownloads: {
    youtube: 0,
    tiktok: 0,
    instagram: 0,
    pinterest: 0,
    facebook: 0,
  },
  lastUpdated: new Date().toISOString(),
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (req, context) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });

    // ── GET: Return current stats ──
    if (req.method === 'GET') {
      const raw = await store.get(STATS_KEY, { type: 'json' });
      const stats = raw || DEFAULT_STATS;
      return new Response(JSON.stringify(stats), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── POST: Increment a counter ──
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const { action, platform } = body;

      // Read current stats (with retry logic)
      let stats = (await store.get(STATS_KEY, { type: 'json' })) || { ...DEFAULT_STATS };

      if (action === 'visit') {
        stats.totalVisits = (stats.totalVisits || 0) + 1;
      } else if (action === 'download' && platform) {
        stats.totalDownloads = (stats.totalDownloads || 0) + 1;
        stats.platformDownloads = stats.platformDownloads || {};
        stats.platformDownloads[platform] = (stats.platformDownloads[platform] || 0) + 1;
      }

      stats.lastUpdated = new Date().toISOString();
      await store.setJSON(STATS_KEY, stats);

      return new Response(JSON.stringify(stats), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  } catch (err) {
    console.error('[stats]', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/stats' };
