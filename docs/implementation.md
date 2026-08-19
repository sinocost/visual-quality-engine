# Implementation Notes

## v0.1 scope

Implement the 15 P0 metrics first:

`C03 C04 C06 T01 T03 T06 M01 M03 R03 R04 R05 CN02 S01 S02 Q02`

They target the highest-frequency causes of low-quality AI technical animation: unsafe layout, weak readability, motion overload, mechanical easing, event crowding, missing hold, AV desync, object teleportation, scene overload, meaningless motion, and render defects.

## Integration contract

Your Remotion project produces structured quality telemetry. `RemotionProjectQualityAdapter` converts it into `QualitySnapshot`; the validator intentionally does not know the project's React component tree or internal `VideoSpec` format.

Extraction ownership:

- **VideoSpec / SceneGraph:** C03, C04, T01, T03, S01, S02 metadata.
- **Timeline / keyframes:** M01, M03, R03, R04, CN02.
- **Transcript timestamps:** T06, R05.
- **Preview render:** C06, Q02.

See `docs/remotion-integration.md` for the concrete input contract and actual Remotion integration pattern.

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

## v0.2 Remotion adapter status

Implemented:

- `RemotionProjectQualityInput -> QualitySnapshot` for all 15 P0 metrics;
- scene-relative to composition-absolute frame normalization;
- layout/alignment/overlap measurement;
- typography and CJK reading-load measurement;
- motion concurrency/easing/teleport measurement;
- rhythm, resolution hold and transcript sync measurement;
- semantic motion and primary-claim measurement;
- render integrity issue forwarding;
- evidence generation and input validation;
- good fixture `PASS / 100` and bad fixture `REJECT / 38` covering all 15 P0 checks.

Next extraction layer:

- Chromium DOM layout probe;
- automatic render-integrity inspection;
- vision/saliency metrics.

## Exit criteria

- P0 validator executes deterministically.
- A known-good snapshot passes.
- A known-bad snapshot reports explicit failures and evidence.
- Hard-gate failure rejects output.
- A real Remotion composition can export structured quality telemetry and receive a deterministic `QualitySnapshot`.
