# Visual Quality Engine v0.1

Engineering starter for evaluating AI-generated technical animations with measurable visual-quality rules.

## Included

- `config/metrics.v0.1.json` — complete 50-metric catalog.
- `config/metrics.p0.json` — P0 15-metric MVP subset.
- `config/profile.technical-explainer.json` — default style profile.
- `schemas/` — QualitySnapshot and MetricResult JSON Schemas.
- `src/p0-validator.ts` — executable deterministic P0 validator.
- `src/scoring.ts` — weighted category scoring helper.
- `src/adapters/` — Remotion adapter boundary.
- `examples/` — known-good / known-bad quality snapshots.
- `docs/` — architecture and integration notes.

## Run

```bash
npm install
npm run build
npm run check:good
npm run check:bad
```

Expected behavior:

- `check:good` => `status: pass`
- `check:bad` => `status: reject` because critical/hard-gate metrics fail

## Design principle

**Generator creates; Quality Engine rejects.**

Do not ask one model to generate, self-review, and approve its own output without deterministic gates or an independent critic.
