// Unit tests for the Vercel proxy handler (api/analyze.js).
//
// The handler is a pure request/response function, so we drive it with mock
// `req`/`res` objects — no server or network. The one success-path test stubs
// global.fetch so no real Anthropic call is made. Run with: npm run test:api
//
// Focus: the Origin gate (the security fix), method/format validation, and that
// a valid request is forwarded and Claude's raw body is returned verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from './analyze.js';

const ALLOWED_ORIGIN = 'https://rishihjoshi.github.io';
const VERCEL_ORIGIN  = 'https://mixology-vault.vercel.app';

// Minimal Express/Vercel-style response double that records what the handler did.
function mockRes() {
  return {
    statusCode: null,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; this.ended = true; return this; },
    send(str) { this.body = str; this.ended = true; return this; },
    end() { this.ended = true; return this; },
  };
}

function mockReq({ method = 'POST', headers = {}, body = {} } = {}) {
  // Header lookups in the handler use lowercase keys.
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { method, headers: lower, body };
}

// A 1x1-ish base64 blob — content is irrelevant, only that it's a non-empty string.
const OK_BASE64 = 'aGVsbG8=';

test('OPTIONS preflight returns 204 with CORS headers', async () => {
  const res = mockRes();
  await handler(mockReq({ method: 'OPTIONS' }), res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], ALLOWED_ORIGIN);
  assert.ok(res.ended);
});

test('non-POST method is rejected with 405', async () => {
  const res = mockRes();
  await handler(mockReq({ method: 'GET' }), res);
  assert.equal(res.statusCode, 405);
});

test('Origin gate: a mismatched Origin is rejected with 403 before any key use', async () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY; // prove 403 happens before the key check
  try {
    const res = mockRes();
    await handler(mockReq({ headers: { origin: 'https://evil.example.com' } }), res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Forbidden' });
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  }
});

test('Origin gate: the allowed Origin passes the gate (reaches the key check)', async () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const res = mockRes();
    await handler(mockReq({ headers: { origin: ALLOWED_ORIGIN } }), res);
    // Not 403 — it got past the gate and stopped at "server not configured".
    assert.equal(res.statusCode, 503);
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  }
});

test('Origin gate: the Vercel deployment origin passes too, and CORS echoes it', async () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const res = mockRes();
    await handler(mockReq({ headers: { origin: VERCEL_ORIGIN } }), res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['access-control-allow-origin'], VERCEL_ORIGIN);
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  }
});

test('CORS never echoes a disallowed Origin', async () => {
  const res = mockRes();
  await handler(mockReq({ method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } }), res);
  assert.equal(res.headers['access-control-allow-origin'], ALLOWED_ORIGIN);
});

test('Origin gate: an absent Origin is allowed (non-browser clients w/o the header)', async () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const res = mockRes();
    await handler(mockReq({ headers: {} }), res);
    assert.notEqual(res.statusCode, 403);
    assert.equal(res.statusCode, 503);
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  }
});

test('missing image data returns 400', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const res = mockRes();
  await handler(mockReq({ headers: { origin: ALLOWED_ORIGIN }, body: {} }), res);
  assert.equal(res.statusCode, 400);
});

test('unsupported media type returns 400', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const res = mockRes();
  await handler(mockReq({
    headers: { origin: ALLOWED_ORIGIN },
    body: { base64: OK_BASE64, mediaType: 'image/tiff' },
  }), res);
  assert.equal(res.statusCode, 400);
});

test('an oversized payload returns 413', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const res = mockRes();
  await handler(mockReq({
    headers: { origin: ALLOWED_ORIGIN },
    body: { base64: 'a'.repeat(5_500_001), mediaType: 'image/jpeg' },
  }), res);
  assert.equal(res.statusCode, 413);
});

test('a valid request is forwarded to Anthropic and the raw body is returned', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const claudeBody = JSON.stringify({ content: [{ type: 'text', text: '["Gin"]' }] });

  const realFetch = global.fetch;
  let sentUrl, sentInit;
  global.fetch = async (url, init) => {
    sentUrl = url; sentInit = init;
    return { ok: true, status: 200, text: async () => claudeBody };
  };
  try {
    const res = mockRes();
    await handler(mockReq({
      // Unique IP so the shared in-memory rate limiter doesn't interfere.
      headers: { origin: ALLOWED_ORIGIN, 'x-forwarded-for': '203.0.113.7' },
      body: { base64: OK_BASE64, mediaType: 'image/jpeg' },
    }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body, claudeBody);
    assert.equal(sentUrl, 'https://api.anthropic.com/v1/messages');
    assert.equal(sentInit.headers['x-api-key'], 'test-key');
  } finally {
    global.fetch = realFetch;
  }
});
