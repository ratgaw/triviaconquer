// Shared category taxonomy — imported by both the browser (public/api.js, for display and
// query params) and the Worker's ingestion pipeline (worker.js, to know which source
// categories feed which of our groups). Single source of truth so the two never drift apart.
//
// otdbIds: Open Trivia DB category ids that feed this group.
// triviaApiCategories: the-trivia-api.com category tags that feed this group (some groups,
// like mythology, have no good match there and rely on OTDB + LLM generation instead).
export const CATEGORY_GROUPS = [
  { id: 'general', name: 'General Knowledge', emoji: '🧠', otdbIds: [9], triviaApiCategories: ['general_knowledge'] },
  { id: 'entertainment', name: 'Entertainment & Pop Culture', emoji: '🎬', otdbIds: [10, 11, 12, 13, 14, 15, 16, 26, 29, 31, 32], triviaApiCategories: ['film_and_tv', 'music'] },
  { id: 'science', name: 'Science & Technology', emoji: '🔬', otdbIds: [17, 18, 19, 30], triviaApiCategories: ['science'] },
  { id: 'history', name: 'History & Politics', emoji: '🏛️', otdbIds: [23, 24], triviaApiCategories: ['history'] },
  { id: 'geography', name: 'Geography & Nature', emoji: '🌍', otdbIds: [22, 27], triviaApiCategories: ['geography'] },
  { id: 'mythology', name: 'Mythology', emoji: '🏺', otdbIds: [20], triviaApiCategories: [] },
  { id: 'arts', name: 'Arts', emoji: '🎨', otdbIds: [25], triviaApiCategories: ['arts_and_literature'] },
  { id: 'sports', name: 'Sports & Vehicles', emoji: '🏆', otdbIds: [21, 28], triviaApiCategories: ['sport_and_leisure'] },
];

export const GROUP_IDS = CATEGORY_GROUPS.map((g) => g.id);

export function isValidGroupId(id) {
  return GROUP_IDS.includes(id);
}
