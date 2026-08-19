# Implementation Notes

## v0.1 scope

Implement the 15 P0 metrics first:

`C03 C04 C06 T01 T03 T06 M01 M03 R03 R04 R05 CN02 S01 S02 Q02`

They target the highest-frequency causes of low-quality AI technical animation: unsafe layout, weak readability, motion overload, mechanical easing, event crowding, missing hold, AV desync, object teleportation, scene overload, meaningless motion, and render defects.

## Integration contract

Your Remotion project only needs to produce a `QualitySnapshot` matching `schemas/quality-snapshot.schema.json`. The engine intentionally does not know your internal `VideoSpec` format.

Recommended extraction ownership:

- **VideoSpec / SceneGraph:** C03, C04, T01, T03, S01, S02 metadata.
- **Timeline / keyframes:** M01, M03, R03, R04, CN02.
- **Transcript timestamps:** T06, R05.
- **Preview render:** C06, Q02.

## Motion semantics requirement

Add semantic metadata to motion events whenever possible:

```json
{
  "element": "taskA",
  "action": "move",
  "reason": {
    "type": "state_transition",
    "trigger": "await_request"
  }
}
```

Treat `reason.type = decoration` as decorative motion. This makes S02/S04 measurable instead of subjective.

## Exit criteria for v0.1

- P0 validator executes deterministically.
- A known-good snapshot passes.
- A known-bad snapshot reports explicit failures and evidence.
- Hard-gate failure rejects output.
- Quality report can be consumed by a future Revision Planner.
