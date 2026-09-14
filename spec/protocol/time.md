# Time

## Logical animation state

Deterministic recipes carry:

| Field | Meaning |
|-------|---------|
| `frame` | Non-negative integer frame index |
| `fps` | Positive frames per second |
| `t` | Logical time in seconds |
| `dt` | Logical step in seconds |

For **deterministic mode**:

```text
t  = frame / fps
dt = 1 / fps
```

Engines MUST derive `t`/`dt` from `frame`/`fps` when replaying a deterministic recipe rather than reading wall clocks.

## Wall clock

Wall-clock time (`performance.now`, `time.time`, etc.) may be used only in explicitly **nondeterministic / live-performance** mode.

Wall clock **must not** leak into deterministic recipe replay (critical for interactive replay).

## Events

Interactive events are ordered by deterministic `frame` (or `tick` if a piece defines a tick rate equal to or finer than frames). See the event schema.
