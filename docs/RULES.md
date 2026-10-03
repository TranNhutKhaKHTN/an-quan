# Ô Ăn Quan — Rules and Board Model

The engine (`src/features/game/engine`) implements exactly what is written here.
Every number below is a field of `RuleConfig`, so variants need no code changes.

## Board representation

The board is a **ring of cells**. Each seat (player) owns one *side*: a **quan
cell** (the "corner") followed by `housesPerSide` (default 5) **dân houses**.

```
cell index = seat * (housesPerSide + 1) + offset
offset 0              -> quan cell (belongs to nobody)
offset 1..housesPerSide -> dân house owned by `seat`
```

| Players | Cells | Layout |
|---------|-------|--------|
| 2 | 12 | Classic: quan, 5 houses, quan, 5 houses |
| 3 | 18 | Triangle: three sides, three quan corners |
| 4 | 24 | Square: four sides, four quan corners |

Index `+1` is the `cw` direction, `-1` is `ccw`. Layout is static and derived from
the config; game *state* only stores `{dan, quan}` counts per cell, so it is plain
JSON (stored in a JSONB column unchanged).

Start: every house holds `danPerHouse` (5) dân, every quan cell holds 1 quan.
Scoring: dân = 1 point, quan = 10 points (`danValue`, `quanValue`).

## A turn (all player counts)

1. The player picks one of **their own non-empty houses** and a **direction**.
2. All pieces in it are picked up and sown one per cell along the ring.
3. After the last piece, look at the next cell `n1`:
   * `n1` is a **non-empty house** → pick it all up and keep sowing from there.
   * `n1` is a **non-empty quan cell** → the turn ends.
   * `n1` is **empty** → look at `n2` (the cell after it):
     * `n2` non-empty (and capturable) → **capture** everything in `n2`, then
       repeat the check from `n2`: if the next cell is empty and the one after
       it is non-empty, capture that too.
     * `n2` empty (or not capturable) → the turn ends.
4. Captured pieces go to the mover, whoever's territory they came from.
5. Quan cells are never picked up for sowing; they only receive pieces.
   A quan cell whose quan was captured stays on the board as an empty (plain
   dân-receiving) cell.
6. Safety cap: a single move stops after `maxSowSteps` (500) sown pieces.

## Running out of pieces (feeding / "rải quân")

At the start of a player's turn, if all their houses are empty they must
**borrow**: `feedCount` (5) of their *captured dân* go back onto the board, one
per house. If they have fewer than `feedCount` captured dân they are
**eliminated**. An eliminated player is skipped in turn order; their cells stay
on the board and can still be sown into and captured from.

## End of the game

The game ends when **either**
* all quan have been captured, **or**
* only one non-eliminated player remains (others ran out or surrendered).

On ending, each player collects the dân remaining in the houses on their side
(this includes eliminated players' sides, for score purposes only). Dân left in
a quan cell with no quan go to the player who made the final move.

**Winner:** highest total among non-eliminated players. Several players sharing the
top score is a **draw** (`winners.length > 1`). Surrendering eliminates you.

## Adaptations for 3 and 4 players (non-traditional)

The traditional game is 2-player only. For 3/4 players we apply the *same* sowing
and capture rules on a longer ring, and decide the following ourselves:

* **Territory:** each seat owns exactly the `housesPerSide` houses after its corner.
* **Turn order:** seat order `0,1,2,(3)`, cyclic, skipping eliminated seats.
* **Direction:** the mover chooses either direction every turn.
* **Capturing:** a mover may capture from any territory, including their own and
  those of eliminated players. Captures go to the mover only.
* **Elimination:** a player who cannot afford the borrow is out. In 2-player this
  ends the game (one active player left), matching the classic rule.
* **Game end:** all quan captured, or one active player left — the same as 2-player,
  just with more quan on the board (one per seat).
* **Draws:** possible in any mode; all tied top-scorers are listed as winners.

Optional variants (off by default): `minDanToCaptureQuan` (a quan cell with fewer
dân than this cannot be captured; the classic "5 dân" rule is `5`).

## Concurrency / determinism

The engine is pure and has no randomness. `applyMove` takes the state, returns a
new state plus an ordered list of animation `events`, and bumps `state.version`.
If the caller passes `expectedVersion` and it does not match, it throws
`STALE_VERSION`, which is what the server uses for optimistic concurrency.
