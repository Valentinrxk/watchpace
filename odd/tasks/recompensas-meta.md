# recompensas-meta

## Objective
Reaching the yearly goal (and the round numbers on the way) must pay off in the app, and the
rewards must be visible in advance instead of hidden.

## Problem
- Production, 2026-11-12: valen is at 208/206. He crossed the goal on 2026-11-10 and the
  scoreboard only said "faltan 0 en 49 días"; "tocás la meta" showed "—".
- The round-number challenge (`hito-N`) is cumulative, so it never becomes `completado`: at N it
  silently rolls over to N+50. Past the goal it returned nothing at all, and between the last
  round number and the goal (201–205 of 206) it also returned nothing.

## Scope
- Backend: `calcularPremios` (round numbers + goal, with the film that was number N), `cumplida`
  and `yapa` on the pace, payload fields, round-number challenge that targets the goal and
  continues after it.
- Web: scoreboard "meta cumplida" state, "premios" shelf always visible with locked rewards,
  one-time celebration per reward, end-credits gala for the goal (replayable), crown on the logo
  monkey, goal mark in the "juntos" line.
- Telegram: header says "meta cumplida · +N de yapa"; the message celebrates a reward reached
  today; the nightly nudge writes on that day.

Out of scope: streak and hours rewards, changing goals from the UI.

## Constraints
- Local clone is behind origin (data commits from GitHub Actions). Code is identical to
  production (`public/index.html` byte-equal on 2026-11-12). Pull before pushing.
- Test servers: `WATCHPACE_DEPLOY=0 PORT=4399 node src/server.js`, then restore the data files
  the sync rewrites (`usuarios/`, `cache/films.json`, `cache/personas.json`).
- Delivery: uncommitted on master; the user reviews and pushes.

## Tasks
- [x] T1 backend + tests (`src/pace.js`, `src/api.js`, `src/retos.js`, `test/premios.test.js`) — route: inline
- [x] T2 web (`public/index.html`) — route: inline, single non-trivial file
- [x] T3 telegram (`src/telegram.js`, `api/telegram.js`, `api/nudge.js`) — route: inline, mechanical
- [x] T4 browser check: desktop + phone, day + night, before and after the goal
- [x] T5 dancing monkeys in the gala (`scripts/monos-baile.py`, `public/monos.json`, `public/index.html`, `test/monos.test.js`) — route: inline

## Decisions
- One celebration at a time: the goal first and it never expires; of the round numbers only the
  latest, and only if it is at most 14 days old. Closing the gala marks the earlier round numbers
  as celebrated.
- Celebration state stays in `localStorage` (`wp.festejo.<user>.<id>`), like the challenges.
- The goal id includes the goal value (`meta-2026-206`): raising the goal can be celebrated again.
- Film number N: diary reversed, then stable-sorted by date, so same-day films keep log order.
- The gala is always dark. Derived colour tokens resolve on `:root`, so `.gala` redeclares
  `--color-text` and `--color-text-dim` next to `data-theme="dark"`.
- The premios shelf sits after "retos", not under the scoreboard, to keep "hoy" high on phones;
  the scoreboard carries the state and the "ver los créditos" button.

## Dancing monkeys (added 2026-11-12, second request)
The user downloaded five monkey GIFs and asked for something funny and celebratory with them.
- `scripts/monos-baile.py` turns them into ASCII frames (`public/monos.json`, 123 KB raw, about
  16 KB gzipped). The source GIFs are third-party and stay out of the repo.
- Not a literal conversion: silhouette and motion come from the GIF; faces are hand-drawn and
  stamped following the head. The shirt-and-shorts monkey loses its head against the dark
  background, so it wears the logo head, and its shorts are the red accent. The pixel-art one is
  drawn from its outline with a hollow face and red cheeks, with no stamped face because it
  turns its back.
- In the page they are text in a `<pre>`, one frame after another (`setInterval`, 150–190 ms):
  two beside the opening number, all five under "coreografía: los monos", two beside "fin".
  Fetched once when the goal is reached; if the fetch fails the gala runs without them.
- Adding a monkey: one segmentation function plus one `armar(...)` line in the script; the page
  takes the list as it comes (first two open, next two close, all of them dance in the line-up).

## Music (added 2026-11-12, third request: "agregale musica silly")
- First version: a chiptune loop (square lead, "boing"). Replaced the same day after the user
  asked for "medio vocaloid medio nightcore 2010".
- Current version, synthesised with Web Audio at play time, no audio file: four-on-the-floor
  kick, off-beat saw bass and hats, claps on 2 and 4, a detuned-saw pad that pumps with the
  kick, a compressor on the bus, and a formant voice (one sawtooth through three band-pass
  formants shifted up, with glide, vibrato on long notes and a noise consonant) singing an
  original melody over IV-V-iii-vi in C. The second pass adds a sixteenth-note arpeggio.
- One eighth note lasts 190 ms, the dancers' frame step, so they dance in time (157.9 bpm).
- Browsers block sound without a gesture: when the gala opens by itself it starts muted, the
  button reads "poner música" and any tap inside starts it. Opened from "ver los créditos" it
  plays at once. The choice is remembered in `wp.musica`.
- Checked: toggle, remembered choice, stop on close, start on first tap after a suspended
  context, 10 steps per 1.9 s, offline render of 16 bars: mix peak 0.70, voice and backing at
  the same RMS (0.13 each). Not checked: how it sounds; it was composed and measured, not
  listened to. iOS silent-switch behaviour untested.

## Verification evidence (2026-11-12)
- RED: with `src/` and `api/` stashed, `node --test test/premios.test.js` fails with
  "does not provide an export named 'calcularPremios'". GREEN: `npm test` → 12 pass, 0 fail.
- Local server with real synced data (208/206): gala opens by itself once, rolls at 72 px/s,
  stops on wheel, Escape closes, reload does not reopen, "ver los créditos" reopens. No console
  errors on desktop, night theme, 390×844 phone (no horizontal overflow), `?u=yuti` (locked goal
  shown, no crown, no gala) and `?u=juntos`.
- Dancers (test server without sync, goal lowered to 150 over the stale local data): 9 dancers
  animate on desktop and on a 390x844 phone, no horizontal overflow, no console errors, and the
  intervals drop to 0 on close. `npm test` -> 23 pass.
- Not exercised end to end: Telegram delivery (no bot token locally); the message builder is
  covered by tests, including MarkdownV2 escaping.

## Review
- `gentle-ai review assess` (with the two new files declared): medium, `slice_budget_reached`
  (611 changed lines).
- Native review not started: the preflight STATUS asks for an intended-untracked selection in a
  JSON schema the tool does not publish; one attempt was refused with `invalid_request`.

## Next step
User reviews, pulls (`git pull --rebase`) and pushes.
