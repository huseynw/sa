function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PLATFORM_LABELS = {
  tiktok: '🎵 TikTok',
  instagram: '📸 Instagram',
  youtube: '▶️ YouTube',
  pinterest: '📌 Pinterest',
  facebook: '👥 Facebook',
  tiktok_method: '⚡ TikTok 120 FPS Metod',
  lyrics: '🎶 Mahnı Sözləri (Lyrics)',
  general: '🌐 Ümumi / Sayt'
};

const CONTACT_LABELS = {
  telegram: '✈️ Telegram',
  whatsapp: '💬 WhatsApp',
  instagram: '📸 Instagram',
  tiktok: '🎵 TikTok',
  other: '✉️ Digər / Email'
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { type, platform, contactMethod, contactValue, message } = JSON.parse(event.body || '{}');

    if (!message || message.trim() === '') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Message is required' }) };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables.');
      return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
    }

    const typeBadge = type === 'complaint'
      ? '⚠️ <b>YENİ ŞİKAYƏT / XƏTA</b>'
      : '💡 <b>YENİ TƏKLİF / İDEYA</b>';

    const platformText = PLATFORM_LABELS[platform] || escapeHtml(platform) || '🌐 Ümumi / Sayt';

    let contactText = '<i>Göstərilməyib (Anonim)</i>';
    if (contactValue && contactValue.trim()) {
      const methodLabel = CONTACT_LABELS[contactMethod] || 'Əlaqə';
      contactText = `${methodLabel}: <code>${escapeHtml(contactValue.trim())}</code>`;
    }

    const now = new Date();
    const timeStr = now.toLocaleString('az-AZ', {
      timeZone: 'Asia/Baku',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const text = `${typeBadge}

🌐 <b>Platforma:</b> ${platformText}
👤 <b>Əlaqə:</b> ${contactText}
📅 <b>Tarix:</b> ${timeStr}

📝 <b>Müraciət mətni:</b>
${escapeHtml(message.trim())}

━━━━━━━━━━━━━━━━━━━━
🌐 <i>HUSEVN DOWNLOADER</i>`;

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };

    const telegramRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await telegramRes.json().catch(() => ({}));

    if (!telegramRes.ok || !data.ok) {
      console.error('Telegram API Error:', data);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to send message to Telegram', detail: data })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Error processing feedback:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};

export default handler;
