# Remotion Integration

## Goal

Convert quality telemetry from a real Remotion composition into the engine's stable `QualitySnapshot` contract:

```text
Remotion composition
  -> scene / layout / motion / transcript / render telemetry
  -> RemotionProjectQualityAdapter
  -> QualitySnapshot
  -> validateP0()
  -> QualityReport
```

The adapter deliberately does **not** parse arbitrary React source code or couple the engine to a project-specific `VideoSpec`. The Remotion project owns extraction; the quality engine owns measurement and gating.

## Install / link

Use this package from the Remotion project as a workspace/path dependency or publish it as an internal package. The public API is exported from `src/index.ts` after build.

## Composition metadata

On the server side, a Remotion project can obtain the resolved composition config with `selectComposition()` and pass the relevant fields to the adapter:

```ts
import {selectComposition} from '@remotion/renderer';
import {
  collectRemotionQualitySnapshot,
  defineRemotionQualityProject,
  validateP0,
} from 'visual-quality-engine';

const composition = await selectComposition({
  serveUrl,
  id: 'AsyncioExplainer',
  inputProps,
});

const project = defineRemotionQualityProject({
  profile: 'technical_explainer',
  composition: {
    id: composition.id,
    fps: composition.fps,
    width: composition.width,
    height: composition.height,
    durationInFrames: composition.durationInFrames,
  },
  scenes: qualityScenes,
  transcript: transcriptCues,
  renderDiagnostics: {issues: renderIssues},
});

const snapshot = await collectRemotionQualitySnapshot(project);
const report = validateP0(snapshot);
```

## Frame model

Scene data uses scene-relative frames.

```ts
{
  id: 'await-handoff',
  fromFrame: 90,          // absolute composition frame, maps to <Sequence from={90}>
  durationInFrames: 60,
  motionEvents: [
    {
      id: 'task-a-wait',
      elementId: 'task-a',
      kind: 'state',
      priority: 'primary',
      startFrame: 12,     // scene-relative
      endFrame: 24,       // scene-relative, exclusive
      easing: 'ease',
      reason: {type: 'state_transition', trigger: 'await_request'},
    },
  ],
}
```

The adapter converts scene-relative values to absolute composition frames before measuring concurrency, rhythm, AV sync, and evidence ranges.

Transcript cue frames are composition-absolute because narration commonly spans scenes.

## Required telemetry

### Layout samples

Provide bounding boxes at the frames that matter for quality validation:

```ts
{
  id: 'task-a',
  role: 'primary',
  layoutSamples: [
    {frame: 0, box: {x: 160, y: 220, width: 420, height: 180}},
    {frame: 30, box: {x: 160, y: 220, width: 420, height: 180}},
  ],
}
```

Use common sample frames for elements that must be checked against each other. C03/C06 use these samples; C04 uses explicit `alignmentGroups`.

### Typography

Attach resolved typography and readable timing to text-bearing elements:

```ts
typography: {
  fontFamily: 'Inter',
  fontSizePx: 42,
  text: '任务 A 等待 I/O',
  readableFromFrame: 20,
  readableToFrame: 80,
}
```

### Motion events

Each meaningful animation should expose its semantic group, priority, timing, easing and reason:

```ts
{
  id: 'task-b-run',
  elementId: 'task-b',
  groupId: 'task-b-state',
  kind: 'entrance',
  priority: 'primary',
  startFrame: 30,
  endFrame: 42,
  easing: 'spring',
  reason: {type: 'execution_handoff', trigger: 'task_a_waiting'},
}
```

Multiple child nodes moving as one visual unit should share `groupId`; M01 counts semantic motion groups, not DOM node count.

### Key events and transcript sync

```ts
keyEvents: [
  {id: 'handoff', frame: 30, kind: 'key', transcriptCueId: 'handoff-cue'},
  {id: 'resolved', frame: 60, kind: 'resolution'},
]

transcript: [
  {
    id: 'handoff-cue',
    text: '执行权切换到任务 B',
    startFrame: 29,
    endFrame: 43,
    syncFrame: 30,
  },
]
```

`syncFrame` should point to the semantic word/phrase anchor when word-level timing is available; otherwise the cue start is used.

### Render diagnostics

Q02 is a hard gate. Feed preview/render inspection failures explicitly:

```ts
renderDiagnostics: {
  issues: [
    {
      kind: 'clipping',
      frame: 128,
      elementIds: ['caption'],
      message: 'caption clipped by frame bounds',
    },
  ],
}
```

Do not silently omit known render failures.

## P0 mapping implemented by the adapter

| Metric | Source telemetry |
|---|---|
| C03 | layout samples -> minimum safe margin |
| C04 | alignment groups + layout samples |
| C06 | same-frame element overlap |
| T01 | typography font families |
| T03 | normalized minimum font size |
| T06 | CJK characters / readable duration |
| M01 | concurrent primary semantic motion groups |
| M03 | linear entrance/exit ratio |
| R03 | absolute key-event spacing |
| R04 | resolution event -> next event/scene boundary hold |
| R05 | key event -> transcript semantic anchor offset |
| CN02 | non-animated move distance / frame diagonal |
| S01 | primary claims per scene |
| S02 | semantic-linked motions / all motions |
| Q02 | render integrity issue count |

## Current boundary

Implemented now:

- deterministic conversion from Remotion quality telemetry to all 15 P0 snapshot metrics;
- scene-relative -> composition-absolute frame normalization;
- metric evidence pointing to scene/frame/elements;
- strict input validation for scene bounds, element references, alignment frames and transcript references;
- known-good and known-bad adapter fixtures.

Not implemented yet:

- automatic DOM bounding-box capture from Chromium;
- automatic pixel-level clipping/flicker detection;
- saliency / vision-model metrics;
- automatic generation of `renderDiagnostics`.

Those belong to the next extraction/probe layer, not inside the deterministic adapter.
