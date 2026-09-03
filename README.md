# Big Two — Hong Kong Rules

A browser implementation of Hong Kong style Big Two (鋤大弟): you against three AI
opponents, 13 cards each, first player to shed every card wins the round.
Built as a static Next.js app, deployable to Vercel with no backend.

## Running locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm test         # engine + AI unit tests (node:test, no extra dependencies)
npm run typecheck
```

Node 22 or newer is required — the tests run TypeScript directly through Node's
built-in type stripping.

## Deploying to Vercel

The project is a stock Next.js App Router app, so no configuration is needed:

```bash
npx vercel        # preview deployment
npx vercel --prod # production deployment
```

Or import the repository at <https://vercel.com/new>; Vercel detects Next.js,
runs `next build`, and serves the single route as static content. The whole game
runs client side, so there are no environment variables or server functions.

## Rules implemented

| Element | Rule |
| --- | --- |
| Rank order | 3 4 5 6 7 8 9 10 J Q K A 2 (2 is highest) |
| Suit order | ♦ < ♣ < ♥ < ♠ |
| Opening | Holder of 3♦ leads, and the opening play must contain 3♦ |
| Shapes | 1, 2, 3 or 5 cards — four-card bombs are not a shape |
| Five-card order | straight < flush < full house < four of a kind + kicker < straight flush |
| Straight ties | Highest card, suit breaks the tie |
| Flush ties | Suit first, then card ranks from the top down (Hong Kong convention) |
| Full house ties | Rank of the triple |
| Quad ties | Rank of the quad |
| Straights | Run over 3…A,2 with no wrap-around: 3-4-5-6-7 lowest, J-Q-K-A-2 highest. A-2-3-4-5 is not a straight |
| Passing | Legal at any time except when leading; once everyone else passes, the table clears and the pile owner leads |
| Scoring | 1 chip per card left, ×2 at 8–9 cards, ×3 at 10–12, ×4 at 13. The winner collects the pot, so each round is zero-sum |

Rule variants differ between houses. Two choices worth flagging because other
tables play them differently: flushes are compared by suit before rank, and
straights do not wrap around the ace. Both are isolated in `lib/combos.ts` if you
want the alternative.

## Opponents

The three AI players share one hard constraint: **they never pass while they hold
a legal play**. They only pass when the table leaves them with nothing playable.
Two selectable styles, switchable mid-match from the header:

- **Lowest legal play** (default) — plays the lowest-quality legal combination
  available: smallest shape first, then the lowest category, then the lowest
  value. In practice they dribble out low singles and hold their big cards.
- **Random legal play** — picks uniformly at random among every legal play.

`lib/ai.ts` is roughly twenty lines; both styles are selections over the same
`legalMovesFor` list, which is returned in ascending strength order.

## Project layout

```
app/            Next.js App Router entry, global stylesheet, icon
components/     GameTable (all interaction), CardView, RulesPanel, Modal, BuildFooter
lib/cards.ts    Deck, rank/suit ordering, seeded shuffle and deal
lib/combos.ts   Combination detection, comparison, legal move generation
lib/engine.ts   Round state machine: play, pass, trick clearing, round end
lib/scoring.ts  Hong Kong penalty multipliers
lib/ai.ts       Opponent policies
public/         updates.txt (changelog)
test/           node:test unit tests, including 300 simulated self-play rounds
```

The game engine is pure: `startRound`, `applyPlay` and `applyPass` return new
state objects and never mutate their input, and dealing runs off a seeded PRNG
(`mulberry32`) so any round can be replayed by seed. The React layer holds one
`GameState` and re-renders from it.

## Changelog footer

The footer carries the version, build stamp and short commit SHA, followed by the most recent
changelog entry. Clicking that entry opens a dialog with the full history, newest first. Entries live
in `public/updates.txt`, one per line, appended **oldest first**:

```
2026-09-03T18:10:00Z - Initial release: ...
2026-09-03T19:05:00Z - Added a build footer with the changelog: ...
```

Lines are displayed verbatim, blank lines are ignored, and a missing or unreadable file leaves that
part of the footer empty rather than raising an error. Add a line whenever you ship a user-visible
change. Version and build stamp are inlined at build time by `next.config.mjs`; on Vercel the commit
SHA comes from `VERCEL_GIT_COMMIT_SHA`.

## Controls

- Click cards to select them, then **Play**. Illegal selections are explained
  before you commit them.
- **Pass** is disabled when you are leading, since a lead must be a real play.
- **Hint** selects the lowest legal play for you — the same policy the default AI
  uses.
- **Sort** toggles the hand between rank order and suit order.
- **New match** reshuffles and resets the running chip totals.
