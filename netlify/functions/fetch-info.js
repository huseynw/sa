export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body);
    const { url, isAudioOnly, quality, isMuted } = body;

    if (!url) {
      return { statusCode: 400, body: JSON.stringify({ error: "URL is required" }) };
    }

    const cobaltUrl = process.env.COBALT_API_URL;
    const cobaltToken = process.env.COBALT_API_KEY;

    if (!cobaltUrl) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "COBALT_API_URL environment variable is not set." })
      };
    }

    const cobaltPayload = {
      url: url,
      videoQuality: quality === "max" ? "max" : (quality || "max"),
      filenameStyle: "nerdy",
      alwaysProxy: true
    };

    if (isMuted) {
      cobaltPayload.downloadMode = "mute";
    } else if (isAudioOnly) {
      cobaltPayload.downloadMode = "audio";
      cobaltPayload.audioFormat = "mp3";
    }

    let cobaltUrls = [ process.env.COBALT_API_URL ];
    
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    if (isYouTube) {
      // Public Cobalt instance pool to bypass IP bans on the self-hosted instance
      cobaltUrls = [
        'https://cobalt.qiaxi.macplus.net',
        'https://cobalt-api.peuk.dev',
        'https://api.cobalt.best',
        'https://cobalt.kwiatechu.com',
        'https://co.purrdo.dev',
        'https://cobalt.starnw.net',
        'https://c.benni.dev',
        'https://cobalt.10101000.xyz',
        'https://cobalt.canine.ly',
        'https://cobalt.zackmyers.io',
        'https://cobalt.timkurvers.com',
        process.env.COBALT_API_URL // last resort
      ].filter(Boolean);
    }

    let lastError = null;
    let data = null;

    for (const targetUrl of cobaltUrls) {
      try {
        const reqHeaders = {
          "Accept": "application/json",
          "Content-Type": "application/json",
        };

        // Only send the API key to the user's self-hosted instance
        if (targetUrl === process.env.COBALT_API_URL && cobaltToken) {
          reqHeaders["Authorization"] = `Api-Key ${cobaltToken}`;
        }

        const response = await fetch(targetUrl, {
          method: "POST",
          headers: reqHeaders,
          body: JSON.stringify(cobaltPayload),
          signal: AbortSignal.timeout(7000) // 7s timeout per instance
        });

        if (!response.ok) {
          const errData = await response.text();
          throw new Error(`API Error: ${response.status} - ${errData}`);
        }

        const respData = await response.json();
        
        if (respData.status === 'error') {
          throw new Error(respData.text || respData.error?.code || 'Unknown API Error');
        }

        data = respData;
        console.log(`[Cobalt] Success using instance: ${targetUrl}`);
        break; // Success
      } catch (err) {
        console.warn(`[Cobalt] Failed for ${targetUrl}: ${err.message}`);
        lastError = err;
        continue;
      }
    }

    if (!data) {
      throw lastError || new Error("Bütün Cobalt serverləri xəta verdi.");
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error("Error fetching info:", error);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Failed to fetch information." })
    };
  }
};
