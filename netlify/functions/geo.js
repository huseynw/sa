const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (req, context) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let countryCode = context?.geo?.country?.code || null;

  if (!countryCode && req?.headers) {
    countryCode =
      req.headers.get('x-country') ||
      req.headers.get('x-nf-country-code') ||
      req.headers.get('cf-ipcountry') ||
      null;
  }

  return new Response(
    JSON.stringify({
      country: countryCode ? countryCode.toUpperCase() : null,
      city: context?.geo?.city || null,
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
};

export const config = { path: '/api/geo' };

