// Caches only the app shell (HTML/CSS/JS/icons) so the site launches instantly when installed.
// Trivia questions always come fresh from the network — they are not cached.
const CACHE_NAME = 'triviaconquer-shell-v4';
const SHELL_FILES = [
  './',
  './index.html',
  './privacy.html',
  './styles.css',
  './app.js',
  './api.js',
  './celebration.js',
  './challenge.js',
  './leaderboard.js',
  './profanity-filter.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/gods/muses.svg',
  './icons/gods/hermes.svg',
  './icons/gods/athena.svg',
  './icons/gods/apollo.svg',
  './icons/gods/heracles.svg',
  './icons/gods/odysseus.svg',
  './icons/gods/minotaur.svg',
  './icons/gods/hydra.svg',
  './icons/gods/poseidon.svg',
  './icons/gods/ares.svg',
  './icons/gods/hera.svg',
  './icons/gods/zeus.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // let calls to opentdb.com pass through untouched
  if (url.pathname.startsWith('/api/')) return; // leaderboard data must always be fresh, never cached

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
