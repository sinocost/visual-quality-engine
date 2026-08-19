# Visual Quality Engine v0.2

Engineering starter for evaluating AI-generated technical animations with measurable visual-quality rules.

## Included

- `config/metrics.v0.1.json` — complete 50-metric catalog.
- `config/metrics.p0.json` — P0 15-metric MVP subset.
- `config/profile.technical-explainer.json` — default style profile.
- `schemas/` — QualitySnapshot and MetricResult JSON Schemas.
- `src/p0-validator.ts` — executable deterministic P0 validator.
- `src/scoring.ts` — weighted category scoring helper.
- `src/adapters/remotion-quality-adapter.ts` — real `RemotionProjectQualityInput -> QualitySnapshot` implementation.
- `src/adapters/remotion-quality-types.ts` — stable Remotion telemetry contract.
- `examples/` — known-good / known-bad quality snapshots.
- `docs/remotion-integration.md` — actual Remotion project integration contract.

## Run

```bash
npm install
npm run build
npm run check:good
npm run check:bad
npm run check:remotion-adapter
```

Expected behavior:

- `check:good` => `status: pass`
- `check:bad` => `status: reject` because critical/hard-gate metrics fail
- `check:remotion-adapter` => good Remotion fixture `pass / 100`; bad fixture detects all 15 P0 problems and rejects

## Remotion flow

```text
Remotion Composition
  -> Scene / Layout / Motion / Transcript / Render telemetry
  -> RemotionProjectQualityAdapter
  -> QualitySnapshot
  -> validateP0()
  -> QualityReport
```

The engine does not parse arbitrary React source code. A Remotion project exposes structured quality telemetry; the adapter performs deterministic measurement and frame normalization.

## Design principle

**Generator creates; Quality Engine rejects.**

Do not ask one model to generate, self-review, and approve its own output without deterministic gates or an independent critic.
