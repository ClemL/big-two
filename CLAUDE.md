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
  * App: https://clem-big-two.vercel.app/
  * Pipeline: https://vercel.com/clem21/clem-big-two
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
app/api/        Room routes (create, join, state, version, move)
components/     TableView (shared layout), GameTable (single player), OnlineTable,
                PocketView (phone), TableDisplay + TableSeatGate (tablet),
                RoomLobby, CreateRoom, CardView, CardFace (SVG deck), RulesPanel,
                Modal, BuildFooter
lib/cards.ts    Deck, rank/suit ordering, seeded shuffle and deal
lib/combos.ts   Combination detection, comparison, legal move generation
lib/engine.ts   Round state machine: play, pass, trick clearing, round end
lib/scoring.ts  Hong Kong penalty multipliers
lib/ai.ts       Opponent policies
lib/strategy.ts Exact minimum-plays hand decomposition
lib/sound.ts    Web Audio sound effects
lib/room.ts     Multiplayer room model: seats, intents, redaction
lib/server/     api (every endpoint), room storage (Upstash REST + memory),
                crypto, rate limiting, HTTP helpers
public/         updates.txt (changelog)
bench/          Self-play tournament between styles (npm run bench)
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
* **No AI style passes while it holds a legal play.** This is the requested behavior, not an
  oversight. It also survived measurement: a competitive variant that passes to protect its hand
  wins more rounds but loses on chips, because the multipliers punish the hands it holds. If you
  change this, re-run `npm run bench` and put the numbers in the commit message.
* **`legalMovesFor` returns ascending strength.** The "lowest legal play" AI, the competitive AI's
  tie-breaks and the Hint button all depend on it, and a test asserts the ordering.
* **`lib/strategy.ts` solves for the true minimum, not a greedy partition.** The bitmask DP is what
  makes the competitive tier work; a greedy decomposition gets hands like five pairs that are really
  two straight flushes badly wrong. A test pins that case.
* **Ruleset conventions that differ between houses** live in `lib/combos.ts` and are documented in
  `README.md` and `RulesPanel.tsx`. Two in particular: flushes compare by **suit first**, then rank;
  straights run over 3…A,2 with **no wrap-around**, so A-2-3-4-5 is not a straight. If you change
  either, change all three places.
* **Four cards are not a playable shape.** Quads are only playable as a five-card hand.
* **The multiplayer server is the only authority.** `lib/room.ts` re-checks every move with the same
  `validatePlay` the client uses, and matches card ids against the seat's real hand. Never trust a
  client-side legality check.
* **The deal seed never goes over the wire, and a client only ever gets its own cards.** The seed
  reproduces all four hands, so leaking it leaks the deal. `publicRoom()` is the only thing that
  should ever be serialized to a player, and a test asserts both properties.
* **The table display is a public screen and never receives a hand.** It has its own token and its
  own role: it holds no cards, and it is the only client allowed to call `/control`. A test asserts
  both halves.
* **A seat is identified by its token, not by the room password.** The password admits you to the
  room; the per-seat token says which seat you are. Collapsing the two lets anyone with the password
  move as anyone.
* **Endpoints live in `lib/server/api.ts`, not in `app/api/**`.** Route files are two-line adapters
  onto plain `Request` -> `Response` functions. That is what makes the HTTP layer testable without a
  server, so keep new endpoints there and keep the adapters empty of logic.
* **The password endpoints are rate limited.** PBKDF2 means every guess costs server time, so an
  unthrottled endpoint is both a guessing oracle and a bill. Limits are per caller *and* per room —
  dropping the room-wide one lets an attacker rotate IPs.
* **Room writes are compare-and-set on the version.** Requests interleave across serverless
  instances, so an unconditional write silently drops concurrent moves.

## Working on the code

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # must pass before a PR
npm test           # node:test, no extra dependencies — needs Node 22+
npm run typecheck
npm run bench      # self-play tournament; LINEUP=a,b,c,d overrides the seats
```

CI runs typecheck, tests and build on every pull request (`.github/workflows/ci.yml`). The bench is
not part of CI — it takes minutes, and the strength assertion in `test/ai.test.ts` is the cheap
version of the same check.

Tests run TypeScript directly through Node's built-in type stripping, so `lib/` and `test/` must stay
**erasable** TypeScript: no `enum`, no constructor parameter properties, and type-only imports must
use `import type`. This only bites when a test imports the file — `lib/server/store.ts` carried a
constructor parameter property for two PRs before the HTTP tests reached it. Files under `lib/` import each other with explicit `.ts` extensions for the same
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
* `TableView` owns the table layout and holds no game logic; single player builds its props from a
  local `GameState`, the online table from the redacted server view. Seats arrive already rotated so
  the viewer sits at the bottom. Change the layout there, not in one of the two tables.
* The build footer reads `public/updates.txt` at runtime and fails silently if it is missing.
  Version and build stamp are inlined at build time by `next.config.mjs`.
* Card size lives in three `:root` variables — `--card-w`, `--card-h`, `--hand-overlap`. The hand is
  one non-wrapping overlapping row; a context that needs a different size sets the variables rather
  than adding rules. Media queries that change them must come after the wider ones, since they share
  specificity.
* Cards are SVG drawn by `CardFace.tsx` on a 100x140 grid — no image assets. Suit shapes are authored
  in a 0..100 box and scaled at the point of use, so a new pip position is a coordinate, not a new
  asset. Court emblems inherit the suit colour from the parent group, which is why that group sets
  both `fill` and `color`.
* Animation is CSS-only and lives in `globals.css`. Replaying an animation means changing a React
  `key` (the pile is keyed on the played cards, the hand on the round), not toggling a class. Every
  animation must stay behind the `prefers-reduced-motion` block at the end of the stylesheet.
* Shared client behaviour lives in `components/hooks.ts` — turn signals, keyboard shortcuts, the
  auto-pass timer. Both tables use them, so a change lands in both.
* Sound is synthesized in `lib/sound.ts`; do not add audio files. Browsers block audio until a user
  gesture, so `unlock()` runs on the first pointer or key event and `play()` is a no-op before that.
  Game events are turned into sound in one place — the effect in `GameTable` that walks new
  `state.log` entries — so a new game event only needs a log entry and a recipe.
