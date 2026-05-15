export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { url } = JSON.parse(event.body);
    if (!url) return { statusCode: 400, body: JSON.stringify({ error: "URL is required" }) };

    let title = 'Video / Media';
    let image = null;
    let description = '';

    const lowerUrl = url.toLowerCase();

    // 1. YouTube oEmbed
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (res.ok) {
        const data = await res.json();
        title = data.title;
        image = data.thumbnail_url;
      }
    } 
    // 2. TikTok oEmbed
    else if (lowerUrl.includes('tiktok.com')) {
      const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        title = data.title;
        image = data.thumbnail_url;
      }
    }
    // 3. Fallback to Microlink (Instagram, Pinterest, Facebook)
    else {
      const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && data.data) {
          title = data.data.title || title;
          image = data.data.image?.url || null;
          description = data.data.description || '';
        }
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ title, image, description })
    };
  } catch (error) {
    console.error("Error fetching metadata:", error);
    return {
      statusCode: 200, 
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ title: 'Media File', image: null, description: '' })
    };
  }
};
