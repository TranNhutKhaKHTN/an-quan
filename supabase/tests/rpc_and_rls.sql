-- Run after the migration: psql -v ON_ERROR_STOP=1 -f supabase/tests/rpc_and_rls.sql
-- Every check is an assert; any failure aborts the script.
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003');

insert into public.game_rooms (id, code, owner_id, player_limit)
  values ('10000000-0000-0000-0000-000000000001', 'ABC123', '00000000-0000-0000-0000-000000000001', 2);

do $$
declare
  r1 constant uuid := '10000000-0000-0000-0000-000000000001';
  u1 constant uuid := '00000000-0000-0000-0000-000000000001';
  u2 constant uuid := '00000000-0000-0000-0000-000000000002';
  u3 constant uuid := '00000000-0000-0000-0000-000000000003';
  p jsonb; n int; ok boolean; res jsonb;
begin
  -- joining -------------------------------------------------------------
  p := public.join_room(r1, u1, 'A', '🐯', 'hash1');
  assert (p ->> 'seat')::int = 0, 'owner takes seat 0';
  assert (p ->> 'ready')::boolean, 'owner is ready by default';
  p := public.join_room(r1, u2, 'B', '🐲', 'hash2');
  assert (p ->> 'seat')::int = 1, 'second player takes seat 1';
  p := public.join_room(r1, u2, 'B2', '🐲', 'hash2b');
  assert (p ->> 'seat')::int = 1 and p ->> 'display_name' = 'B2', 'rejoin is idempotent';
  begin
    perform public.join_room(r1, u3, 'C', '🦜', 'hash3');
    assert false, 'full room must reject';
  exception when others then
    assert sqlerrm = 'ROOM_FULL', 'expected ROOM_FULL got ' || sqlerrm;
  end;

  -- RLS -----------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
  select count(*) into n from public.game_rooms; assert n = 0, 'non-member sees no rooms';
  select count(*) into n from public.game_players; assert n = 0, 'non-member sees no players';
  reset role;

  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  select count(*) into n from public.game_players; assert n = 2, 'member sees room players';
  begin
    perform 1 from public.player_secrets; assert false, 'secrets must be unreadable';
  exception when insufficient_privilege then null; end;
  begin
    update public.game_players set seat = 3; assert false, 'clients cannot write';
  exception when insufficient_privilege then null; end;
  begin
    perform public.commit_move(r1, 0, 1, '{}', 'playing', 0, null, 0, '{}', null, null);
    assert false, 'clients cannot call rpc';
  exception when insufficient_privilege then null; end;
  reset role;

  -- starting ------------------------------------------------------------
  begin
    perform public.start_round(r1, 'finished', '{"v":0}', 0, null);
    assert false, 'wrong status';
  exception when others then assert sqlerrm = 'BAD_STATUS', sqlerrm; end;
  res := public.start_round(r1, 'lobby', '{"v":0}', 0, null);
  assert (res ->> 'round')::int = 1 and (res ->> 'version')::int = 0;
  begin
    perform public.start_round(r1, 'lobby', '{"v":0}', 0, null);
    assert false, 'double start';
  exception when others then assert sqlerrm = 'BAD_STATUS', sqlerrm; end;
  begin
    perform public.join_room(r1, u3, 'C', '🦜', 'hash3');
    assert false, 'cannot join a running game';
  exception when others then assert sqlerrm in ('ROOM_NOT_JOINABLE', 'ROOM_FULL'), sqlerrm; end;

  -- moves ---------------------------------------------------------------
  res := public.commit_move(r1, 0, 1, '{"v":1}', 'playing', 1, null, 0, '{"cell":1}', 'k1', null);
  assert not (res ->> 'replayed')::boolean;
  begin
    perform public.commit_move(r1, 0, 1, '{"v":9}', 'playing', 1, null, 0, '{"cell":2}', 'k2', null);
    assert false, 'stale';
  exception when others then assert sqlerrm = 'STALE_VERSION', sqlerrm; end;
  res := public.commit_move(r1, 0, 1, '{"v":1}', 'playing', 1, null, 0, '{"cell":1}', 'k1', null);
  assert (res ->> 'replayed')::boolean, 'same key replays instead of failing';
  select count(*) into n from public.game_moves where room_id = r1; assert n = 1, 'replay wrote nothing';

  res := public.commit_move(r1, 1, 2, '{"v":2}', 'finished', 1, null, 1, '{"cell":7}', 'k3',
                            '{"scores":[3,5],"winners":[1],"reason":"quan-captured"}');
  select count(*) into n from public.game_results where room_id = r1; assert n = 1;
  assert (select status from public.game_rooms where id = r1) = 'finished';
  begin
    perform public.commit_move(r1, 2, 3, '{}', 'playing', 0, null, 0, '{}', 'k4', null);
    assert false, 'no moves after finish';
  exception when others then assert sqlerrm = 'STALE_VERSION', sqlerrm; end;

  -- rematch -------------------------------------------------------------
  res := public.start_round(r1, 'finished', '{"v":0}', 0, null);
  assert (res ->> 'round')::int = 2 and (res ->> 'version')::int = 0, 'rematch bumps round';
  select count(*) into n from public.game_moves where room_id = r1; assert n = 2, 'history kept';
  res := public.commit_move(r1, 0, 1, '{"v":1}', 'playing', 1, null, 0, '{"cell":1}', 'k5', null);
  assert (res ->> 'round')::int = 2;

  -- rate limit ----------------------------------------------------------
  assert public.rate_limit_hit('x', 60, 2) and public.rate_limit_hit('x', 60, 2), 'within limit';
  assert not public.rate_limit_hit('x', 60, 2), 'over limit';
  assert public.rate_limit_hit('y', 60, 2), 'keys are independent';
end $$;

-- leaving the lobby: ownership moves, empty room closes, seats compact on start
do $$
declare
  u1 constant uuid := '00000000-0000-0000-0000-000000000001';
  u2 constant uuid := '00000000-0000-0000-0000-000000000002';
  u3 constant uuid := '00000000-0000-0000-0000-000000000003';
  r2 constant uuid := '20000000-0000-0000-0000-000000000002';
  res jsonb;
begin
  insert into public.game_rooms (id, code, owner_id, player_limit) values (r2, 'ROOM22', u1, 3);
  perform public.join_room(r2, u1, 'A', '🐯', 'h1');
  perform public.join_room(r2, u2, 'B', '🐲', 'h2');
  perform public.join_room(r2, u3, 'C', '🦜', 'h3');
  perform public.leave_lobby(r2, u2);                       -- seat 1 freed
  assert (select count(*) from public.game_players where room_id = r2) = 2;
  assert (public.join_room(r2, u2, 'B', '🐲', 'h2b') ->> 'seat')::int = 1, 'freed seat reused';
  perform public.leave_lobby(r2, u1);                       -- owner leaves
  assert (select owner_id from public.game_rooms where id = r2) = u2, 'ownership to lowest seat';
  assert (select ready from public.game_players where room_id = r2 and user_id = u2);
  perform public.join_room(r2, u1, 'A', '🐯', 'h1b');        -- seat 0 again
  perform public.leave_lobby(r2, u1);
  perform public.join_room(r2, u1, 'A', '🐯', 'h1c');
  perform public.leave_lobby(r2, u2);                       -- seats now {0:u1? 2:u3}
  perform public.join_room(r2, u2, 'B', '🐲', 'h2c');
  res := public.start_round(r2, 'lobby', '{}', 0, null);
  assert (select array_agg(seat order by seat) from public.game_players where room_id = r2) = array[0, 1, 2]::smallint[],
    'seats compacted';
  perform public.leave_lobby(r2, u1);
exception when others then
  assert sqlerrm = 'ROOM_NOT_IN_LOBBY', 'cannot leave lobby of a running game: ' || sqlerrm;
end $$;

-- reconnect: a new identity takes over a seat (and ownership)
do $$
declare
  u1 constant uuid := '00000000-0000-0000-0000-000000000001';
  u2 constant uuid := '00000000-0000-0000-0000-000000000002';
  u3 constant uuid := '00000000-0000-0000-0000-000000000003';
  r3 constant uuid := '30000000-0000-0000-0000-000000000003';
  pid uuid;
begin
  insert into public.game_rooms (id, code, owner_id, player_limit) values (r3, 'ROOM33', u1, 2);
  pid := (public.join_room(r3, u1, 'A', '🐯', 'x1') ->> 'id')::uuid;
  perform public.join_room(r3, u2, 'B', '🐲', 'x2');
  perform public.rebind_player(pid, u3);
  assert (select owner_id from public.game_rooms where id = r3) = u3, 'ownership follows the seat';
  assert (select seat from public.game_players where room_id = r3 and user_id = u3) = 0, 'seat kept';
  begin
    perform public.rebind_player(pid, u2);
    assert false, 'cannot rebind onto an existing member';
  exception when others then assert sqlerrm = 'ALREADY_MEMBER', sqlerrm; end;
end $$;

rollback;
select 'SQL TESTS PASSED' as result;
