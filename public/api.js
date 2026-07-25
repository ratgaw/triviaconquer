// Thin wrapper around the Open Trivia Database (https://opentdb.com) — free, no API key required.
const BASE_URL = 'https://opentdb.com';

// OTDB's own category ids only ever accept ONE per request and are unlikely to change —
// they've been stable for years — so this mapping is hardcoded rather than derived.
export const CATEGORY_GROUPS = [
  { id: 'general', name: 'General Knowledge', emoji: '🧠', otdbIds: [9] },
  { id: 'entertainment', name: 'Entertainment & Pop Culture', emoji: '🎬', otdbIds: [10, 11, 12, 13, 14, 15, 16, 26, 29, 31, 32] },
  { id: 'science', name: 'Science & Technology', emoji: '🔬', otdbIds: [17, 18, 19, 30] },
  { id: 'history', name: 'History & Politics', emoji: '🏛️', otdbIds: [23, 24] },
  { id: 'geography', name: 'Geography & Nature', emoji: '🌍', otdbIds: [22, 27] },
  { id: 'arts', name: 'Arts & Mythology', emoji: '🎨', otdbIds: [20, 25] },
  { id: 'sports', name: 'Sports & Vehicles', emoji: '🏆', otdbIds: [21, 28] },
];

let sessionToken = null;

async function getSessionToken() {
  if (sessionToken) return sessionToken;
  const res = await fetch(`${BASE_URL}/api_token.php?command=request`);
  const data = await res.json();
  sessionToken = data.token;
  return sessionToken;
}

// A token that has served every question in its category combo comes back as response_code 4.
// Resetting it (rather than requesting a new one) keeps the "already seen" history relevant.
async function resetSessionToken() {
  if (!sessionToken) return;
  await fetch(`${BASE_URL}/api_token.php?command=reset&token=${sessionToken}`);
}

function decodeHTML(str) {
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchFromCategory(id, difficulty, amount, token) {
  const params = new URLSearchParams({ amount: String(Math.min(amount, 50)), token });
  if (id !== 'any') params.set('category', String(id));
  if (difficulty !== 'any') params.set('difficulty', difficulty);

  const res = await fetch(`${BASE_URL}/api.php?${params.toString()}`);
  const data = await res.json();

  if (data.response_code === 4) {
    await resetSessionToken();
    return [];
  }
  if (data.response_code !== 0) return [];
  return data.results;
}

function normalizeQuestions(rawResults) {
  return shuffle(rawResults).map((q, idx) => ({
    id: idx,
    category: decodeHTML(q.category),
    difficulty: q.difficulty,
    type: q.type, // 'multiple' | 'boolean'
    question: decodeHTML(q.question),
    correctAnswer: decodeHTML(q.correct_answer),
    answers: shuffle([decodeHTML(q.correct_answer), ...q.incorrect_answers.map(decodeHTML)]),
  }));
}

// A group like "Entertainment & Pop Culture" covers 11 raw OTDB categories. OTDB only accepts
// one category per request, so to get variety within a group we sample a few of its raw ids
// rather than hammering every one of them (which would multiply request count for no benefit
// at typical round sizes).
function pickRequestTargets(group, shareForGroup) {
  const ids = shuffle(group.otdbIds).slice(0, Math.min(3, group.otdbIds.length));
  const perId = Math.max(1, Math.ceil(shareForGroup / ids.length));
  return ids.map((id) => ({ id, amount: perId }));
}

// groupIds: array of CATEGORY_GROUPS ids selected by the player.
export async function fetchQuestions({ groupIds, difficulty, amount }) {
  const token = await getSessionToken();
  const groups = CATEGORY_GROUPS.filter((g) => groupIds.includes(g.id));
  const shareForGroup = Math.max(1, Math.ceil(amount / groups.length));
  const targets = groups.flatMap((g) => pickRequestTargets(g, shareForGroup));

  const results = (
    await Promise.all(targets.map((t) => fetchFromCategory(t.id, difficulty, t.amount, token)))
  ).flat();

  return normalizeQuestions(results).slice(0, amount);
}
