# Auto Discovery and Saliency — v0.4

## Goal

Remove most per-element `qualityElementAttributes()` authoring while preserving a deterministic quality model.

```text
Remotion render
  -> DOM candidates
  -> importance scoring
  -> automatic promotion
  -> coverage analysis
  -> pixel saliency analysis
  -> RemotionProjectQualityInput
  -> QualitySnapshot
```

## 1. Automatic element discovery

`RemotionDomQualityProbe` enables auto-discovery by default.

Explicit `data-vqe-id` elements are always retained. Unmarked visible DOM descendants are considered when they have useful visual evidence such as direct text, media content, a native `id`, an ARIA/test label, or a visible container surface.

The default policy scores candidates using:

- area ratio;
- distance from visual center;
- font-size ratio and font weight;
- heading level;
- direct textual content;
- media/canvas/SVG role;
- visible background/border/shadow;
- stable native identity;
- opacity / `aria-hidden`.

Candidates below the candidate threshold are ignored. Candidates above the promotion threshold become normal `DomProbeElementSnapshot` entries with `source: "auto"`.

## 2. Stable IDs

ID priority:

1. unique native DOM `id` — reused unchanged;
2. `data-testid`;
3. `aria-label`;
4. deterministic structural path scoped to the nearest quality scene.

Using native DOM IDs is important because VideoSpec semantic motion events can continue to reference normal element IDs without VQE-specific markup.

## 3. Parent-child overlap

When both a visual container and a nested text/media element are auto-promoted, the probe records the nearest promoted ancestor as `parentId`. Existing overlap rules therefore do not treat intentional parent-child containment as C06 overlap.

## 4. Coverage report

Each probe artifact can carry a `coverage` payload:

```ts
{
  explicitCoverageRatio,
  resolvedCoverageRatio,
  autoPromotedCount,
  candidates
}
```

`resolvedCoverageRatio` includes both explicit and auto-promoted elements. The aggregate `AutoProbeCoverageReport` surfaces:

- minimum/average explicit coverage;
- minimum/average resolved coverage;
- auto-promoted IDs;
- high-importance unmarked elements;
- frames below the configured coverage target.

A high-importance auto element is evidence that the engine correctly discovered something the user would previously have needed to annotate.

## 5. Pixel saliency critic

`PixelSaliencyCritic` is a local, deterministic, vendor-neutral critic. It downsamples rendered PNG frames and builds a simple saliency field from luminance gradients, color saturation and a mild center bias.

For every sampled frame it measures how much saliency mass is covered by visible tracked DOM boxes. It also returns the most salient uncovered regions.

This catches cases such as:

- important content drawn inside an untracked `<canvas>`;
- WebGL content with no DOM child representation;
- a visually dominant image or overlay missed by DOM heuristics;
- attention-heavy regions not owned by any quality element.

The critic is advisory in v0.4 because pixel saliency is not equivalent to semantic importance.

## 6. Vision critic extension point

The pipeline accepts a custom `VisionSaliencyCritic` implementation. A future GPT/Claude/vision-model adapter can replace or augment `PixelSaliencyCritic` without coupling the core engine to one vendor.

The provider receives:

- selected frame buffers;
- DOM probe snapshots;
- composition dimensions;
- the configured saliency threshold.

It returns the same `VisionSaliencyReport` contract.

## 7. Real Remotion E2E

`src/fixtures/remotion-auto-discovery/` intentionally does not call `qualityElementAttributes()`.

`check:real-remotion-e2e`:

1. bundles the fixture with `@remotion/bundler`;
2. resolves the composition with `selectComposition()`;
3. renders sampled frames using the existing official `renderFrames()` driver;
4. receives `<Artifact>` DOM telemetry and PNG buffers;
5. verifies auto-promoted native IDs;
6. verifies coverage;
7. runs saliency inspection;
8. runs `RemotionQualityAdapter -> QualitySnapshot -> validateP0()`.

## Boundary

Still explicit by design:

- primary claims;
- motion causality / `reason`;
- motion priority;
- key semantic events;
- transcript semantic anchors.

These express intent and should come from VideoSpec rather than be guessed from pixels.
