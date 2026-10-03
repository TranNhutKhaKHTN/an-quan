-- Ô Ăn Quan: multiplayer schema.
-- All writes go through the Next.js server (service role) and the RPC functions below.
-- Clients only get SELECT (via RLS) so they can use Supabase Realtime.

create extension if not exists pgcrypto;

/* ------------------------------------------------------------------ tables */

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  avatar text not null default '🐯' check (char_length(avatar) <= 8),
  created_at timestamptz not null default now()
);

create table public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  player_limit smallint not null check (player_limit between 2 and 4),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'closed')),
  is_public boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  creation_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, creation_key)
);
create index game_rooms_public_lobby_idx on public.game_rooms (created_at desc)
  where is_public and status = 'lobby';

create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seat smallint not null check (seat between 0 and 3),
  display_name text not null check (char_length(display_name) between 1 and 24),
  avatar text not null default '🐯',
  ready boolean not null default false,
  wants_rematch boolean not null default false,
  last_seen timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  unique (room_id, user_id),
  -- deferred so seats can be re-numbered in one statement when the game starts
  constraint game_players_room_seat_key unique (room_id, seat) deferrable initially deferred
);
create index game_players_user_idx on public.game_players (user_id);

-- Reconnect tokens live apart from game_players so they can never reach other clients.
create table public.player_secrets (
  player_id uuid primary key references public.game_players (id) on delete cascade,
  token_hash text not null unique
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.game_rooms (id) on delete cascade,
  round integer not null default 1,
  state jsonb not null,
  version integer not null default 0,
  turn smallint not null,
  status text not null default 'playing' check (status in ('playing', 'finished')),
  turn_deadline timestamptz,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index game_sessions_active_idx on public.game_sessions (room_id) where status = 'playing';

create table public.game_moves (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  round integer not null,
  version integer not null, -- resulting version
  seat smallint not null,
  move jsonb not null,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (room_id, round, version),
  unique (room_id, idempotency_key)
);

create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  round integer not null,
  scores integer[] not null,
  winners smallint[] not null,
  reason text not null,
  finished_at timestamptz not null default now(),
  unique (room_id, round)
);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

/* ---------------------------------------------------------------- security */

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.game_players where room_id = p_room_id and user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.game_rooms enable row level security;
alter table public.game_players enable row level security;
alter table public.player_secrets enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_moves enable row level security;
alter table public.game_results enable row level security;
alter table public.rate_limits enable row level security;

create policy "own profile" on public.profiles for select using (id = auth.uid());
create policy "members read room" on public.game_rooms for select using (public.is_room_member(id));
create policy "members read players" on public.game_players for select using (public.is_room_member(room_id));
create policy "members read session" on public.game_sessions for select using (public.is_room_member(room_id));
create policy "members read moves" on public.game_moves for select using (public.is_room_member(room_id));
create policy "members read results" on public.game_results for select using (public.is_room_member(room_id));
-- player_secrets and rate_limits: RLS on, no policies => only the service role can touch them.

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.game_rooms, public.game_players, public.game_sessions,
  public.game_moves, public.game_results to authenticated;
grant all on all tables in schema public to service_role;

/* --------------------------------------------------------------- functions */

-- Atomically take the lowest free seat. Idempotent for an existing member.
create or replace function public.join_room(
  p_room_id uuid, p_user_id uuid, p_name text, p_avatar text, p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms;
  v_player public.game_players;
  v_seat int;
begin
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into v_player from public.game_players where room_id = p_room_id and user_id = p_user_id;
  if found then
    update public.game_players set display_name = p_name, avatar = p_avatar, last_seen = now()
      where id = v_player.id returning * into v_player;
    insert into public.player_secrets (player_id, token_hash) values (v_player.id, p_token_hash)
      on conflict (player_id) do update set token_hash = excluded.token_hash;
    return to_jsonb(v_player);
  end if;

  if v_room.status <> 'lobby' then raise exception 'ROOM_NOT_JOINABLE'; end if;

  select s into v_seat
    from generate_series(0, v_room.player_limit - 1) s
    where not exists (select 1 from public.game_players where room_id = p_room_id and seat = s)
    order by s limit 1;
  if v_seat is null then raise exception 'ROOM_FULL'; end if;

  insert into public.game_players (room_id, user_id, seat, display_name, avatar, ready)
    values (p_room_id, p_user_id, v_seat, p_name, p_avatar, p_user_id = v_room.owner_id)
    returning * into v_player;
  insert into public.player_secrets (player_id, token_hash) values (v_player.id, p_token_hash);
  update public.game_rooms set updated_at = now() where id = p_room_id;
  return to_jsonb(v_player);
end;
$$;

-- Leave while in the lobby: hands ownership to the next seat, closes the room when empty.
create or replace function public.leave_lobby(p_room_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms;
  v_next uuid;
begin
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'lobby' then raise exception 'ROOM_NOT_IN_LOBBY'; end if;

  delete from public.game_players where room_id = p_room_id and user_id = p_user_id;
  if not found then raise exception 'NOT_A_MEMBER'; end if;

  select user_id into v_next from public.game_players where room_id = p_room_id order by seat limit 1;
  if v_next is null then
    update public.game_rooms set status = 'closed', updated_at = now() where id = p_room_id;
  elsif v_room.owner_id = p_user_id then
    update public.game_rooms set owner_id = v_next, updated_at = now() where id = p_room_id;
    update public.game_players set ready = true where room_id = p_room_id and user_id = v_next;
  else
    update public.game_rooms set updated_at = now() where id = p_room_id;
  end if;
end;
$$;

-- Start the first game (from 'lobby') or a rematch (from 'finished'), atomically.
create or replace function public.start_round(
  p_room_id uuid, p_from_status text, p_state jsonb, p_turn int, p_deadline timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms;
  v_count int;
  v_session public.game_sessions;
begin
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> p_from_status then raise exception 'BAD_STATUS'; end if;

  select count(*) into v_count from public.game_players where room_id = p_room_id;
  if v_count <> v_room.player_limit then raise exception 'NOT_ENOUGH_PLAYERS'; end if;

  -- compact seats to 0..n-1 (the unique seat constraint is deferred)
  with ordered as (
    select id, (row_number() over (order by seat) - 1) as new_seat
    from public.game_players where room_id = p_room_id
  )
  update public.game_players p set seat = o.new_seat from ordered o where p.id = o.id;

  update public.game_players set wants_rematch = false, ready = (user_id = v_room.owner_id) where room_id = p_room_id;

  insert into public.game_sessions (room_id, round, state, version, turn, status, turn_deadline)
    values (p_room_id, 1, p_state, 0, p_turn, 'playing', p_deadline)
  on conflict (room_id) do update
    set round = public.game_sessions.round + 1, state = excluded.state, version = 0,
        turn = excluded.turn, status = 'playing', turn_deadline = excluded.turn_deadline,
        started_at = now(), updated_at = now()
  returning * into v_session;

  update public.game_rooms set status = 'playing', updated_at = now() where id = p_room_id;
  return to_jsonb(v_session);
end;
$$;

-- Commit one validated move. Fails with STALE_VERSION unless the session is still at p_expected_version.
create or replace function public.commit_move(
  p_room_id uuid, p_expected_version int, p_new_version int, p_state jsonb, p_status text,
  p_turn int, p_deadline timestamptz, p_seat int, p_move jsonb, p_key text, p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round int;
begin
  if p_key is not null and exists (
    select 1 from public.game_moves where room_id = p_room_id and idempotency_key = p_key
  ) then
    return jsonb_build_object('replayed', true);
  end if;

  update public.game_sessions
     set state = p_state, version = p_new_version, turn = p_turn, status = p_status,
         turn_deadline = p_deadline, updated_at = now()
   where room_id = p_room_id and version = p_expected_version and status = 'playing'
  returning round into v_round;
  if not found then raise exception 'STALE_VERSION'; end if;

  insert into public.game_moves (room_id, round, version, seat, move, idempotency_key)
    values (p_room_id, v_round, p_new_version, p_seat, p_move, p_key);

  if p_status = 'finished' then
    insert into public.game_results (room_id, round, scores, winners, reason)
      values (
        p_room_id, v_round,
        array(select jsonb_array_elements_text(p_result -> 'scores')::int),
        array(select jsonb_array_elements_text(p_result -> 'winners')::smallint),
        p_result ->> 'reason'
      )
      on conflict (room_id, round) do nothing;
    update public.game_rooms set status = 'finished', updated_at = now() where id = p_room_id;
  end if;
  return jsonb_build_object('replayed', false, 'version', p_new_version, 'round', v_round);
end;
$$;

-- Move a seat to a new (anonymous) identity after the holder proved they own its session token.
create or replace function public.rebind_player(p_player_id uuid, p_new_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.game_players;
begin
  select * into v_player from public.game_players where id = p_player_id for update;
  if not found then raise exception 'NOT_A_MEMBER'; end if;
  if exists (select 1 from public.game_players where room_id = v_player.room_id and user_id = p_new_user_id) then
    raise exception 'ALREADY_MEMBER';
  end if;
  update public.game_rooms set owner_id = p_new_user_id
    where id = v_player.room_id and owner_id = v_player.user_id;
  update public.game_players set user_id = p_new_user_id, last_seen = now() where id = p_player_id;
end;
$$;

-- Fixed-window rate limiter that works across serverless instances.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                        then now() else r.window_start end,
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                 then 1 else r.count + 1 end
  returning count into v_count;
  return v_count <= p_max;
end;
$$;

revoke execute on function
  public.join_room, public.leave_lobby, public.start_round, public.commit_move, public.rate_limit_hit,
  public.rebind_player
  from public, anon, authenticated;
grant execute on function
  public.join_room, public.leave_lobby, public.start_round, public.commit_move, public.rate_limit_hit,
  public.rebind_player
  to service_role;

/* ---------------------------------------------------------------- realtime */

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.game_rooms, public.game_players, public.game_sessions, public.game_moves, public.game_results;
  end if;
end $$;
