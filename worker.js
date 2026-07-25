// Cloudflare Worker entry point. Static files in public/ are served automatically by the
// "assets" binding configured in wrangler.jsonc — this script only runs for requests that
// don't match a static file: /api/leaderboard, /api/questions, and /api/ingest.
//
// Leaderboard storage: one JSON array per UTC day per mode, key "leaderboard:<mode>:YYYY-MM-DD",
// holding the top 25 entries. Simple and cheap, at the cost of a small race window if two people
// submit at the exact same instant — acceptable for a casual daily leaderboard. Entries expire
// after 2 days so old boards clean themselves up.
//
// Question catalog: served from D1 (see migrations/0001_init.sql), grown daily by
// runDailyIngestion() in ingestion.js.
import { isValidNickname, sanitizeNickname } from './public/profanity-filter.js';
import { isValidGroupId } from './public/category-groups.js';
import { runDailyIngestion } from './ingestion.js';

const MAX_ENTRIES = 25;
const TWO_DAYS_SECONDS = 60 * 60 * 24 * 2;
const MODES = ['classic', 'endless'];
const MAX_QUESTIONS_PER_REQUEST = 50;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function leaderboardKey(mode) {
  return `leaderboard:${mode}:${todayKey()}`;
}

function statsKey() {
  return `stats:rounds:${todayKey()}`;
}

// ---------- Ambient stats ----------

async function handleStatsGet(env) {
  const raw = await env.LEADERBOARD_KV.get(statsKey());
  return Response.json({ date: todayKey(), roundsToday: raw ? Number(raw) : 0 });
}

async function handleStatsPost(env) {
  const key = statsKey();
  const raw = await env.LEADERBOARD_KV.get(key);
  const count = (raw ? Number(raw) : 0) + 1;
  await env.LEADERBOARD_KV.put(key, String(count), { expirationTtl: TWO_DAYS_SECONDS });
  return Response.json({ ok: true, roundsToday: count });
}

// ---------- Leaderboard ----------

async function handleLeaderboardGet(url, env) {
  const modeParam = url.searchParams.get('mode');
  const mode = MODES.includes(modeParam) ? modeParam : 'classic';

  const raw = await env.LEADERBOARD_KV.get(leaderboardKey(mode));
  const entries = raw ? JSON.parse(raw) : [];
  return Response.json({ date: todayKey(), mode, entries });
}

async function handleLeaderboardPost(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const mode = MODES.includes(body.mode) ? body.mode : 'classic';
  const nickname = sanitizeNickname(body.nickname);
  const value = Number(body.value);
  const streak = Number(body.streak);

  if (!nickname || !isValidNickname(nickname)) {
    return new Response('Invalid or inappropriate nickname', { status: 400 });
  }
  if (!Number.isInteger(value) || value <= 0) {
    return new Response('Invalid value', { status: 400 });
  }
  if (mode === 'classic' && value > 20) {
    return new Response('Classic leaderboard is scored out of 20 questions', { status: 400 });
  }
  if (mode === 'endless' && value > 100000) {
    return new Response('Invalid run length', { status: 400 });
  }

  const key = leaderboardKey(mode);
  const raw = await env.LEADERBOARD_KV.get(key);
  const entries = raw ? JSON.parse(raw) : [];

  const entry = { nickname, value, createdAt: Date.now() };
  if (mode === 'endless' && Number.isInteger(streak) && streak >= 0) {
    entry.streak = streak;
  }
  entries.push(entry);
  entries.sort((a, b) => b.value - a.value);
  const trimmed = entries.slice(0, MAX_ENTRIES);

  await env.LEADERBOARD_KV.put(key, JSON.stringify(trimmed), { expirationTtl: TWO_DAYS_SECONDS });

  return Response.json({ ok: true, mode, entries: trimmed });
}

// ---------- Questions ----------

async function handleQuestionsGet(url, env) {
  const groupIds = (url.searchParams.get('groups') || '').split(',').filter(isValidGroupId);
  const difficulty = url.searchParams.get('difficulty') || 'any';
  const amount = Math.min(Math.max(parseInt(url.searchParams.get('amount'), 10) || 10, 1), MAX_QUESTIONS_PER_REQUEST);
  const exclude = (url.searchParams.get('exclude') || '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter(Number.isInteger);

  if (groupIds.length === 0) {
    return Response.json({ questions: [], exhausted: true });
  }

  const bindings = [...groupIds];
  let sql = `SELECT id, group_id, difficulty, type, question, correct_answer, incorrect_answers, explanation FROM questions WHERE group_id IN (${groupIds.map(() => '?').join(',')})`;

  if (difficulty !== 'any') {
    sql += ' AND difficulty = ?';
    bindings.push(difficulty);
  }
  if (exclude.length > 0) {
    sql += ` AND id NOT IN (${exclude.map(() => '?').join(',')})`;
    bindings.push(...exclude);
  }
  sql += ' ORDER BY RANDOM() LIMIT ?';
  bindings.push(amount);

  const { results } = await env.DB.prepare(sql).bind(...bindings).all();

  const questions = results.map((row) => ({
    id: row.id,
    groupId: row.group_id,
    difficulty: row.difficulty,
    type: row.type,
    question: row.question,
    correctAnswer: row.correct_answer,
    incorrectAnswers: JSON.parse(row.incorrect_answers),
    explanation: row.explanation || '',
  }));

  return Response.json({ questions, exhausted: questions.length < amount });
}

// ---------- Manual ingestion trigger (for testing without waiting on the cron) ----------

async function handleIngestPost(request, url, env) {
  const key = url.searchParams.get('key') || request.headers.get('x-ingest-key');
  if (!env.INGEST_SECRET || key !== env.INGEST_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  const stats = await runDailyIngestion(env);
  return Response.json({ ok: true, stats });
}

// ---------- Fetch handler ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/leaderboard') {
      if (request.method === 'GET') return handleLeaderboardGet(url, env);
      if (request.method === 'POST') return handleLeaderboardPost(request, env);
      return new Response('Method not allowed', { status: 405 });
    }

    if (url.pathname === '/api/questions') {
      if (request.method === 'GET') return handleQuestionsGet(url, env);
      return new Response('Method not allowed', { status: 405 });
    }

    if (url.pathname === '/api/ingest') {
      if (request.method === 'POST') return handleIngestPost(request, url, env);
      return new Response('Method not allowed', { status: 405 });
    }

    if (url.pathname === '/api/stats') {
      if (request.method === 'GET') return handleStatsGet(env);
      if (request.method === 'POST') return handleStatsPost(env);
      return new Response('Method not allowed', { status: 405 });
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyIngestion(env));
  },
};
