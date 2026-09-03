# CLAUDE.md

Guidance for Claude Code (and anyone else) working in this repository.

## Working agreements

These apply to every request in this repo.

* **Always start a new branch for each request.** Do not commit directly to `main`/`master`, and do
  not stack an unrelated request's changes onto a branch created for a previous one. Name the branch
  after the work being done (e.g. `claude/<short-description>`).
* **Open a pull request when the work is done.** Once changes are committed and pushed, open a PR
  against the default branch summarizing what changed and why, so it can be reviewed before merging.
* **Verify the app builds (`npm run build`) before opening the PR.** This repo also has a test suite
  and a typecheck — run `npm test` and `npm run typecheck` too, and say so in the PR.
* **Post the links at the end of every response** — the Vercel app, the Vercel pipeline and the git
  repo — so they can be opened quickly:
  * App: https://big-two.vercel.app/
  * Pipeline: https://vercel.com/clem21/big-two
  * Repo: https://github.com/ClemL/big-two
* Add a line to `public/updates.txt` when you ship a user-visible change. Entries are appended
  **oldest first**, one per line, in the form `<ISO 8601 timestamp> - <what changed>`. The footer
  shows the last line; the changelog dialog shows every line, newest first.
* Comments explain *why*, not *what*. Skip them where the code already says it.

## What this project is

A browser implementation of Hong Kong style Big Two (鋤大弟): one human against three AI opponents.
Static Next.js App Router app — no backend, no database, no environment variables. Everything runs
client side, so a Vercel deployment is just `next build` plus static hosting.

```
app/            App Router entry, global stylesheet, icon
components/     GameTable (all interaction), CardView, RulesPanel, Modal, BuildFooter
lib/cards.ts    Deck, rank/suit ordering, seeded shuffle and deal
lib/combos.ts   Combination detection, comparison, legal move generation
lib/engine.ts   Round state machine: play, pass, trick clearing, round end
lib/scoring.ts  Hong Kong penalty multipliers
lib/ai.ts       Opponent policies
public/         updates.txt (changelog)
test/           node:test unit tests, including simulated self-play rounds
```

## Invariants worth protecting

Break any of these and the game is a different game. Change them deliberately, not incidentally, and
update `test/` and the in-app rules panel in the same commit.

* **The engine is pure.** `startRound`, `applyPlay` and `applyPass` return new state and never mutate
  their argument. React holds one `GameState` and re-renders from it. Keep game logic out of
  components — if a rule question can be answered without a browser, it belongs in `lib/`.
* **Dealing is seeded.** `mulberry32` drives the shuffle so any round can be replayed by seed, which
  is what makes the self-play tests reproducible. Do not reach for `Math.random` inside `lib/`
  except as the caller-supplied default.
* **The AI never passes while it holds a legal play.** This is the requested behavior, not an
  oversight. Both styles are selections over the same `legalMovesFor` list.
* **`legalMovesFor` returns ascending strength.** The "lowest legal play" AI and the Hint button both
  depend on it, and a test asserts the ordering.
* **Ruleset conventions that differ between houses** live in `lib/combos.ts` and are documented in
  `README.md` and `RulesPanel.tsx`. Two in particular: flushes compare by **suit first**, then rank;
  straights run over 3…A,2 with **no wrap-around**, so A-2-3-4-5 is not a straight. If you change
  either, change all three places.
* **Four cards are not a playable shape.** Quads are only playable as a five-card hand.

## Working on the code

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # must pass before a PR
npm test           # node:test, no extra dependencies — needs Node 22+
npm run typecheck
```

Tests run TypeScript directly through Node's built-in type stripping, so `lib/` and `test/` must stay
**erasable** TypeScript: no `enum`, no constructor parameter properties, and type-only imports must
use `import type`. Files under `lib/` import each other with explicit `.ts` extensions for the same
reason; components import through the `@/` alias.

The self-play tests simulate a few hundred full rounds and take roughly half a minute. That is the
check that catches deadlocks — a rules change that makes a position unplayable shows up there and
almost nowhere else.

## UI conventions

* No CSS framework. All styles live in `app/globals.css` as plain classes, with design tokens on
  `:root` (`--felt`, `--ink`, `--muted`, `--accent`, `--danger`, `--card-*`).
* Dialogs use the shared `Modal` component. Passing `onClose` makes it dismissible by backdrop click
  and by Escape; omitting `onClose` makes it modal in the strict sense (the round summary omits it,
  because the player has to choose to continue).
* Backdrop clicks close only when the click landed on the backdrop itself — clicks inside the panel
  bubble up to the same handler, and closing on those feels broken. The guard is in `Modal.tsx`.
* The build footer reads `public/updates.txt` at runtime and fails silently if it is missing.
  Version and build stamp are inlined at build time by `next.config.mjs`.
