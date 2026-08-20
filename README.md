# Visual Quality Engine v0.5

Metric-driven quality gates and independent visual criticism for AI-generated Remotion technical animation.

## Current pipeline

```text
Real Remotion render
  -> DOM Auto Discovery
  -> BoundingBox / Typography / Coverage
  -> Pixel Saliency Critic
  -> RemotionQualityAdapter
  -> QualitySnapshot / P0 Gate
  -> Vision Critic v1
     - Primary Focus
     - Hierarchy
     - Semantic Relevance
     - Attention Competition
```

## v0.5 key change

The deterministic engine still owns hard gates. Vision Critic is an independent advisory layer that judges visual meaning that DOM geometry and pixel saliency cannot reliably infer.

`qualityElementAttributes()` remains optional for normal HTML elements. `RemotionDomQualityProbe` enables DOM auto-discovery by default; explicit annotations are overrides.

## Vision Critic

Use any provider that implements `VisionCriticProvider`. A reference OpenAI Responses API provider is included without adding an SDK dependency.

```ts
import {
  OpenAIVisionCriticProvider,
  runOfficialRemotionVisionQualityPipeline,
} from 'visual-quality-engine';

const provider = new OpenAIVisionCriticProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: process.env.VQE_VISION_MODEL!,
});

const result = await runOfficialRemotionVisionQualityPipeline(
  {
    serveUrl,
    compositionId: 'AsyncioExplainer',
    scenes,
    transcript,
  },
  {
    provider,
    maxFrames: 8,
    failureMode: 'advisory',
  },
);

console.log(result.vision.aggregate);
console.log(result.vision.findings);
```

The model name is intentionally supplied by the caller instead of being hard-coded into the engine.

## Vision scoring semantics

All four scores are `0..100`; higher is always better:

- `primaryFocus` — one clear intended focal point;
- `hierarchy` — readable ordering between primary, secondary and supporting information;
- `semanticRelevance` — visual emphasis supports the current scene claim;
- `attentionCompetition` — unrelated elements do not compete for attention.

Vision findings are advisory in v0.5 and do not trigger the P0 hard gate.

## Validation

```bash
npm install
npm run build
npm run check:auto-discovery
npm run check:auto-probe
npm run check:vision-critic
npm run check:remotion-adapter
npm run check:good
npm run check:real-remotion-e2e
```

`npm run check:bad` intentionally exits non-zero because its fixture must be rejected.

See `docs/vision-critic.md`, `docs/auto-discovery-and-saliency.md`, and `docs/auto-quality-pipeline.md`.
