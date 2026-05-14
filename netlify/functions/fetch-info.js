export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body);
    const { url, isAudioOnly, quality } = body;

    if (!url) {
      return { statusCode: 400, body: JSON.stringify({ error: "URL is required" }) };
    }

    // Istifadəçinin Netlify-da təyin etdiyi şəxsi Cobalt API URL-i və (əgər varsa) API Tokeni
    const cobaltUrl = process.env.COBALT_API_URL;
    const cobaltToken = process.env.COBALT_API_KEY;

    if (!cobaltUrl) {
      return { 
        statusCode: 500, 
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "COBALT_API_URL environment variable is not set. Please deploy your Cobalt instance and set the URL in Netlify settings." }) 
      };
    }

    const cobaltPayload = {
      url: url,
      videoQuality: quality === "max" ? "max" : (quality || "1080"),
      filenameStyle: "nerdy",
      alwaysProxy: true
    };

    if (isAudioOnly) {
      cobaltPayload.downloadMode = "audio";
      cobaltPayload.audioFormat = "mp3";
    }

    const headers = {
      "Accept": "application/json",
      "Content-Type": "application/json",
    };

    // Əgər istifadəçi öz serverinə şifrə (Auth) qoyubsa, onu da göndəririk
    if (cobaltToken) {
      headers["Authorization"] = `Api-Key ${cobaltToken}`;
    }

    const response = await fetch(cobaltUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(cobaltPayload)
    });

    if (!response.ok) {
      const errData = await response.text();
      throw new Error(`API Error: ${response.status} - ${errData}`);
    }

    const data = await response.json();

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
      body: JSON.stringify({ error: "Failed to fetch information. Ensure your self-hosted Cobalt instance is running correctly." })
    };
  }
};
