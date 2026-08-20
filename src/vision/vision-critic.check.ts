import { OpenAIVisionCriticProvider } from "./openai-vision-critic-provider.js";
import { VisionCriticV1 } from "./vision-critic.js";
import type {
  VisionCriticProvider,
  VisionCriticProviderFrameOutput,
} from "./vision-critic-types.js";
import {
  DOM_PROBE_VERSION,
  type DomProbeFrameArtifact,
} from "../probe/dom-probe-types.js";
import type { RemotionAutoSceneInput } from "../probe/probe-materializer.js";

const output = (
  score: number,
  ids: string[],
): VisionCriticProviderFrameOutput => ({
  primaryFocus: {
    score,
    confidence: 0.9,
    elementIds: ids,
    rationale: "focus",
    recommendation: "keep",
  },
  hierarchy: {
    score,
    confidence: 0.9,
    elementIds: ids,
    rationale: "hierarchy",
    recommendation: "keep",
  },
  semanticRelevance: {
    score,
    confidence: 0.9,
    elementIds: [...ids, "ghost"],
    rationale: "semantic",
    recommendation: "align",
  },
  attentionCompetition: {
    score,
    confidence: 0.9,
    elementIds: ids,
    rationale: "competition",
    recommendation: "reduce",
  },
});

const provider: VisionCriticProvider = {
  name: "fixture-provider",
  async evaluateFrame(input) {
    return output(input.frame === 30 ? 55 : 88, ["hero-title"]);
  },
};

const scene: RemotionAutoSceneInput = {
  id: "scene-1",
  fromFrame: 0,
  durationInFrames: 60,
  primaryClaims: ["await yields execution"],
  motionEvents: [],
  keyEvents: [{ id: "event", frame: 30, kind: "key" }],
};

const probe = (frame: number): DomProbeFrameArtifact => ({
  version: DOM_PROBE_VERSION,
  frame,
  width: 320,
  height: 180,
  rootFound: true,
  documentFontsStatus: "loaded",
  duplicateIds: [],
  elements: [
    {
      id: "hero-title",
      sceneId: "scene-1",
      role: "primary",
      allowClipping: false,
      allowTextOverflow: false,
      requiredVisible: false,
      box: { x: 40, y: 20, width: 240, height: 50 },
      visible: true,
      opacity: 1,
      display: "block",
      visibility: "visible",
      clientWidth: 240,
      clientHeight: 50,
      scrollWidth: 240,
      scrollHeight: 50,
      overflowX: "visible",
      overflowY: "visible",
      source: "auto",
      importanceScore: 0.9,
      nativeId: "hero-title",
      tagName: "h1",
      typography: {
        fontFamily: "Arial",
        fontSizePx: 36,
        fontWeight: "700",
        lineHeightPx: 40,
        text: "await yields execution",
        fontReady: true,
      },
    },
  ],
});

const frames = [0, 30, 59].map((frame) => ({
  frame,
  buffer: new Uint8Array([1, 2, 3, 4]),
}));
const critic = new VisionCriticV1(provider, { maxFrames: 3 });
const report = await critic.analyze({
  frames,
  probeFrames: [probe(0), probe(30), probe(59)],
  composition: {
    id: "c",
    fps: 30,
    width: 320,
    height: 180,
    durationInFrames: 60,
  },
  scenes: [scene],
  saliency: null,
});

assert(report.status === "completed", "vision report completes");
assert(report.framesAnalyzed >= 1, "vision analyzes frames");
assert(
  report.findings.some((finding) => finding.severity === "major"),
  "low frame creates major finding",
);
assert(
  report.frames.every((frame) =>
    frame.semanticRelevance.elementIds.every((id) => id !== "ghost"),
  ),
  "hallucinated element ids are removed",
);

let requestBody: any;
const openai = new OpenAIVisionCriticProvider({
  apiKey: "test-key",
  model: "test-model",
  fetchImpl: async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify(output(90, ["hero-title"])),
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  },
});

const openaiResult = await openai.evaluateFrame({
  frame: 0,
  sceneId: "scene-1",
  sceneClaims: ["claim"],
  image: new Uint8Array([1, 2, 3]),
  imageMimeType: "image/png",
  elements: [
    {
      id: "hero-title",
      role: "primary",
      box: { x: 0, y: 0, width: 100, height: 50 },
    },
  ],
});

assert(
  openaiResult.primaryFocus.score === 90,
  "OpenAI provider parses structured response",
);
assert(
  requestBody.text.format.type === "json_schema",
  "OpenAI provider requests structured output",
);
const userContent = requestBody.input.find(
  (item: any) => item.role === "user",
).content;
assert(
  userContent.some(
    (item: any) =>
      item.type === "input_image" &&
      String(item.image_url).startsWith("data:image/png;base64,"),
  ),
  "OpenAI provider sends image input",
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      framesAnalyzed: report.framesAnalyzed,
      findings: report.findings.length,
      overallScore: report.aggregate.overallScore,
    },
    null,
    2,
  ),
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
