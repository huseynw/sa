const https = require('https');

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { type, message } = JSON.parse(event.body);

    if (!message || message.trim() === '') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Message is required' }) };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables.');
      return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
    }

    const typeText = type === 'complaint' ? '⚠️ ŞİKAYƏT' : '💡 TƏKLİF';
    const text = `${typeText}\n\n${message}`;

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const telegramRes = await new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        });
      });

      req.on('error', (e) => reject(e));
      req.write(payload);
      req.end();
    });

    if (telegramRes.statusCode !== 200) {
      console.error('Telegram API Error:', telegramRes.data);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to send message to Telegram' })
      };
    }

    return {
      statusCode: 200,
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
