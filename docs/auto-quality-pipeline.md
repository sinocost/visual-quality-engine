# Automatic Remotion Quality Pipeline

## Goal

Remove hand-authored `layoutSamples` from normal Remotion projects while keeping the existing deterministic `QualitySnapshot` and P0 validator unchanged.

```text
Remotion Composition
  -> selected frame plan
  -> @remotion/renderer renderFrames()
  -> Chromium DOM measurement
  -> Remotion Artifact JSON
  -> frame buffer inspection
  -> RemotionProjectQualityInput materialization
  -> RemotionQualityAdapter
  -> QualitySnapshot
  -> validateP0()
```

## Why this boundary

The browser knows the final CSS layout, actual font metrics and visibility state. The VideoSpec knows semantic intent such as "Task A enters WAITING because await yielded". The pipeline therefore automates measurable render facts and keeps semantic motion metadata explicit instead of guessing it from pixels.

## 1. Mark the composition root

```tsx
import {AbsoluteFill} from 'remotion';
import {qualityRootAttributes} from 'visual-quality-engine/remotion';

export const Video = () => (
  <AbsoluteFill {...qualityRootAttributes()}>
    {/* scenes */}
  </AbsoluteFill>
);
```

The root gives Chromium a stable coordinate origin. No coordinates are manually entered.

## 2. Mark quality-relevant elements

Only mark semantic visual objects that should participate in quality checks. Do not mark every nested DOM node.

```tsx
import {qualityElementAttributes} from 'visual-quality-engine/remotion';

<div
  {...qualityElementAttributes({
    id: 'task-a',
    role: 'primary',
    alignment: {groupId: 'task-row', axis: 'y', anchor: 'start'},
  })}
>
  Task A
</div>
```

The helper produces stable `data-vqe-*` attributes. Chromium automatically records:

- bounding box relative to the VQE root;
- visibility / opacity;
- client and scroll dimensions;
- CSS overflow mode;
- computed `font-family`, `font-size`, weight and line height;
- rendered text;
- font readiness;
- parent quality element;
- optional alignment and overlap policy.

Useful opt-outs:

- `allowClipping: true` for intentional off-canvas visuals;
- `allowTextOverflow: true` for intentional marquee/overflow designs;
- `allowOverlapWith: ['badge']` for known overlays;
- `requiredVisible: true` only when an element must be visible on every sampled frame where it exists.

## 3. Mount one DOM probe

```tsx
import {RemotionDomQualityProbe} from 'visual-quality-engine/remotion';

<AbsoluteFill {...qualityRootAttributes()}>
  {/* content */}
  <RemotionDomQualityProbe />
</AbsoluteFill>
```

Mount it at composition scope, not inside `<Sequence>`. `useCurrentFrame()` then represents the composition frame. During rendering, the probe emits a unique JSON `<Artifact>` for each sampled frame.

Remotion's renderer exposes `onArtifact`, allowing Node to receive the JSON without private Puppeteer access.

## 4. Keep semantic scene metadata

The automatic probe replaces `elements[].layoutSamples` and typography authoring. It does not try to infer motion intent.

```ts
const qualityScenes = [
  {
    id: 'await-handoff',
    fromFrame: 0,
    durationInFrames: 90,
    primaryClaims: ['await yields execution to another runnable task'],
    motionEvents: [
      {
        id: 'task-a-wait',
        elementId: 'task-a',
        groupId: 'task-a-state',
        kind: 'state',
        priority: 'primary',
        startFrame: 24,
        endFrame: 36,
        easing: 'ease',
        reason: {type: 'state_transition', trigger: 'await_request'},
      },
    ],
    keyEvents: [
      {id: 'handoff', frame: 30, kind: 'key', transcriptCueId: 'handoff-cue'},
    ],
  },
];
```

## 5. Run automatic inspection

```ts
import {runOfficialRemotionAutoQualityPipeline} from 'visual-quality-engine';

const result = await runOfficialRemotionAutoQualityPipeline({
  serveUrl,
  compositionId: 'AsyncioExplainer',
  inputProps,
  profile: 'technical_explainer',
  scenes: qualityScenes,
  transcript,
  sampling: {
    // Default: about every 0.5s, plus mandatory semantic boundaries.
    intervalFrames: 15,
    neighborRadius: 1,
    maxUniformSamples: 180,
  },
  concurrency: 4,
});
```

The official driver resolves the composition with `selectComposition()` and renders only selected frames with `renderFrames()`. `onFrameBuffer` feeds the pixel inspector and `onArtifact` feeds the DOM probe parser.

## Sampling policy

Mandatory frames are never dropped:

- composition first/last frame;
- scene start/end;
- motion start/end;
- key events;
- configurable neighbor frames around those events;
- caller-supplied extra frames.

Uniform sampling fills the gaps. `maxUniformSamples` limits only uniform samples, not mandatory semantic boundaries.

## Automatic RenderDiagnostics

### DOM-level

Generated automatically for:

- VQE root missing;
- duplicate `data-vqe-id`;
- invalid geometry;
- tracked element outside composition bounds;
- text `scrollWidth/scrollHeight` overflow;
- clipping caused by `overflow: hidden|clip`;
- unresolved fonts;
- explicitly required element not visible.

Clipping during a declared entrance/exit motion is suppressed as an expected transient state.

### Pixel-level

PNG buffers are decoded with `sharp` and checked for:

- unreadable/corrupt frame buffer;
- rendered dimensions differing from the composition;
- fully transparent output while visible tracked content exists;
- large unexplained pixel differences between consecutive sampled frames.

Flicker is suppressed inside declared motion/key-event/scene-change windows.

## Materialization

The pipeline converts probe artifacts into the existing adapter format:

```text
probe element history
  -> elements[]
  -> layoutSamples[]
  -> TypographySample
  -> AlignmentGroup[]
  -> RenderDiagnostics
  -> RemotionProjectQualityInput
```

The old P0 validator is unchanged. This is intentional: acquisition and quality policy remain separate layers.

## Current limitations

- DOM probing sees HTML elements, not the internal objects drawn inside `<canvas>`, WebGL or a video frame. Track the canvas/container unless a domain-specific probe is added.
- Sparse sampling estimates text readable ranges between observed frames. Increase sampling density for fast captions.
- Pixel flicker detection is deliberately conservative and does not replace semantic visual review.
- Saliency, color hierarchy and higher-level Vision Critic metrics remain a later layer.
- Motion semantics still come from VideoSpec / component metadata; inferring causal intent from pixels is intentionally out of scope.
