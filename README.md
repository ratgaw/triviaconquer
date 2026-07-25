# QuickTrivia

A no-signup, no-subscription trivia web app. Pick one or more categories and a difficulty,
click through questions one at a time, chase a streak, and challenge a friend to beat your score.

Plain HTML/CSS/JS — no build step, no framework. Questions come live from the free
[Open Trivia Database](https://opentdb.com) API. The daily leaderboard uses a Cloudflare Worker
+ KV (see below) — everything else works on any static host with zero setup.

**Repo layout**: site files live in `public/` (this is what gets served). `worker.js` and
`wrangler.jsonc` at the repo root are Cloudflare-specific and only matter for the leaderboard —
any other static host just needs the contents of `public/`.

## Run it locally

Any static file server works:

Serve the **`public/`** folder specifically (that's the site root, not the repo root):

```bash
python -m http.server 8080 --directory public
```
```bash
npx serve public
```

This machine didn't have Python or Node on PATH, so a throwaway `public/serve.ps1` script (plain
PowerShell, no dependencies) is included for local testing — run it from inside `public/`:

```bash
powershell -ExecutionPolicy Bypass -File public/serve.ps1
```

`public/serve.ps1` is dev-only (already gitignored). Note: the leaderboard's `/api/leaderboard`
endpoint only exists once deployed to Cloudflare (see below), so locally the leaderboard UI will
show "not available" — that's expected, not a bug.

## Features

- **Grouped categories**: the ~24 raw Open Trivia DB categories are bucketed into 7 broader
  picks (General Knowledge, Entertainment & Pop Culture, Science & Technology, History &
  Politics, Geography & Nature, Arts & Mythology, Sports & Vehicles) — see `CATEGORY_GROUPS` in
  `api.js` if you want to re-slice these.
- **Streak + escalating celebration**: consecutive correct answers build a streak; the confetti
  burst and "on fire" toast (`celebration.js`) get bigger at 3, 5, and 10+ in a row. Personal
  best streak is remembered locally (`localStorage`), independent of the daily leaderboard.
- **Daily leaderboard**: nickname + streak, no login. Resets at midnight UTC. Requires the
  Cloudflare backend below.
- **Challenge a friend**: encodes the actual question set plus your score directly into a
  shareable URL (`challenge.js`) — no backend involved. Opening the link shows a head-to-head
  comparison after they play the identical questions.

## Setting up the daily leaderboard (Cloudflare Worker + KV)

Cloudflare has unified Pages into its "Workers" product. A Git-connected Worker project deploys
via Wrangler using `wrangler.jsonc` (repo root) — it defines `public/` as the static assets
directory and `worker.js` as the script that handles anything not matched by a static file,
which in this app means just `/api/leaderboard`. This is different from the older "Pages
Functions" (`functions/api/*.js`) convention — that approach doesn't apply to new Git-connected
Worker projects, which is why this repo uses `worker.js` + `wrangler.jsonc` instead.

The leaderboard code is fully written and degrades gracefully without it — the rest of the site
works either way.

1. In the Cloudflare dashboard: **Workers & Pages → Create → Import a repository**, select this
   GitHub repo. Leave **Build command** empty and **Deploy command** as `npx wrangler deploy` —
   Wrangler reads `wrangler.jsonc` automatically, no extra build config needed.
2. `wrangler.jsonc` already references a KV binding named `LEADERBOARD_KV` pointed at a specific
   namespace ID. If you're using a different KV namespace, update the `id` field in
   `wrangler.jsonc` to match yours (Cloudflare dashboard → Storage & Databases → KV → your
   namespace → copy its ID).
3. Deploy (or push to the connected branch to trigger a redeploy).

**Once you've done this, let me know and I'll help verify it end-to-end** (submit a score,
confirm it shows up, confirm it's gone the next UTC day).

Known limitations, by design for a no-login casual leaderboard:
- Streaks are self-reported by the client — there's no server-side verification that a submitted
  streak was actually earned in-game. Bounded to a max of 200 to block obviously fake values, but
  a determined user could still post a plausible fake score. Fine for a fun/casual leaderboard;
  not suitable if this ever needs to be tamper-proof.
- The profanity filter (`profanity-filter.js`, checked both client- and server-side) is a
  word-list match — it blocks the obvious cases, not every possible evasion.
- Two submissions at the exact same instant could race and one could be dropped. Acceptable for
  a casual daily board; not appropriate if exact counts ever matter.

## Deploying

The contents of `public/` are a plain static site — any host works (Netlify, Vercel, GitHub
Pages, Cloudflare) if you don't need the leaderboard. The leaderboard specifically needs the
Cloudflare Worker + KV setup described above, since `worker.js` and `wrangler.jsonc` are
Cloudflare-specific.

## Turning it into an "app"

Already an installable PWA (`manifest.json` + `sw.js`) — Chrome/Android shows an install prompt;
iOS Safari supports "Add to Home Screen." For a fuller Android install prompt, add proper PNG
icons (192×192 and 512×512) alongside the placeholder SVG — see the icon resources below.
For real App Store / Play Store listings later, wrap the same site with
[Capacitor](https://capacitorjs.com) or [PWABuilder](https://www.pwabuilder.com) — no rewrite
needed.

## Monetization (ads only, no accounts)

Placeholder slots are marked in `public/index.html` (`#ad-top`, `#ad-bottom`). Once you have a
Google AdSense account approved for the live domain, replace each placeholder `<div>` with the
AdSense `<ins>` snippet. AdSense requires a live domain (not `localhost`) and a visible privacy
policy — `public/privacy.html` is included, but fill in the `[date]` and `[contact email]`
placeholders before submitting for approval.

## Icon / design resources for future customization

- Icons (SVG, MIT-licensed): [Lucide](https://lucide.dev), [Heroicons](https://heroicons.com),
  [Tabler Icons](https://tabler.io/icons)
- Consistent cross-platform emoji: [Twemoji](https://twemoji.twitter.com),
  [OpenMoji](https://openmoji.org)
- Illustrations: [unDraw](https://undraw.co)
- Full PWA icon set from one image: [RealFaviconGenerator](https://realfavicongenerator.net)
- Color palettes: [Radix Colors](https://www.radix-ui.com/colors), [coolors.co](https://coolors.co)

## Customizing

- **Category groups**: `CATEGORY_GROUPS` in `public/api.js`.
- **Question count per round**: `amounts` array in `public/app.js` (`renderSetup`).
- **Colors/branding**: CSS variables at the top of `public/styles.css`.
- **Profanity blocklist**: `BLOCKLIST` in `public/profanity-filter.js` — a single file imported
  by both the browser (`public/app.js`) and the Worker (`worker.js`), so there's nothing to keep
  in sync manually.
