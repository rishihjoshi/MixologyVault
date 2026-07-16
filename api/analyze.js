// Vercel serverless function — proxies a bar-shelf photo to Anthropic so the
// API key NEVER reaches the browser. The browser POSTs { base64, mediaType };
// this function attaches the key (from the ANTHROPIC_API_KEY env var set in the
// Vercel dashboard) and forwards to Claude, returning Claude's raw JSON.
//
// The model + prompt are pinned here so the key can't be abused for arbitrary
// requests, and CORS is locked to the GitHub Pages origin.

const ALLOWED_ORIGIN = 'https://rishihjoshi.github.io';
const MODEL  = 'claude-haiku-4-5-20251001';
const PROMPT = 'List every alcoholic bottle, mixer, juice, syrup, or cocktail ingredient visible in this photo. Return ONLY a JSON array of ingredient name strings. Be specific about brands where visible. Example: ["Tanqueray Gin","Cointreau","Angostura Bitters"]';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'Server not configured' });

  try {
    const { base64, mediaType } = req.body || {};
    if (typeof base64 !== 'string' || !base64) {
      return res.status(400).json({ error: 'Missing image data' });
    }
    if (base64.length > 5_500_000) {
      return res.status(413).json({ error: 'Image too large — use a smaller photo' });
    }
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType || '')) {
      return res.status(400).json({ error: 'Unsupported image type' });
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text',  text: PROMPT },
          ],
        }],
      }),
    });

    const body = await r.text();
    res.setHeader('content-type', 'application/json');
    return res.status(r.status).send(body);
  } catch (e) {
    return res.status(500).json({ error: 'Proxy error' });
  }
}
