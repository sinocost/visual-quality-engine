# Remotion Integration

## Default integration: automatic probe (v0.3+)

New projects should not author `layoutSamples` manually.

Use:

1. `qualityRootAttributes()` on the composition canvas wrapper;
2. `qualityElementAttributes()` only on semantic visual objects that should be checked;
3. one root-level `<RemotionDomQualityProbe />`;
4. `runOfficialRemotionAutoQualityPipeline()` on the Node side.

See `auto-quality-pipeline.md` for the full contract.

```text
Remotion selected-frame render
  -> DOM Artifact probe
  -> BoundingBox / Typography history
  -> RenderDiagnostics
  -> materialize RemotionProjectQualityInput
  -> RemotionProjectQualityAdapter
  -> QualitySnapshot
```

## Minimal composition example

```tsx
import {AbsoluteFill} from 'remotion';
import {
  RemotionDomQualityProbe,
  qualityElementAttributes,
  qualityRootAttributes,
} from 'visual-quality-engine/remotion';

export const AsyncioExplainer = () => (
  <AbsoluteFill {...qualityRootAttributes()}>
    <div {...qualityElementAttributes({id: 'task-a', role: 'primary'})}>
      Task A
    </div>
    <div {...qualityElementAttributes({id: 'caption', role: 'text'})}>
      Task A waits for I/O
    </div>
    <RemotionDomQualityProbe />
  </AbsoluteFill>
);
```

No positions, dimensions, font sizes or readable ranges are duplicated into the quality configuration.

## Server example

```ts
import {runOfficialRemotionAutoQualityPipeline} from 'visual-quality-engine';

const {snapshot, report, renderDiagnostics} =
  await runOfficialRemotionAutoQualityPipeline({
    serveUrl,
    compositionId: 'AsyncioExplainer',
    inputProps,
    scenes: qualityScenes,
    transcript,
  });
```

`qualityScenes` contains semantic timeline data only: scene ranges, claims, MotionEvents and KeyEvents.

## Frame semantics

`RemotionDomQualityProbe` must be mounted at composition scope so `useCurrentFrame()` is composition-absolute. Scene semantic data keeps the existing convention:

- `scene.fromFrame`: composition absolute;
- MotionEvent / KeyEvent frames: scene-relative;
- transcript frames: composition absolute.

The materializer converts renderer probe frames back into scene-relative `layoutSamples` before invoking the existing adapter.

## Legacy manual integration

The v0.2 `defineRemotionQualityProject()` + hand-authored `layoutSamples` path remains supported for tests, generated fixtures or non-DOM renderers.

Use it only when automatic Chromium probing is unavailable. The deterministic `RemotionProjectQualityAdapter` API has not changed.
