# Visual Quality Engine v0.1

A metric-driven quality gate for professional technical animation.

This package defines a 50-metric visual quality catalog and implements the first 15 P0 validators for technical explainer / Remotion-style animation workflows.

## Scope

- 50 visual quality metric definitions
- 15 executable P0 validators
- TypeScript data contracts
- scoring and hard-gate logic
- Remotion adapter contract
- good / bad example snapshots
- JSON schemas and implementation notes

## Quick start

```bash
npm install
npm run build
npm run check:good
npm run check:bad
```

`check:bad` is expected to exit non-zero because the fixture intentionally violates quality gates.
