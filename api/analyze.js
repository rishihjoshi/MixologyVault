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

// Best-effort rate limiting. State lives in the warm function instance's memory,
// so it resets on cold starts and isn't shared across instances — it stops
// casual abuse and runaway loops. The hard cost ceiling is the spend limit on
// the Anthropic Console workspace that owns the key.
const PER_IP_LIMIT     = 10;              // photos per IP per window
const PER_IP_WINDOW_MS = 10 * 60 * 1000;  // 10 minutes
const DAILY_LIMIT      = 200;             // photos per instance per UTC day
const ipHits = new Map();                 // ip -> [timestamps]
let dayKey = '', dayCount = 0;

function rateLimit(ip, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; dayCount = 0; ipHits.clear(); }
  if (dayCount >= DAILY_LIMIT) return 'Daily photo limit reached — try again tomorrow';

  const hits = (ipHits.get(ip) || []).filter(t => now - t < PER_IP_WINDOW_MS);
  if (hits.length >= PER_IP_LIMIT) {
    ipHits.set(ip, hits);
    return 'Too many photos — wait a few minutes and try again';
  }
  hits.push(now);
  ipHits.set(ip, hits);
  dayCount++;
  return null;
}

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

  // Origin gate: the app is served cross-origin (GitHub Pages → Vercel), so a
  // real browser request ALWAYS carries an Origin header the browser sets and
  // scripts can't forge. Reject anything that doesn't match. CORS alone only
  // restrains browsers; this rejects casual non-browser abuse of the API key.
  // It is not airtight (a raw client can spoof the header) — the hard cost
  // ceiling remains the spend limit on the Anthropic Console workspace.
  const origin = req.headers.origin;
  if (origin && origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'Server not configured' });

  try {
    const { base64, mediaType } = req.body || {};
    if (typeof base64 !== 'string' || !base64) {
      return res.status(400).json({ error: 'Missing image data' });
    }
    if (base64.length > 5_500_000) {
      return res.status(413).json({ error: 'Photo too large — use one under 5 MB' });
    }
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType || '')) {
      return res.status(400).json({ error: 'Unsupported photo format — use a JPG or PNG' });
    }

    // Counted only after validation, so rejected requests don't use up quota.
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const limited = rateLimit(ip);
    if (limited) {
      res.setHeader('Retry-After', '600');
      return res.status(429).json({ error: limited });
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
  } catch {
    return res.status(500).json({ error: 'Proxy error' });
  }
}
