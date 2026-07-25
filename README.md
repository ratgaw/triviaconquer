# Trivia Conquer

A no-signup, no-subscription trivia web app with an Ancient Mediterranean theme. Pick one or
more categories and a difficulty, click through questions one at a time, chase a streak, and
duel a friend to see who prevails.

Plain HTML/CSS/JS on the frontend — no build step, no framework. Questions come from our own
growing catalog (Cloudflare D1), fed daily from Open Trivia DB, the-trivia-api.com, and
optionally Claude-generated questions (see below). The daily leaderboard uses Cloudflare Worker
+ KV.

**Repo layout**: site files live in `public/` (this is what gets served). `worker.js`,
`ingestion.js`, `wrangler.jsonc`, and `migrations/` at the repo root are Cloudflare-specific —
they run the catalog, the leaderboard, and the daily ingestion job. Without them deployed, the
site still loads but can't fetch questions or show the leaderboard; there's no fallback to a
different static host for this version, since the catalog itself only lives in D1.

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

`public/serve.ps1` is dev-only (already gitignored). Note: `/api/questions` and `/api/leaderboard`
only exist once deployed to Cloudflare (see below) — locally you'll see "Couldn't find enough
questions" on Start and "not available" on the leaderboard. That's expected, not a bug; there's
no way to serve real questions without the deployed D1 catalog behind them.

## Features

- **Grouped categories**: 8 broader picks (General Knowledge, Entertainment & Pop Culture,
  Science & Technology, History & Politics, Geography & Nature, Mythology, Arts, Sports &
  Vehicles — Mythology and Arts are separate groups, not combined) — see `CATEGORY_GROUPS` in
  `public/category-groups.js` if you want to re-slice these. This file is shared by the browser
  and the ingestion pipeline, so re-slicing categories only needs to happen in one place.
- **A real, growing question catalog**: questions live in Cloudflare D1, not fetched live from a
  third party on every round. A daily cron job (`ingestion.js`, triggered from `worker.js`) pulls
  new questions from Open Trivia DB and the-trivia-api.com, optionally tops up thin
  category/difficulty combos with Claude-generated questions, runs everything through a quality
  pass, and only inserts genuinely new questions. See "Setting up the trivia catalog" below.
- **"Did you know?" explanations**: when a question was reviewed by the LLM quality pass (i.e.
  `ANTHROPIC_API_KEY` is configured), a short one/two-sentence explanation is generated alongside
  it and stored with the question. It appears below the answers once you've picked one. Questions
  ingested without an LLM key (or ingested before this feature existed) simply have no
  explanation, and the box doesn't render — nothing to configure. Each ingestion run also
  backfills explanations onto up to 60 older questions that don't have one yet
  (`backfillExplanations` in `ingestion.js`), so coverage fills in gradually across days rather
  than all at once.
- **No repeated questions**: the browser remembers every question ID you've been served
  (`public/seen-questions.js`, persisted in `localStorage` — not just for one session) and asks
  the catalog to exclude them next time. A question only repeats once you've actually exhausted
  the unseen supply for that category/difficulty combination.
- **Endless Mode**: an "♾️ Endless (no limit)" option alongside the usual 5/10/15/20 question
  counts — keeps serving questions until you run out of lives or stop. When the unseen supply for
  your chosen categories runs dry, you're shown a choice: end the run, continue anyway (allowing
  repeats), or add another category to keep going without repeats.
  - **Lives**: you start with 5. A wrong answer costs one; hit 0 and the run ends (you still see
    the reveal/explanation for that last question before it's over). Every 10 questions answered,
    you regain a life automatically (capped at 5). Every 6 questions, if you're below 5 lives,
    you're offered an optional hard question as a "trial" — answer it correctly for a bonus life
    back, with no penalty for getting it wrong.
- **Streak + mythological ascension**: consecutive correct answers build a streak that climbs
  through a small pantheon (`celebration.js`) — the Muses, Hermes, Athena, Apollo, Heracles,
  Odysseus, the Minotaur, the Hydra, Poseidon, Ares, Hera, and finally Zeus at 24+ — each with
  its own confetti color, icon, and message, escalating in scale and (at the top tiers) a
  screen-shake or lightning-flash effect. Personal best streak is remembered locally
  (`localStorage`), independent of the daily leaderboard.
- **Two daily leaderboards**: nickname, no login, both reset at midnight UTC.
  - **Classic (20Q)** — best score out of a 20-question round specifically (other round lengths
    are still fully playable, just not ranked — comparing a score out of 5 against a score out
    of 20 wouldn't be a fair leaderboard).
  - **Endless (longest run)** — ranked by total questions survived before the run ended (lives
    depleted, or you chose to stop); each entry also shows that run's best correct-answer streak
    as extra context, though it isn't the ranking metric.
- **Challenge a friend**: encodes the actual question set plus your score directly into a
  shareable URL (`challenge.js`) — no backend involved. Opening the link shows a head-to-head
  comparison after they play the identical questions.

## Setting up the trivia catalog and leaderboard (Cloudflare Worker + D1 + KV)

Cloudflare has unified Pages into its "Workers" product. A Git-connected Worker project deploys
via Wrangler using `wrangler.jsonc` (repo root) — it defines `public/` as the static assets
directory and `worker.js` as the script that handles anything not matched by a static file:
`/api/questions`, `/api/leaderboard`, and `/api/ingest`. This is different from the older "Pages
Functions" (`functions/api/*.js`) convention — that approach doesn't apply to new Git-connected
Worker projects, which is why this repo uses `worker.js` + `wrangler.jsonc` instead.

Unlike the leaderboard (which degrades gracefully without it), **the question catalog is
required** — without D1 set up, the site has no questions to serve at all.

### 1. Create the D1 database

Cloudflare dashboard → **Storage & Databases → D1 → Create database** → name it
`triviaconquer-questions` (or anything — just update the name below to match). Copy its
**database ID**.

In `wrangler.jsonc`, replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with that ID.

### 2. Apply the schema and keep it applied on every deploy

`migrations/0001_init.sql` defines the `questions` and `ingestion_log` tables. Migrations need to
run via Wrangler, which requires Node — this machine didn't have it, so rather than run it once
locally, the cleanest fix is to make **every deploy** apply pending migrations first. In the
Cloudflare dashboard, on this Worker project → **Settings** → change the **Deploy command** from
`npx wrangler deploy` to:

```
npx wrangler d1 migrations apply DB --remote && npx wrangler deploy
```

(`DB` matches the binding name in `wrangler.jsonc`.) This is idempotent — already-applied
migrations are skipped — so it's safe to leave in place permanently.

### 3. Set up the KV leaderboard binding (if not already done)

Same as before: **Settings → Domains & Routes** (or wherever KV bindings live in your dashboard
version) → bind an existing or new KV namespace to the variable name `LEADERBOARD_KV`.

### 4. (Optional) Add an Anthropic API key for LLM-generated questions and quality review

Without this, the daily ingestion job still runs — it just pulls from Open Trivia DB and
the-trivia-api.com and falls back to rule-based cleanup (whitespace/duplicate-answer checks)
instead of an LLM reviewing every question for typos and awkward phrasing.

With a key, ingestion additionally (a) generates fresh questions for thin category/difficulty
combos via Claude, and (b) runs every incoming question — from all three sources — through an
LLM proofreading pass that fixes typos/grammar and rejects anything factually wrong, ambiguous,
or a near-duplicate within its batch.

To enable it: create an API key at [console.anthropic.com](https://console.anthropic.com), then
in the Cloudflare dashboard → this Worker project → **Settings → Variables and Secrets** → add a
secret named `ANTHROPIC_API_KEY`. This is a paid API (Claude Haiku, priced per token) — the daily
job is bounded (roughly 8 groups × 3 difficulties × up to 15 questions/day), so cost stays small,
but it is an ongoing cost tied to your Anthropic billing, not free like the rest of this stack.

### 5. (Optional) Set up manual ingestion testing

The daily job normally runs from the cron trigger already defined in `wrangler.jsonc`
(`0 6 * * *`, i.e. 6am UTC) — but waiting a full day to see if it worked isn't practical for
testing. Add a secret named `INGEST_SECRET` (any random string you choose) in **Settings →
Variables and Secrets**, then trigger a run manually any time with:

```bash
curl -X POST "https://<your-worker-url>/api/ingest?key=<your-INGEST_SECRET-value>"
```

It returns a JSON summary (`pulled`, `added`, `rejectedDuplicate`, `rejectedQuality`) so you can
confirm it's actually adding questions before waiting on the schedule.

**Once you've set up D1 (and optionally the LLM key), let me know and I'll help verify it
end-to-end** — trigger an ingestion run, confirm questions show up, play a round, submit to both
leaderboards, confirm entries appear and are gone the next UTC day.

Known limitations, by design for a casual, no-login, free-tier-friendly setup:
- Duplicate detection is an exact normalized-text hash match — it catches identical questions
  (including the repeat you noticed) but won't catch two differently-worded questions asking the
  same thing. Genuine semantic dedup would need embeddings and similarity search, which is more
  infrastructure than this warrants right now.
- The LLM quality pass (when enabled) meaningfully reduces typos/awkward phrasing/factual errors,
  but doesn't guarantee perfection — it's a review pass, not a formal fact-checker.
- Leaderboard values are self-reported by the client with only basic bounds-checking
  (Classic capped at 20, Endless capped at a large sanity ceiling) — a determined user could still
  post a plausible fake score. Fine for a fun/casual leaderboard; not tamper-proof.
- The profanity filter (`profanity-filter.js`, checked both client- and server-side) is a
  word-list match — it blocks the obvious cases, not every possible evasion.
- Two leaderboard submissions at the exact same instant could race and one could be dropped.
  Acceptable for a casual daily board; not appropriate if exact counts ever matter.

## Deploying

This version is Cloudflare-specific: the question catalog lives in D1 and is served by
`worker.js`, so there's no meaningful way to run this on a different static host anymore (unlike
earlier versions, where OTDB was queried directly from the browser). Deploy via Cloudflare
Workers as described above.

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

## Credits

The mythological tier icons in `public/icons/gods/` and `public/icons/laurel-crown.svg` are from
[game-icons.net](https://game-icons.net), licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/):
Drama masks, Winged leg, Owl, Sun, Muscle Up, Minotaur, Hydra, Trident, Crossed swords, Queen
crown, Heavy lightning, and Laurel crown by [Lorc](https://lorcblog.blogspot.com); Trojan horse
by [Delapouite](https://delapouite.com). Keep this credit if you redistribute the site.

## Icon / design resources for future customization

- Icons (SVG, CC BY 3.0): [game-icons.net](https://game-icons.net) — deep mythology/fantasy/combat
  coverage, exactly what powers the pantheon tiers above. Needs attribution (see Credits).
- Icons (SVG, MIT-licensed): [Lucide](https://lucide.dev), [Heroicons](https://heroicons.com),
  [Tabler Icons](https://tabler.io/icons)
- Consistent cross-platform emoji: [Twemoji](https://twemoji.twitter.com),
  [OpenMoji](https://openmoji.org)
- Illustrations: [unDraw](https://undraw.co)
- Full PWA icon set from one image: [RealFaviconGenerator](https://realfavicongenerator.net)
- Color palettes: [Radix Colors](https://www.radix-ui.com/colors), [coolors.co](https://coolors.co)

## Customizing

- **Category groups**: `CATEGORY_GROUPS` in `public/category-groups.js` — shared by the browser
  and the ingestion pipeline (`ingestion.js`), so re-slicing categories only needs to happen once.
- **Question count per round**: `amounts` array in `public/app.js` (`renderSetup`).
- **How many new questions ingested per group per day**: `DAILY_TARGET_PER_GROUP` in
  `ingestion.js`.
- **Colors/branding**: CSS variables at the top of `public/styles.css`.
- **Profanity blocklist**: `BLOCKLIST` in `public/profanity-filter.js` — a single file imported
  by both the browser (`public/app.js`) and the Worker (`worker.js`), so there's nothing to keep
  in sync manually.
