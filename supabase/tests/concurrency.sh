#!/bin/sh
# Races two real connections: only one may win the last seat / the same version.
# Usage: PSQL="psql -h 127.0.0.1 -p 54399 -U postgres -q -t -A" DB=t ./concurrency.sh
set -eu
PSQL=${PSQL:?set PSQL}
DB=${DB:-postgres}
q() { $PSQL "$DB" -c "$1"; }
for i in 1 2 3 4; do q "insert into auth.users(id) values ('a0000000-0000-0000-0000-00000000000$i') on conflict do nothing"; done
q "delete from public.game_rooms where code = 'RACE01'"
q "insert into public.game_rooms(id, code, owner_id, player_limit) values ('b0000000-0000-0000-0000-000000000001','RACE01','a0000000-0000-0000-0000-000000000001',2)"
q "select public.join_room('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','A','x','h')" >/dev/null

# two players race for the single remaining seat
out=$( (q "select public.join_room('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','B','x','h2')" 2>&1 & \
        q "select public.join_room('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','C','x','h3')" 2>&1 & wait) )
wins=$(echo "$out" | grep -c '"seat"' || true)
[ "$wins" = "1" ] || { echo "FAIL: $wins players got the last seat"; echo "$out"; exit 1; }
n=$(q "select count(*) from public.game_players where room_id='b0000000-0000-0000-0000-000000000001'")
[ "$n" = "2" ] || { echo "FAIL: room has $n players"; exit 1; }

q "select public.start_round('b0000000-0000-0000-0000-000000000001','lobby','{}',0,null)" >/dev/null
# two moves race on version 0
out=$( (q "select public.commit_move('b0000000-0000-0000-0000-000000000001',0,1,'{}','playing',1,null,0,'{}','m1',null)" 2>&1 & \
        q "select public.commit_move('b0000000-0000-0000-0000-000000000001',0,1,'{}','playing',1,null,1,'{}','m2',null)" 2>&1 & wait) )
wins=$(echo "$out" | grep -c 'replayed' || true)
stale=$(echo "$out" | grep -c 'STALE_VERSION' || true)
[ "$wins" = "1" ] && [ "$stale" = "1" ] || { echo "FAIL: wins=$wins stale=$stale"; echo "$out"; exit 1; }
n=$(q "select count(*) from public.game_moves where room_id='b0000000-0000-0000-0000-000000000001'")
[ "$n" = "1" ] || { echo "FAIL: $n moves stored"; exit 1; }
echo "CONCURRENCY TESTS PASSED"
