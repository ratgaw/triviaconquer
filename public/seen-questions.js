// Tracks question IDs the player has already seen, persisted across page reloads and days —
// not just within one session — so the same question genuinely doesn't repeat until the
// catalog for that category/difficulty is exhausted. Capped so localStorage doesn't grow
// unbounded for a long-running player.
const SEEN_KEY = 'triviaconquer:seenQuestionIds';
const MAX_SEEN = 800;

export function getSeenIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function markSeen(ids) {
  if (!ids.length) return;
  const merged = [...new Set([...getSeenIds(), ...ids])];
  const trimmed = merged.slice(-MAX_SEEN);
  localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
}

export function clearSeen() {
  localStorage.removeItem(SEEN_KEY);
}
