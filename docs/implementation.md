# Implementation Notes

## Current version: v0.3

The quality policy remains the same 15 deterministic P0 metrics:

`C03 C04 C06 T01 T03 T06 M01 M03 R03 R04 R05 CN02 S01 S02 Q02`

v0.3 changes the acquisition layer, not the metric thresholds.

## Pipeline ownership

```text
VideoSpec semantic data
        +
selected Remotion frames
        ↓
Chromium DOM Probe + PNG Frame Inspector
        ↓
RemotionProjectQualityInput
        ↓
RemotionQualityAdapter
        ↓
QualitySnapshot
        ↓
P0 Validator
```

### Automatic now

- `elements[].layoutSamples` from real DOM `getBoundingClientRect()` values;
- computed typography and text content;
- alignment groups from lightweight `data-vqe-*` metadata;
- text overflow / clipping / font readiness diagnostics;
- image-buffer validity, dimension checks and conservative flicker detection;
- selected-frame planning around scene, motion and key-event boundaries.

### Still semantic / project-owned

- scene boundaries;
- primary claims;
- motion event timing, priority and reason;
- key events;
- transcript timestamps.

This separation is deliberate. Render facts should be measured; causal intent should not be guessed from pixels.

## Browser/server split

Use `visual-quality-engine/remotion` inside the composition. It contains only the annotation helpers and DOM Artifact probe.

Use `visual-quality-engine` in Node for renderer orchestration, `sharp` frame inspection, materialization and validation.

## Quality gate

All generated `RenderIntegrityIssue` values feed Q02. Critical P0 failures continue to reject output regardless of aggregate score.

## Validation

```bash
npm run build
npm run check:good
npm run check:remotion-adapter
npm run check:auto-probe
```

The bad snapshot fixture is expected to reject and therefore exits non-zero.

## Next layer after v0.3

- automatic canvas/WebGL-specific probes;
- saliency / attention analysis;
- richer pixel-level artifact detection;
- Revision Planner patches that map metric violations back to Remotion props / VideoSpec fields.
