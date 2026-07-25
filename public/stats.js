// Ambient "rounds played today" counter — backed by the same Worker/KV as the leaderboard.
// Best-effort only: increments aren't atomic (same tradeoff as the leaderboard), and if the
// Worker isn't deployed these calls just fail silently and the ambient line doesn't render.
const ENDPOINT = '/api/stats';

export async function fetchRoundsToday() {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return null;
    const data = await res.json();
    return data.roundsToday;
  } catch {
    return null;
  }
}

export function recordRoundStarted() {
  fetch(ENDPOINT, { method: 'POST' }).catch(() => {});
}
