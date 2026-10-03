# Ô Ăn Quan

Vietnamese board game for 2, 3 or 4 players. Next.js (App Router) + Supabase, deployable on Vercel.

* **Play against bots:** `/play/bot?players=2|3|4&level=easy|medium|hard` (you are seat 0, the rest are bots).
* **Play on one device:** `/play/local?players=2|3|4`
* **Play online (rooms):** create a room, share the code or invite link, friends join, host starts.
  The UI offers 2- or 3-player rooms; the engine, schema and API also support 4.
  **The create/join buttons are currently hidden**; set `NEXT_PUBLIC_ENABLE_ONLINE_ROOMS=true` (build time) to show them.
  The API, pages and tests are untouched, so existing invite links still work.

### Background

The game-wide artwork is `public/images/bg.jpg`, drawn by a fixed `body::before` layer in `globals.css`
(not `background-attachment: fixed`, which iOS ignores). Text that sits directly on the art uses the
`.on-bg` cream plate so it stays readable; cards and the board have their own backgrounds.

### Turn clock

Local and bot games give each person **10 seconds per turn** (`TURN_SECONDS` in `src/features/game/timer.ts`).
The clock runs only while a person can act: it pauses while pieces are moving and during a bot's turn.
When it reaches zero the first legal move is played for them (the same default move the server uses for
online rooms) and the history marks it with ⏱. Online rooms have their own server-enforced timer, now
including a 10 s option.

### Bots

`src/features/game/bot.ts` (pure, seedable): *easy* plays a random legal move, *medium* picks the best
immediate result, *hard* runs a paranoid alpha-beta search (4 plies for 2 players, 3 for 3-4). Over seeded
2-player games medium beat easy 27/30 and hard beat medium 20/20.

Rules and the 3/4-player adaptations: [docs/RULES.md](docs/RULES.md).

## Architecture

| Layer | Where | Notes |
|---|---|---|
| Game engine | `src/features/game/engine` | Pure, deterministic TypeScript. No React/Next/Supabase. |
| Game service | `src/features/multiplayer/services/gameService.ts` | Rooms, start, moves, surrender, rematch, reconnect, turn timeout. Talks to a `Store` interface. |
| Store | `supabaseStore.ts` | Supabase implementation; atomic work happens in SQL RPC functions. |
| API | `src/app/api/**` | Node runtime route handlers, Zod validation, bearer-token auth. |
| Realtime | `services/realtime.ts`, `hooks/useRoom.ts` | Postgres changes + presence. Events only *hint*; clients re-read the API snapshot. |
| Database | `supabase/migrations` | Tables, RLS (members can only `SELECT`), RPC functions. |

Key guarantees:

* **Server authoritative.** Clients send only `(cell, direction, expectedVersion)`. The server replays the engine on the stored state; scores, turn and winners are never taken from clients.
* **Optimistic concurrency.** `commit_move` is a compare-and-set on `game_sessions.version`; concurrent moves on one version → exactly one wins (`STALE_VERSION` for the rest).
* **Idempotency.** Move keys are unique per room (retries are harmless); room creation is idempotent per `(owner, key)`; timeouts/surrenders use deterministic keys.
* **Stateless functions.** No in-memory game state. Rate limiting is a DB-backed fixed window (`rate_limit_hit`) so it works across instances.
* **Reconnect.** Each seat has a secret session token (only its SHA-256 is stored, in `player_secrets`, unreadable by clients). `POST /api/games/[room]/reconnect` with the token moves the seat to a new anonymous identity.
* **Secrets.** The service-role key is only read in `src/lib/supabase/admin.ts` (`server-only`).

## Local setup

```bash
npm install
cp .env.example .env.local       # fill in your Supabase values
npm run dev                      # http://localhost:3000
```

Supabase:

1. Create a project (or run `npx supabase start` locally, which needs Docker).
2. Authentication → Providers → **enable "Anonymous sign-ins"** (guests).
3. Apply the schema: `npx supabase db push`, or paste `supabase/migrations/20261003000000_init.sql` into the SQL editor.
4. Database → Replication: the migration adds the game tables to the `supabase_realtime` publication; check they are listed.
5. Copy URL, anon key and service-role key into `.env.local`.

Without Supabase variables the home page still offers local play; online buttons are disabled.

## Tests

```bash
npm test                  # Vitest: engine, bots, geometry, GameService integration (77 tests)
npm run e2e               # Playwright: local play (needs `npm run dev` or starts one)
npm run e2e:online        # Playwright: rooms/lobby/online play, desktop + mobile (builds .next-e2e)
```

SQL (needs a Postgres; the stub creates the `auth` schema and roles Supabase would provide):

```bash
psql "$DB" -f supabase/tests/stub_auth.sql                    # plain Postgres only, not on Supabase
psql "$DB" -f supabase/migrations/20261003000000_init.sql
psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/rpc_and_rls.sql
PSQL="psql -q -t -A" DB=mydb sh supabase/tests/concurrency.sh # real two-connection races
```

What is and is not covered: the online E2E suite runs the real routes, validation and `GameService`
against an in-memory store with a browser-side fake of Supabase Auth/Realtime
(`e2e-online/support/fakeSupabase.ts`, enabled only by `E2E_FAKE_BACKEND=1`, ignored on Vercel).
The SQL functions and RLS are tested on plain Postgres. Not covered by automated tests: a live
Supabase project (real Auth, Realtime, PostgREST). Smoke-test that once after deploying.

## Deploy to Vercel

1. Push the repo and import it in Vercel (framework: Next.js, Node runtime, nothing else to configure).
2. Add environment variables for **Production** and **Preview** (use a separate Supabase project for Preview):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (mark it Sensitive).
3. Run the migration against each Supabase project.
4. In Supabase → Auth → URL configuration, add your Vercel domain(s).

Routes declare `runtime = "nodejs"`; each request does a handful of short queries, well inside Vercel limits.
Reads retry on transient network errors; writes are never blindly retried server-side (clients retry with idempotency keys).

## Share previews (Open Graph)

Sharing the site or a room invite link shows a title, description and a 1200x630 image.
The image is `src/app/opengraph-image.png` (also copied to `twitter-image.png`); regenerate it after
editing the design with `node scripts/generate-og-image.mjs` (rendered by Chromium so Vietnamese
diacritics are exact). Set `NEXT_PUBLIC_SITE_URL` to your public origin; on Vercel it falls back to
the deployment URL. Invite pages (`/lobby/CODE`) are `noindex`. Chat apps cache previews, so after
changing the image use their debugger/refresh tool (for example Facebook's Sharing Debugger).

## Online flow

1. Home → **Tạo phòng**: name, avatar, 2 or 3 players, public/private, turn timer.
2. Lobby `/lobby/CODE`: copy the code or the invite link (or use the share sheet on phones).
3. Friends open the link (or **Vào phòng** → code / public list), pick a name and join; they press **Sẵn sàng**.
4. Host presses **Bắt đầu**; everyone is sent to `/game/CODE`.
5. After the game: **Chơi lại** (starts when everyone asked), or leave. Moves from other players are
   replayed locally through the same deterministic engine, so you see their sowing animated.

Known limits: a player who disconnects keeps their seat (they can return any time with the same
browser or token); with a turn timer, an absent player's turn is auto-played by the server when any
connected client reports the expired deadline. Lobby seats are not auto-released on disconnect.
