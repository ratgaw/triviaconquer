// Talks to the Cloudflare Worker at /api/leaderboard (see worker.js). Two independent boards
// share this endpoint via a `mode` param: 'classic' (best score out of a 20-question round) and
// 'endless' (longest run — total questions survived before running out of lives or stopping,
// with best streak kept alongside each entry as extra context) — kept separate since comparing
// a score out of 20 against an open-ended run length wouldn't be a fair ranking. This endpoint
// only exists once deployed on Cloudflare with the D1 + KV bindings set up; locally or on any
// other static host these calls fail and the UI shows a "not available" note instead of
// breaking the app.

const ENDPOINT = '/api/leaderboard';

export async function fetchLeaderboard(mode) {
  try {
    const res = await fetch(`${ENDPOINT}?mode=${mode}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.entries;
  } catch {
    return null;
  }
}

export async function submitToLeaderboard(mode, nickname, value, extra = {}) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, nickname, value, ...extra }),
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
