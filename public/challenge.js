// Encodes a played round (its exact questions + the sender's result) into a shareable URL,
// so the recipient plays the identical question set and gets a real head-to-head comparison —
// all without any backend. Capped at 10 questions to keep the URL a sane length.

const MAX_CHALLENGE_QUESTIONS = 10;

function toBase64Url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(str) {
  const padLength = (4 - (str.length % 4)) % 4;
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
  return decodeURIComponent(escape(atob(padded)));
}

export function buildChallengeUrl({ questions, fromName, score, streak }) {
  const compact = questions.slice(0, MAX_CHALLENGE_QUESTIONS).map((q) => ({
    c: q.category,
    d: q.difficulty,
    t: q.type,
    q: q.question,
    a: q.answers,
    x: q.correctAnswer,
    e: q.explanation || '',
  }));

  const payload = { v: 1, n: (fromName || 'A friend').slice(0, 16), s: score, st: streak, qs: compact };
  const encoded = toBase64Url(JSON.stringify(payload));

  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('challenge', encoded);
  return url.toString();
}

export function parseChallengeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('challenge');
  if (!raw) return null;

  try {
    const payload = JSON.parse(fromBase64Url(raw));
    if (!payload.qs || !Array.isArray(payload.qs) || payload.qs.length === 0) return null;

    return {
      fromName: payload.n,
      fromScore: payload.s,
      fromStreak: payload.st,
      questions: payload.qs.map((q, idx) => ({
        id: idx,
        category: q.c,
        difficulty: q.d,
        type: q.t,
        question: q.q,
        answers: q.a,
        correctAnswer: q.x,
        explanation: q.e || '',
      })),
    };
  } catch {
    return null; // malformed/tampered link — caller falls back to normal setup
  }
}

export async function shareChallenge(url, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Trivia Conquer Duel', text, url });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}
