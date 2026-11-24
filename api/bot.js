'use strict';
// Vercel uchun o'tkazgich: kod netlify/functions/bot.js da qoladi
const { handler } = require('../netlify/functions/bot.js');
const E = process.env;

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      // Bir martalik webhook ulash: /api/bot?setup=WEBHOOK_SECRET
      const q = req.query || {};
      if (q.setup && E.WEBHOOK_SECRET && q.setup === E.WEBHOOK_SECRET) {
        const url = `https://${req.headers.host}/api/bot`;
        const r = await fetch(`https://api.telegram.org/bot${E.BOT_TOKEN}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, secret_token: E.WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'] }),
        });
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(await r.text());
      }
      return res.status(200).send('ok');
    }
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const out = await handler({ httpMethod: 'POST', headers: req.headers, body, queryStringParameters: req.query || {} });
    return res.status(out.statusCode || 200).send(out.body || '');
  } catch (e) {
    console.error(e);
    return res.status(200).send('ok');
  }
};

