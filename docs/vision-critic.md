# Vision Critic v1

## Goal

Add semantic visual judgment without weakening deterministic quality gates.

```text
Remotion render facts
  -> DOM / Coverage / Pixel Saliency
  -> deterministic P0 gate
  -> representative frame planner
  -> VisionCriticProvider
  -> structured four-criterion assessment
  -> sanitized evidence
  -> advisory findings
```

## Four criteria

| Criterion | Question | Score meaning |
|---|---|---|
| Primary Focus | Is there one clear intended focal point? | 100 = unmistakable focus |
| Hierarchy | Can the viewer read primary -> secondary -> supporting information? | 100 = strong hierarchy |
| Semantic Relevance | Does the visual emphasis explain the current scene claim? | 100 = emphasis matches meaning |
| Attention Competition | Are unrelated elements prevented from competing for attention? | 100 = little harmful competition |

All scores are normalized to `0..100`. The engine clamps malformed provider values and filters returned element IDs against the real DOM probe IDs, so a model cannot attach evidence to invented elements.

## Frame selection

Vision calls are deliberately sparse. Default maximum: 8 frames.

Priority:

1. one representative midpoint per scene;
2. semantic key-event frames;
3. lowest pixel-saliency-coverage frames;
4. first / last sampled frame when budget remains.

The vision wrapper performs a small second render pass only for those selected frames. This keeps the existing deterministic pipeline unchanged and limits model cost.

## Provider contract

```ts
interface VisionCriticProvider {
  readonly name: string;
  evaluateFrame(input: VisionCriticProviderFrameInput):
    Promise<VisionCriticProviderFrameOutput>;
}
```

The provider receives:

- PNG frame bytes;
- scene ID and primary claims;
- visible tracked element IDs, roles, text and bounding boxes;
- auto-discovery source / importance when available;
- pixel-saliency coverage context when available.

## OpenAI reference provider

`OpenAIVisionCriticProvider` calls the Responses API directly through `fetch`, sends the rendered frame as an image input, and requests a strict JSON-schema response. The engine does not hard-code a model name.

```ts
const provider = new OpenAIVisionCriticProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: process.env.VQE_VISION_MODEL!,
});
```

No API key is committed to the repository. CI tests the provider request/response protocol with a mocked `fetch`, so normal CI does not spend model credits.

## Failure policy

`failureMode: 'advisory'` is recommended for production rendering:

- provider succeeds -> return semantic findings;
- some frames fail -> `status: partial`;
- all fail -> `status: unavailable`;
- deterministic P0 gate remains authoritative.

Use `failureMode: 'error'` only when a product explicitly requires vision review before delivery.

## Thresholds

Default advisory thresholds:

- `< 75`: warning;
- `< 60`: major.

Aggregate weights:

```text
Primary Focus          30%
Hierarchy              25%
Semantic Relevance     30%
Attention Competition  15%
```

## Current boundary

Vision Critic v1 does not:

- change P0 metric thresholds;
- auto-fix the video;
- infer motion causality from pixels alone;
- become a hard gate by default.

The next layer should convert high-confidence findings into `RevisionPlanner` patches and verify whether the re-render improves both deterministic metrics and semantic vision scores.
