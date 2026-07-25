// Daily catalog ingestion: pulls new questions from Open Trivia DB and the-trivia-api.com,
// optionally tops up thin category/difficulty combos with Claude-generated questions, runs
// everything through a quality pass (typo/grammar cleanup + rejection of ambiguous or
// near-duplicate questions), then inserts only genuinely new questions (by normalized-text
// hash) into D1. Runs from worker.js's scheduled() export, and can be triggered manually via
// POST /api/ingest for testing (see README).
import { CATEGORY_GROUPS } from './public/category-groups.js';

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const DAILY_TARGET_PER_GROUP = 15; // new questions per group per day, spread across difficulties
const QA_BATCH_SIZE = 15;
const LLM_MODEL = 'claude-haiku-4-5-20251001';

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', ecirc: 'ê', uuml: 'ü', ouml: 'ö', auml: 'ä', ntilde: 'ñ',
  ccedil: 'ç', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', deg: '°',
};

function decodeHtmlEntities(str) {
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

async function hashQuestion(text) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function extractJsonArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  return start >= 0 && end > start ? text.slice(start, end + 1) : '[]';
}

async function pullFromOTDB(group, difficulty, amount) {
  if (group.otdbIds.length === 0 || amount <= 0) return [];
  const id = group.otdbIds[Math.floor(Math.random() * group.otdbIds.length)];
  const params = new URLSearchParams({ amount: String(Math.min(amount, 50)), category: String(id) });
  if (difficulty !== 'any') params.set('difficulty', difficulty);

  try {
    const res = await fetch(`https://opentdb.com/api.php?${params.toString()}`);
    const data = await res.json();
    if (data.response_code !== 0) return [];
    return data.results.map((q) => ({
      groupId: group.id,
      difficulty: q.difficulty,
      type: q.type,
      question: decodeHtmlEntities(q.question),
      correctAnswer: decodeHtmlEntities(q.correct_answer),
      incorrectAnswers: q.incorrect_answers.map(decodeHtmlEntities),
      explanation: '',
      source: 'opentdb',
    }));
  } catch {
    return [];
  }
}

async function pullFromTriviaApi(group, difficulty, amount) {
  if (group.triviaApiCategories.length === 0 || amount <= 0) return [];
  const params = new URLSearchParams({
    categories: group.triviaApiCategories.join(','),
    limit: String(Math.min(amount, 50)),
  });
  if (difficulty !== 'any') params.set('difficulties', difficulty);

  try {
    const res = await fetch(`https://the-trivia-api.com/v2/questions?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((q) => ({
      groupId: group.id,
      difficulty: q.difficulty,
      type: 'multiple',
      question: q.question.text,
      correctAnswer: q.correctAnswer,
      incorrectAnswers: q.incorrectAnswers,
      explanation: '',
      source: 'trivia-api',
    }));
  } catch {
    return [];
  }
}

async function callClaude(prompt, maxTokens, env) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.content?.[0]?.text ?? null;
}

async function generateViaLLM(group, difficulty, amount, env) {
  if (!env.ANTHROPIC_API_KEY || amount <= 0) return [];

  const prompt = `Generate ${amount} original trivia questions for the category "${group.name}" at ${
    difficulty === 'any' ? 'a mix of easy, medium, and hard' : `"${difficulty}"`
  } difficulty.

Return ONLY a JSON array, no prose before or after, in this exact shape:
[{"question": "...", "correctAnswer": "...", "incorrectAnswers": ["...", "...", "..."], "difficulty": "easy|medium|hard"}]

Requirements: every question must be factually accurate with exactly one unambiguous correct
answer; the three incorrect answers must be plausible but clearly wrong to someone who knows the
answer; vary phrasing and sub-topics within the category; avoid overused "starter" trivia
questions.`;

  try {
    const text = await callClaude(prompt, 2048, env);
    if (!text) return [];
    const parsed = JSON.parse(extractJsonArray(text));
    return parsed
      .filter((q) => q.question && q.correctAnswer && Array.isArray(q.incorrectAnswers) && q.incorrectAnswers.length >= 3)
      .map((q) => ({
        groupId: group.id,
        difficulty: DIFFICULTIES.includes(q.difficulty) ? q.difficulty : (difficulty === 'any' ? 'medium' : difficulty),
        type: 'multiple',
        question: q.question,
        correctAnswer: q.correctAnswer,
        incorrectAnswers: q.incorrectAnswers.slice(0, 3),
        explanation: '',
        source: 'llm',
      }));
  } catch {
    return [];
  }
}

function ruleBasedClean(q) {
  const question = q.question.trim().replace(/\s+/g, ' ');
  const correctAnswer = q.correctAnswer.trim();
  const incorrectAnswers = q.incorrectAnswers.map((a) => String(a).trim());
  if (!question || !correctAnswer || incorrectAnswers.length < 3) return null;
  if (incorrectAnswers.some((a) => a.toLowerCase() === correctAnswer.toLowerCase())) return null;
  return { ...q, question, correctAnswer, incorrectAnswers: incorrectAnswers.slice(0, 3) };
}

async function reviewBatchWithLLM(batch, env) {
  const prompt = `Review these trivia questions for typos, grammatical errors, or awkward phrasing, and correct them in place. Also set "reject": true for any question that is factually wrong, ambiguous, has more than one plausible correct answer, or is a near-duplicate of another question in this same batch.

For every question you don't reject, also write a one or two sentence "explanation" — extra context or a fun fact about the answer, the kind of thing that makes someone say "huh, interesting" after seeing the correct answer. Keep it factual and concise, under 200 characters.

Input:
${JSON.stringify(batch.map((q, i) => ({ index: i, question: q.question, correctAnswer: q.correctAnswer, incorrectAnswers: q.incorrectAnswers })))}

Return ONLY a JSON array with exactly one entry per input item, same order, in this exact shape:
[{"index": 0, "reject": false, "question": "corrected text", "correctAnswer": "...", "incorrectAnswers": ["...", "...", "..."], "explanation": "..."}]`;

  try {
    const text = await callClaude(prompt, 6144, env);
    if (!text) return batch.map(ruleBasedClean).filter(Boolean);

    const reviewed = JSON.parse(extractJsonArray(text));
    const out = [];
    for (const r of reviewed) {
      if (!r || r.reject) continue;
      const original = batch[r.index];
      if (!original || !r.question || !r.correctAnswer || !Array.isArray(r.incorrectAnswers)) continue;
      out.push({
        ...original,
        question: r.question,
        correctAnswer: r.correctAnswer,
        incorrectAnswers: r.incorrectAnswers.slice(0, 3),
        explanation: typeof r.explanation === 'string' ? r.explanation.slice(0, 240) : '',
      });
    }
    return out;
  } catch {
    return batch.map(ruleBasedClean).filter(Boolean);
  }
}

async function qaAndClean(candidates, env) {
  if (candidates.length === 0) return [];
  if (!env.ANTHROPIC_API_KEY) return candidates.map(ruleBasedClean).filter(Boolean);

  const cleaned = [];
  for (let i = 0; i < candidates.length; i += QA_BATCH_SIZE) {
    const batch = candidates.slice(i, i + QA_BATCH_SIZE);
    cleaned.push(...(await reviewBatchWithLLM(batch, env)));
  }
  return cleaned;
}

async function insertQuestions(cleaned, env, stats) {
  for (const q of cleaned) {
    const hash = await hashQuestion(q.question);
    const existing = await env.DB.prepare('SELECT id FROM questions WHERE question_hash = ?').bind(hash).first();
    if (existing) {
      stats.rejectedDuplicate++;
      continue;
    }
    try {
      await env.DB.prepare(
        `INSERT INTO questions (group_id, difficulty, type, question, correct_answer, incorrect_answers, explanation, question_hash, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          q.groupId,
          q.difficulty,
          q.type,
          q.question,
          q.correctAnswer,
          JSON.stringify(q.incorrectAnswers),
          q.explanation || '',
          hash,
          q.source,
          Date.now()
        )
        .run();
      stats.added++;
    } catch {
      stats.rejectedDuplicate++; // most likely the UNIQUE constraint on question_hash
    }
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runDailyIngestion(env) {
  const stats = { pulled: 0, added: 0, rejectedDuplicate: 0, rejectedQuality: 0, byGroup: {} };

  // OTDB (and occasionally the-trivia-api.com) rate-limits sustained rapid requests. Processing
  // group/difficulty combos in a fixed order meant whichever groups came last always lost out
  // once the limit kicked in. Shuffling the order spreads that risk across all groups run to
  // run, and a short pause between combos reduces how often the limit gets hit at all.
  const tasks = shuffle(CATEGORY_GROUPS.flatMap((group) => DIFFICULTIES.map((difficulty) => ({ group, difficulty }))));

  for (const { group, difficulty } of tasks) {
    const perDifficulty = Math.ceil(DAILY_TARGET_PER_GROUP / DIFFICULTIES.length);

    const [otdb, triviaApi] = await Promise.all([
      pullFromOTDB(group, difficulty, perDifficulty),
      pullFromTriviaApi(group, difficulty, perDifficulty),
    ]);
    let candidates = [...otdb, ...triviaApi];

    if (env.ANTHROPIC_API_KEY && candidates.length < perDifficulty) {
      candidates = [...candidates, ...(await generateViaLLM(group, difficulty, perDifficulty - candidates.length, env))];
    }

    stats.pulled += candidates.length;
    const cleaned = await qaAndClean(candidates, env);
    stats.rejectedQuality += candidates.length - cleaned.length;

    const before = stats.added;
    await insertQuestions(cleaned, env, stats);
    stats.byGroup[group.id] = (stats.byGroup[group.id] || 0) + (stats.added - before);

    await sleep(200);
  }

  await env.DB.prepare(
    `INSERT INTO ingestion_log (run_at, source, pulled, added, rejected_duplicate, rejected_quality) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(Date.now(), 'daily', stats.pulled, stats.added, stats.rejectedDuplicate, stats.rejectedQuality)
    .run();

  return stats;
}
