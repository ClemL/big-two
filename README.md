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
npm run bench    # self-play tournament between the opponent styles
```

Node 22 or newer is required — the tests run TypeScript directly through Node's
built-in type stripping.

## Deploying to Vercel

Live at <https://clem-big-two.vercel.app/>, built by the pipeline at
<https://vercel.com/clem21/clem-big-two>.

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

All three styles share one rule: **they never pass while they hold a legal
play**. Selectable mid-match from the header.

| Style | Behavior |
| --- | --- |
| Lowest legal play (default) | Plays the lowest-quality legal combination available: smallest shape, lowest category, lowest value. Dribbles low singles and hoards big cards. |
| Random legal play | Picks uniformly at random among every legal play. |
| Competitive | Plans the hand into the fewest possible plays and protects that plan. |

The competitive tier works from an exact hand decomposition (`lib/strategy.ts`).
"How many turns do I still need?" is an exact-cover problem over the
combinations a hand contains, and at 13 cards it is small enough to solve
exactly with a bitmask DP rather than a greedy pass:

```
best[mask] = 1 + min over combos c ⊆ mask of best[mask \ c]
```

Pinning each step to the lowest remaining card removes duplicate permutations
of the same partition, which keeps a full 13-card plan at roughly 4 ms.

On top of that plan the policy is:

* a move that empties the hand is played immediately;
* a move is **efficient** when it consumes exactly one group of the optimal
  partition — the hand needs one fewer play afterwards;
* leading, it plays the largest efficient group, except against an opponent
  down to one card, where it leads a shape they cannot legally answer;
* following, it plays the cheapest efficient move, and when nothing is
  efficient, the move that damages the plan least.

### Measured strength

`npm run bench` runs a self-play tournament with the seat assignment rotating by
seed so the 3♦ lead averages out. Against two lowest-legal opponents and one
random opponent over 400 rounds:

| Style | Win rate | Chips per round |
| --- | --- | --- |
| Competitive | 48.3% | +8.20 |
| Lowest legal play | 22.8% | −3.59 |
| Random legal play | 6.3% | −4.60 |

The baseline for four players is 25%.

Strategic passing — declining to break up a group when nothing efficient is
available — was implemented and measured rather than assumed. Over 1000 rounds
head to head it wins more rounds (26.6% against 23.4%) but loses on chips
(−0.70 a round against +0.70): the hands it holds on to get caught by the
penalty multipliers. Hong Kong scoring counts chips, so the shipped policy
contests instead.

## Project layout

```
app/            Next.js App Router entry, global stylesheet, icon
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
lib/server/     Room storage (Upstash REST + memory), crypto, request helpers
public/         updates.txt (changelog)
bench/          Self-play tournament (npm run bench)
test/           node:test unit tests, including 450 simulated self-play rounds
```

The game engine is pure: `startRound`, `applyPlay` and `applyPass` return new
state objects and never mutate their input, and dealing runs off a seeded PRNG
(`mulberry32`) so any round can be replayed by seed. The React layer holds one
`GameState` and re-renders from it.

## Multiplayer

Four humans, any mix of humans and AI, no accounts. `/play` starts a table with
a password and hands back a six-character room code; everyone else opens
`/room/<code>`, clicks a seat and enters the password. **Seats nobody takes are
played by the AI**, so a round works with one human or four.

### How a seat is identified

The password gets you into the room. It does *not* identify you — on its own,
anyone who knows it could submit moves as any seat. Claiming a seat returns a
random 32-byte **seat token**, stored as an httpOnly cookie, and the server keeps
only its SHA-256 hash. Every move is authorised by that token, not the password.
Passwords are stored as PBKDF2-SHA256 (100k iterations) with a per-room salt.

A seat silent for three minutes is treated as away: the AI plays its turns and
someone else may claim it.

### What the server keeps to itself

The server is the only authority, and two rules follow:

1. **The deal seed never leaves the server.** `mulberry32(seed)` reproduces every
   hand, so publishing the seed publishes the whole deal.
2. **A client is only ever sent its own cards.** Everyone else is a count.

Move legality is re-checked server side with the same `validatePlay` the client
uses — the client check is only there for a fast error message. Cards are matched
against the seat's actual hand, so a forged card id is rejected rather than
played.

### Transport

Turn-based polling, not sockets. Clients poll `GET /api/rooms/:id/version`,
which is a ~200 byte payload, and fetch the full state only when the version
moves. Polling pauses when the tab is hidden and resumes on focus.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/rooms` | Start a table (password, AI style for empty seats) |
| `POST /api/rooms/:id/join` | Claim a seat, receive the seat cookie |
| `DELETE /api/rooms/:id/join` | Give the seat back to the AI |
| `GET /api/rooms/:id/version` | Cheap poll: version, turn, seat status |
| `GET /api/rooms/:id/state` | Full state, redacted for the caller's seat |
| `POST /api/rooms/:id/move` | Play, pass or start the next round |
| `POST /api/rooms/:id/table` | Claim the shared table display |
| `DELETE /api/rooms/:id/table` | Release it |
| `POST /api/rooms/:id/control` | Table only: next round, restart match, adjust a score |

Writes are compare-and-set on the room version. Serverless instances share no
memory and requests interleave, so "read, decide, write" without a version check
would silently drop one of two moves submitted at the same moment. On Upstash
that is a small Lua script; the version lives in its own key so the check needs
no JSON parsing inside Redis.

### Storage

Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (see `.env.example`).
Provision Upstash Redis from the Vercel Marketplace — Vercel's own KV product was
retired in December 2024. There is no SDK dependency; the REST protocol is one
JSON array per command.

Without those variables the app falls back to an in-process Map. That is fine for
`npm run dev` and for the tests, and wrong for a deployment: serverless instances
do not share memory. `POST /api/rooms` reports which store is in use, and the
server logs a warning in production.

A room is about 2 KB and expires after a week of silence. Four players polling
the version endpoint every 3 seconds is roughly 80 requests a minute for the
table.

## The table display

One device can act as the table itself — a tablet lying in the middle of the
real one. Open `/room/<code>/table` on it and enter the same table password.

It shows:

* the current hand to beat, in large cards, animated in from the seat that
  played it;
* the last three plays before that, so a trick can be reconstructed after an
  argument;
* every seat's name, card count and running score;
* which seat number sits where — the four panels are drawn at the four edges,
  so the numbers double as a seating plan.

It is also the only client that can run the match: deal the next round, restart
the match with the chips back to zero, and adjust any seat's score by ±1 or ±5
when something needs settling by hand. A phone calling those endpoints gets a
403; the table holds its own token, exactly as a seat does.

**The table never receives anybody's cards.** It is a screen the whole room can
see, so `publicRoom()` withholds every hand from it, and a test asserts that.

### Phones shrink while the table is running

With a table display active, the shared state is already in front of everyone,
so the player view drops to what a phone actually needs: your hand, your
buttons, and one line naming what is on the table. The seats, scoreboard, pile
and log all disappear. Release the table and the phones return to the full
layout on their next poll.

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

## Presentation

* **Cards fan out and overlap.** The hand is one non-wrapping row of large cards
  sharing a negative margin, sized from `--card-w` / `--card-h` and
  `--hand-overlap` on `:root`, so a context can resize the deck by setting three
  variables. The overlap tightens on narrow screens so all 13 cards still fit a
  390px phone without scrolling.
* **Cards are SVG**, drawn from suit paths and pip layouts in `components/CardFace.tsx` — no image
  assets, crisp at any size, and the standard French-deck arrangement including rotated bottom-half
  pips and mirrored corner indices.
* **Motion** is CSS-only: hands deal in staggered, played cards fly in from the seat that threw them,
  the active seat pulses, dialogs fade and lift. Everything collapses under
  `prefers-reduced-motion: reduce`.
* **Sound** is synthesized at runtime with the Web Audio API (`lib/sound.ts`) — noise bursts for card
  flicks, short tones for selection, passing and the end-of-round fanfares. Nothing is downloaded.
  Browsers require a user gesture before audio starts, so the context is created on first
  interaction. The speaker button mutes, and the preference is stored in `localStorage`.

## Controls

- Click cards to select them, then **Play**. Illegal selections are explained
  before you commit them.
- **Pass** is disabled when you are leading, since a lead must be a real play.
- **Hint** selects the lowest legal play for you — the same policy the default AI
  uses.
- **Sort** toggles the hand between rank order and suit order.
- **New match** reshuffles and resets the running chip totals.
