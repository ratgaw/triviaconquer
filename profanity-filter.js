// Shared by the browser (nickname entry) and the Cloudflare Pages Function (server-side
// re-check, since anything client-only can be bypassed by calling the API directly).
// Best-effort word-list filter, not a complete moderation solution — see README.

const BLOCKLIST = [
  'anal', 'anus', 'arse', 'ass', 'bastard', 'bitch', 'bollock', 'boner', 'boob',
  'clit', 'cock', 'coon', 'crap', 'cum', 'cunt', 'dick', 'dildo', 'dyke', 'fag',
  'fatass', 'fuck', 'gook', 'handjob', 'hoe', 'homo', 'jerkoff', 'jizz', 'kike',
  'kkk', 'kraut', 'lesbo', 'masturbat', 'molest', 'nazi', 'nigg', 'orgasm', 'paki',
  'penis', 'piss', 'porn', 'pussy', 'rape', 'retard', 'sex', 'shit', 'slut',
  'spic', 'tit', 'twat', 'vagina', 'wank', 'whore',
];

// Strips accent/diacritic marks left behind by String.normalize('NFKD'), built from
// char codes so the source file never has to contain raw combining-mark bytes.
const COMBINING_MARKS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/(.)\1{2,}/g, '$1$1');
}

export function containsProfanity(text) {
  const normalized = normalize(text);
  return BLOCKLIST.some((word) => normalized.includes(word));
}

// Keeps nicknames short and limited to characters that render predictably everywhere
// (also blocks most unicode look-alike tricks used to dodge the word filter).
export function sanitizeNickname(raw) {
  return String(raw ?? '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .slice(0, 16);
}

export function isValidNickname(raw) {
  const clean = sanitizeNickname(raw);
  return clean.length > 0 && !containsProfanity(clean);
}
