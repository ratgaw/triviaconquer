# QuickTrivia

A no-signup, no-subscription trivia web app. Pick one or more categories and a difficulty,
click through questions one at a time, chase a streak, and challenge a friend to beat your score.

Plain HTML/CSS/JS — no build step, no framework. Questions come live from the free
[Open Trivia Database](https://opentdb.com) API. The daily leaderboard uses a Cloudflare Pages
Function + KV (see below) — everything else works on any static host with zero setup.

## Run it locally

Any static file server works:

```bash
python -m http.server 8080
```
```bash
npx serve .
```

This machine didn't have Python or Node on PATH, so a throwaway `serve.ps1` script (plain
PowerShell, no dependencies) is included for local testing:

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Delete `serve.ps1` before deploying — it's dev-only. Note: the leaderboard's `/api/leaderboard`
endpoint only exists once deployed to Cloudflare Pages (see below), so locally the leaderboard UI
will show "not available" — that's expected, not a bug.

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

## Setting up the daily leaderboard (Cloudflare Pages + KV)

The leaderboard code is fully written (`functions/api/leaderboard.js` + `leaderboard.js`) and
degrades gracefully without it — the rest of the site works either way. **Skip this until
everything else is confirmed working**, then come back and do this once:

1. Push this folder to a GitHub/GitLab repo (or use direct upload) and create a Cloudflare Pages
   project from it: https://developers.cloudflare.com/pages/get-started/
2. Create a KV namespace: https://developers.cloudflare.com/kv/get-started/ — name it anything,
   e.g. `quicktrivia-leaderboard`.
3. Bind it to the Pages project: Pages project → Settings → Functions → KV namespace bindings →
   add a binding with **variable name exactly `LEADERBOARD_KV`**, pointing at the namespace from
   step 2. (Docs: https://developers.cloudflare.com/pages/functions/bindings/#kv-namespaces)
4. Redeploy. That's it — no code changes needed, no API keys to paste anywhere. The function
   reads the binding by that exact name, so as long as it's bound, `/api/leaderboard` works.

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

Static site — any host works (Cloudflare Pages, Netlify, Vercel, GitHub Pages), except the
leaderboard specifically needs Cloudflare Pages for the Functions + KV piece described above.

## Turning it into an "app"

Already an installable PWA (`manifest.json` + `sw.js`) — Chrome/Android shows an install prompt;
iOS Safari supports "Add to Home Screen." For a fuller Android install prompt, add proper PNG
icons (192×192 and 512×512) alongside the placeholder SVG — see the icon resources below.
For real App Store / Play Store listings later, wrap the same site with
[Capacitor](https://capacitorjs.com) or [PWABuilder](https://www.pwabuilder.com) — no rewrite
needed.

## Monetization (ads only, no accounts)

Placeholder slots are marked in `index.html` (`#ad-top`, `#ad-bottom`). Once you have a Google
AdSense account approved for the live domain, replace each placeholder `<div>` with the AdSense
`<ins>` snippet. AdSense requires a live domain (not `localhost`) and a visible privacy policy —
`privacy.html` is included, but fill in the `[date]` and `[contact email]` placeholders before
submitting for approval.

## Icon / design resources for future customization

- Icons (SVG, MIT-licensed): [Lucide](https://lucide.dev), [Heroicons](https://heroicons.com),
  [Tabler Icons](https://tabler.io/icons)
- Consistent cross-platform emoji: [Twemoji](https://twemoji.twitter.com),
  [OpenMoji](https://openmoji.org)
- Illustrations: [unDraw](https://undraw.co)
- Full PWA icon set from one image: [RealFaviconGenerator](https://realfavicongenerator.net)
- Color palettes: [Radix Colors](https://www.radix-ui.com/colors), [coolors.co](https://coolors.co)

## Customizing

- **Category groups**: `CATEGORY_GROUPS` in `api.js`.
- **Question count per round**: `amounts` array in `app.js` (`renderSetup`).
- **Colors/branding**: CSS variables at the top of `styles.css`.
- **Profanity blocklist**: `BLOCKLIST` in `profanity-filter.js` (shared by client and the
  Cloudflare function — keep both in sync since they import the same file).
