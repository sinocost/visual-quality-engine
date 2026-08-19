# Visual Quality Engine v0.3

Metric-driven quality gates for AI-generated Remotion technical animation.

## Current pipeline

```text
Remotion selected-frame render
  -> Chromium DOM Probe
  -> automatic BoundingBox / computed Typography
  -> Render Frame Inspector
  -> automatic RenderDiagnostics
  -> RemotionQualityAdapter
  -> QualitySnapshot
  -> P0 Quality Gate
```

## v0.3 key change

`layoutSamples` no longer need to be authored by hand. A Remotion composition marks only the visual elements that should be quality-tracked; Chromium measures their real rendered geometry and computed typography at sampled frames.

### Browser-side probe

```tsx
import {
  RemotionDomQualityProbe,
  qualityElementAttributes,
  qualityRootAttributes,
} from 'visual-quality-engine/remotion';

<AbsoluteFill {...qualityRootAttributes()}>
  <div {...qualityElementAttributes({id: 'task-a', role: 'primary'})} />
  <RemotionDomQualityProbe />
</AbsoluteFill>
```

Mount `RemotionDomQualityProbe` once at the composition root, outside nested `<Sequence>` nodes.

### Node-side automatic inspection

```ts
import {runOfficialRemotionAutoQualityPipeline} from 'visual-quality-engine';

const result = await runOfficialRemotionAutoQualityPipeline({
  serveUrl,
  compositionId: 'AsyncioExplainer',
  scenes: qualityScenes,
  transcript,
});

console.log(result.report);
```

`qualityScenes` still owns semantic data such as primary claims, motion reasons and key events. Geometry and typography are renderer-derived.

## Included

- complete 50-metric catalog;
- executable P0 15-metric validator;
- `RemotionQualityAdapter -> QualitySnapshot`;
- Chromium DOM probe via Remotion `<Artifact>`;
- automatic layout/typography/alignment materialization;
- DOM clipping, overflow, duplicate-ID and font-load diagnostics;
- PNG frame inspection for invalid dimensions, transparent failure and unexplained consecutive-frame flicker;
- deterministic frame sampling around scene/motion/key-event boundaries;
- official `@remotion/renderer` bridge using `selectComposition()` + `renderFrames()`;
- server and browser entry points separated as `visual-quality-engine` and `visual-quality-engine/remotion`.

## Validation

```bash
npm install
npm run build
npm run check:good
npm run check:remotion-adapter
npm run check:auto-probe
```

`npm run check:bad` intentionally exits non-zero because its fixture must be rejected.

See `docs/auto-quality-pipeline.md` for the integration contract and current limitations.
