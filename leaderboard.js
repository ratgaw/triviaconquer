// Talks to the Cloudflare Pages Function at /api/leaderboard (see functions/api/leaderboard.js).
// That endpoint only exists once this site is deployed on Cloudflare Pages with a KV binding —
// locally, or on any other static host, these calls fail and the UI shows a "not available" note
// instead of breaking the rest of the app.

const ENDPOINT = '/api/leaderboard';

export async function fetchTopStreaks() {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return null;
    const data = await res.json();
    return data.entries;
  } catch {
    return null;
  }
}

export async function submitStreak(nickname, streak) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, streak }),
    });
    if (!res.ok) {
      const message = await res.text();
      return { ok: false, error: message || 'Could not submit score.' };
    }
    const data = await res.json();
    return { ok: true, entries: data.entries };
  } catch {
    return { ok: false, error: 'Network error — could not reach the leaderboard.' };
  }
}
