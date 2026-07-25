// Talks to our own Worker-backed catalog at /api/questions (see worker.js + ingestion.js),
// which is grown daily from Open Trivia DB, the-trivia-api.com, and (optionally) Claude-
// generated questions — all deduplicated and quality-checked before storage. This replaced an
// earlier version that queried Open Trivia DB directly from the browser; that approach couldn't
// prevent a question from repeating across separate sessions, since OTDB's dedup is only
// per-session-token and resets on page reload.
import { CATEGORY_GROUPS } from './category-groups.js';
import { getSeenIds, markSeen } from './seen-questions.js';

export { CATEGORY_GROUPS };

const ENDPOINT = '/api/questions';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function groupName(groupId) {
  return CATEGORY_GROUPS.find((g) => g.id === groupId)?.name ?? groupId;
}

// Returns { questions, exhausted }. `exhausted: true` means fewer unseen questions were
// available than requested for this exact category+difficulty combination — the caller (see
// the endless-mode exhaustion prompt in app.js) decides what to do about that.
export async function fetchQuestions({ groupIds, difficulty, amount, allowRepeats = false }) {
  const params = new URLSearchParams({
    groups: groupIds.join(','),
    difficulty,
    amount: String(amount),
  });

  if (!allowRepeats) {
    const seen = getSeenIds();
    if (seen.length) params.set('exclude', seen.join(','));
  }

  let data;
  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`);
    if (!res.ok) return { questions: [], exhausted: true };
    data = await res.json();
  } catch {
    return { questions: [], exhausted: true };
  }

  const questions = shuffle(data.questions).map((q) => ({
    id: q.id,
    category: groupName(q.groupId),
    difficulty: q.difficulty,
    type: q.type,
    question: q.question,
    correctAnswer: q.correctAnswer,
    answers: shuffle([q.correctAnswer, ...q.incorrectAnswers]),
    explanation: q.explanation || '',
  }));

  if (!allowRepeats) markSeen(questions.map((q) => q.id));

  return { questions, exhausted: Boolean(data.exhausted) };
}
