async function fetchPinterest(inputUrl) {
  try {
    let finalUrl = inputUrl;
    let pinId = null;

    try {
      const headRes = await fetch(inputUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(6000),
      });
      finalUrl = headRes.url;
    } catch {}

    const idMatch = finalUrl.match(/\/pin\/(\d+)/i) || inputUrl.match(/\/pin\/(\d+)/i);
    if (idMatch) pinId = idMatch[1];

    let title = 'Pinterest Photo';
    const images = [];
    let videoUrl = null;

    if (pinId) {
      try {
        const apiUrl = `https://www.pinterest.com/resource/PinResource/get/?data=${encodeURIComponent(JSON.stringify({ options: { id: pinId } }))}`;
        const apiRes = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'X-Pinterest-PWS-Handler': 'www/[username].js',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (apiRes.ok) {
          const json = await apiRes.json();
          const pinData = json?.resource_response?.data;
          if (pinData) {
            title = pinData.title || pinData.grid_title || pinData.seo_title || title;
            if (pinData.carousel_data?.carousel_slots) {
              for (const slot of pinData.carousel_data.carousel_slots) {
                const imgUrl = slot.images?.orig?.url || slot.images?.['736x']?.url || Object.values(slot.images || {})[0]?.url;
                if (imgUrl) images.push(imgUrl.replace(/\/(?:[0-9]+x)\//, '/originals/'));
              }
            }
            if (pinData.story_pin_data?.pages) {
              for (const page of pinData.story_pin_data.pages) {
                const img = page.blocks?.find(b => b.image)?.image;
                const imgUrl = img?.images?.orig?.url || img?.images?.['736x']?.url || Object.values(img?.images || {})[0]?.url;
                if (imgUrl) images.push(imgUrl.replace(/\/(?:[0-9]+x)\//, '/originals/'));
              }
            }
            if (images.length === 0 && pinData.images) {
              const best = pinData.images.orig?.url || pinData.images['736x']?.url || pinData.images['474x']?.url || Object.values(pinData.images)[0]?.url;
              if (best) images.push(best.replace(/\/(?:[0-9]+x)\//, '/originals/'));
            }
            const videoList = pinData.videos?.video_list;
            if (videoList && typeof videoList === 'object') {
              const formats = Object.values(videoList).filter(f => f.url).sort((a, b) => (b.width || 0) - (a.width || 0));
              if (formats[0]?.url) videoUrl = formats[0].url;
            }
          }
        }
      } catch (err) {
        console.warn('[Pinterest] PinResource error:', err.message);
      }
    }

    if (images.length === 0 && !videoUrl) {
      try {
        const oembedRes = await fetch(`https://www.pinterest.com/oembed.json?url=${encodeURIComponent(finalUrl)}`, {
          signal: AbortSignal.timeout(6000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
        });
        if (oembedRes.ok) {
          const oe = await oembedRes.json();
          if (oe.title && oe.title.trim()) title = oe.title.trim();
          if (oe.thumbnail_url) images.push(oe.thumbnail_url.replace(/\/(?:[0-9]+x)\//, '/originals/'));
        }
      } catch {}
    }

    const blacklist = ['d53b014d86a6b6761bf649a0ed813c2b', 'logo_transparent', 'favicon', '75x75_RS'];
    const cleanImages = [...new Set(images)].filter(img => !blacklist.some(b => img.includes(b)));

    if (cleanImages.length > 0) {
      return { success: true, type: 'gallery', title: title || 'Pinterest Şəkil', images: cleanImages, image: cleanImages[0] };
    }
    if (videoUrl) {
      return { success: true, type: 'video', title: title || 'Pinterest Video', video_url: videoUrl };
    }

    return null;
  } catch (e) {
    console.warn('[Pinterest] extract error:', e.message);
    return null;
  }
}

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

    const isInstagram = url.includes('instagram.com') || url.includes('instagr.am');
    const cobaltPayload = {
      url: url,
      videoQuality: quality === "max" ? "max" : (quality || "max"),
      filenameStyle: "nerdy",
      alwaysProxy: !isInstagram
    };

    if (isMuted) {
      cobaltPayload.downloadMode = "mute";
    } else if (isAudioOnly) {
      cobaltPayload.downloadMode = "audio";
      cobaltPayload.audioFormat = "mp3";
    }

    let cobaltUrls = [ process.env.COBALT_API_URL ];
    
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be') || url.includes('music.youtube');
    if (isYouTube) {
      const ytMatch = url.match(/(?:youtu\.be\/|(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|v\/|live\/))([a-zA-Z0-9_-]{11})/i);
      if (ytMatch && ytMatch[1]) {
        cobaltPayload.url = `https://www.youtube.com/watch?v=${ytMatch[1]}`;
      } else if (url.includes('music.youtube.com')) {
        cobaltPayload.url = url.replace(/https?:\/\/music\.youtube\.com/i, 'https://www.youtube.com');
      }

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
        process.env.COBALT_API_URL
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

        if (targetUrl === process.env.COBALT_API_URL && cobaltToken) {
          reqHeaders["Authorization"] = `Api-Key ${cobaltToken}`;
        }

        const timeoutMs = targetUrl === process.env.COBALT_API_URL ? 25000 : 8000;
        const response = await fetch(targetUrl, {
          method: "POST",
          headers: reqHeaders,
          body: JSON.stringify(cobaltPayload),
          signal: AbortSignal.timeout(timeoutMs)
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
        break;
      } catch (err) {
        console.warn(`[Cobalt] Failed for ${targetUrl}: ${err.message}`);
        lastError = err;
        continue;
      }
    }

    if (!data && (url.includes('pinterest.com') || url.includes('pin.it'))) {
      const pinData = await fetchPinterest(url);
      if (pinData) {
        if (pinData.type === 'gallery' && pinData.images?.length > 1) {
          data = {
            status: 'picker',
            pickerType: 'images',
            picker: pinData.images.map(img => ({ type: 'photo', url: img, thumb: img }))
          };
        } else if (pinData.image) {
          data = { status: 'tunnel', url: pinData.image, filename: 'pinterest_photo.jpg', type: 'photo' };
        } else if (pinData.video_url) {
          data = { status: 'tunnel', url: pinData.video_url, filename: 'pinterest_video.mp4', type: 'video' };
        }
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
      body: JSON.stringify({ error: error.message || "Failed to fetch information." })
    };
  }
};
