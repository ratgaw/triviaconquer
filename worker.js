// Cloudflare Worker entry point. Static files in public/ are served automatically by the
// "assets" binding configured in wrangler.jsonc — this script only runs for requests that
// don't match a static file, which in practice means just /api/leaderboard.
//
// Storage model: one JSON array per UTC day, key "leaderboard:YYYY-MM-DD", holding the top 25
// entries sorted by streak. Simple and cheap, at the cost of a small race window if two people
// submit at the exact same instant — acceptable for a casual daily leaderboard. Entries expire
// after 2 days so old boards clean themselves up.
import { isValidNickname, sanitizeNickname } from './public/profanity-filter.js';

const MAX_ENTRIES = 25;
const TWO_DAYS_SECONDS = 60 * 60 * 24 * 2;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function handleGet(env) {
  const key = `leaderboard:${todayKey()}`;
  const raw = await env.LEADERBOARD_KV.get(key);
  const entries = raw ? JSON.parse(raw) : [];
  return Response.json({ date: todayKey(), entries });
}

async function handlePost(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const nickname = sanitizeNickname(body.nickname);
  const streak = Number(body.streak);

  if (!nickname || !isValidNickname(nickname)) {
    return new Response('Invalid or inappropriate nickname', { status: 400 });
  }
  if (!Number.isInteger(streak) || streak <= 0 || streak > 200) {
    return new Response('Invalid streak value', { status: 400 });
  }

  const key = `leaderboard:${todayKey()}`;
  const raw = await env.LEADERBOARD_KV.get(key);
  const entries = raw ? JSON.parse(raw) : [];

  entries.push({ nickname, streak, createdAt: Date.now() });
  entries.sort((a, b) => b.streak - a.streak);
  const trimmed = entries.slice(0, MAX_ENTRIES);

  await env.LEADERBOARD_KV.put(key, JSON.stringify(trimmed), { expirationTtl: TWO_DAYS_SECONDS });

  return Response.json({ ok: true, entries: trimmed });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/leaderboard') {
      return new Response('Not found', { status: 404 });
    }
    if (request.method === 'GET') return handleGet(env);
    if (request.method === 'POST') return handlePost(request, env);
    return new Response('Method not allowed', { status: 405 });
  },
};
