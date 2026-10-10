#!/usr/bin/env node
// Runs SQL against the Postgres in DATABASE_URL (Supabase). SSL required.
// Parses on the LAST '@' so a password containing '@' works unencoded.
// Usage: node tools/db.js <file.sql>
//        node tools/db.js -q "select 1"
const fs = require('fs');
const { Client } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) { console.error('error: set DATABASE_URL in .env'); process.exit(1); }

const m = url.match(/^postgres(?:ql)?:\/\/(.*)@([^@/]+)(\/.*)?$/);
if (!m) { console.error('error: could not parse DATABASE_URL'); process.exit(1); }
const ci = m[1].indexOf(':');
const cfg = {
  user: m[1].slice(0, ci),
  password: m[1].slice(ci + 1),
  host: m[2].split(':')[0],
  port: Number(m[2].split(':')[1] || 5432),
  database: (m[3] || '/postgres').slice(1).split('?')[0],
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
};

const [a, b] = process.argv.slice(2);
const sql = a === '-q' ? b : fs.readFileSync(a, 'utf8');

(async () => {
  const client = new Client(cfg);
  try {
    await client.connect();
    const res = await client.query(sql);
    const rows = Array.isArray(res) ? res[res.length - 1].rows : res.rows;
    if (rows && rows.length) console.table(rows);
    else console.log('OK (no rows)');
  } catch (e) {
    console.error('DB error:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
})();
