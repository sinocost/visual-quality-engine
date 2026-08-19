# Visual Quality Engine v0.4

Metric-driven quality gates for AI-generated Remotion technical animation.

## Current pipeline

```text
Real Remotion Fixture
  -> @remotion/bundler + real Chromium renderFrames()
  -> DOM Auto Discovery
  -> BoundingBox / Typography / Coverage
  -> Pixel Saliency Critic
  -> RenderDiagnostics
  -> RemotionQualityAdapter
  -> QualitySnapshot
  -> P0 Quality Gate
```

## v0.4 key change

`qualityElementAttributes()` is no longer required for most normal HTML elements.

The browser probe now discovers visually meaningful elements automatically. It prefers ordinary DOM `id` values so existing VideoSpec motion metadata can keep referring to `task-a`, `caption`, etc. Explicit VQE annotations remain available as overrides for roles, overlap policy, clipping policy and alignment metadata.

```tsx
<AbsoluteFill {...qualityRootAttributes()}>
  <h1 id="hero-title">asyncio execution handoff</h1>
  <div id="task-a">Task A</div>
  <div id="task-b">Task B</div>
  <RemotionDomQualityProbe />
</AbsoluteFill>
```

No per-element VQE annotation is required in the common case.

## Automatic discovery

The Chromium probe scores visible DOM candidates using deterministic render facts:

- rendered area and centrality;
- heading/text prominence and font weight;
- media/canvas/SVG presence;
- visible container styling;
- stable native IDs / labels;
- opacity and visibility.

High-confidence candidates are promoted into the existing quality model and automatically receive layout samples and typography samples.

## Coverage and saliency

The pipeline returns two advisory reports in addition to the P0 quality report:

- `coverage` — explicit coverage vs auto-resolved coverage, plus key elements that were discovered without annotations;
- `saliency` — pixel-level visual saliency coverage and uncovered high-attention regions.

Saliency is deliberately advisory in v0.4 and does not trigger a P0 hard gate.

## Explicit annotations are now overrides

Use `qualityElementAttributes()` only when the automatic interpretation needs correction, for example:

- force `role: 'primary'`;
- allow intentional overlap;
- allow intentional clipping;
- define alignment groups;
- require visibility;
- pin a custom stable quality ID.

## Validation

```bash
npm install
npm run build
npm run check:auto-discovery
npm run check:auto-probe
npm run check:remotion-adapter
npm run check:good
npm run check:real-remotion-e2e
```

`check:real-remotion-e2e` bundles a real Remotion fixture, renders selected frames in Chromium, receives DOM probe artifacts and frame buffers, and runs the complete automatic quality pipeline.

`npm run check:bad` intentionally exits non-zero because its fixture must be rejected.

See `docs/auto-discovery-and-saliency.md` and `docs/auto-quality-pipeline.md`.
