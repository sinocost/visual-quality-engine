import sharp from "sharp";
import type { RemotionCompositionInput } from "../adapters/remotion-quality-types.js";
import { DOM_PROBE_VERSION, type DomProbeFrameArtifact } from "./dom-probe-types.js";
import { inspectRenderedFrames } from "./frame-inspector.js";
import { materializeRemotionQualityProject, type RemotionAutoSceneInput } from "./probe-materializer.js";
import { inspectDomProbeFrames } from "./render-diagnostics.js";
import { runRemotionAutoQualityPipeline } from "./remotion-auto-quality-pipeline.js";
import type { RemotionQualityRendererDriver } from "./remotion-renderer-driver.js";
import { planQualitySampleFrames } from "./sample-planner.js";

const composition: RemotionCompositionInput = {
  id: "ProbeFixture",
  fps: 30,
  width: 320,
  height: 180,
  durationInFrames: 60,
};

const scenes: RemotionAutoSceneInput[] = [{
  id: "scene-1",
  fromFrame: 0,
  durationInFrames: 60,
  primaryClaims: ["one claim"],
  motionEvents: [],
  keyEvents: [{ id: "resolution", frame: 30, kind: "resolution" }],
}];

const goodProbe = (frame: number): DomProbeFrameArtifact => ({
  version: DOM_PROBE_VERSION,
  frame,
  width: 320,
  height: 180,
  rootFound: true,
  documentFontsStatus: "loaded",
  duplicateIds: [],
  elements: [
    {
      id: "task-a",
      sceneId: "scene-1",
      role: "primary",
      allowClipping: false,
      allowTextOverflow: false,
      requiredVisible: false,
      box: { x: 24, y: 24, width: 100, height: 60 },
      visible: true,
      opacity: 1,
      display: "block",
      visibility: "visible",
      clientWidth: 100,
      clientHeight: 60,
      scrollWidth: 100,
      scrollHeight: 60,
      overflowX: "visible",
      overflowY: "visible",
      alignment: { groupId: "row", axis: "y", anchor: "start" },
    },
    {
      id: "task-b",
      sceneId: "scene-1",
      role: "secondary",
      allowClipping: false,
      allowTextOverflow: false,
      requiredVisible: false,
      box: { x: 164, y: 24, width: 100, height: 60 },
      visible: true,
      opacity: 1,
      display: "block",
      visibility: "visible",
      clientWidth: 100,
      clientHeight: 60,
      scrollWidth: 100,
      scrollHeight: 60,
      overflowX: "visible",
      overflowY: "visible",
      alignment: { groupId: "row", axis: "y", anchor: "start" },
    },
    {
      id: "caption",
      sceneId: "scene-1",
      role: "text",
      allowClipping: false,
      allowTextOverflow: false,
      requiredVisible: false,
      box: { x: 24, y: 120, width: 272, height: 32 },
      visible: true,
      opacity: 1,
      display: "block",
      visibility: "visible",
      clientWidth: 272,
      clientHeight: 32,
      scrollWidth: 272,
      scrollHeight: 32,
      overflowX: "hidden",
      overflowY: "hidden",
      typography: {
        fontFamily: "Inter",
        fontSizePx: 32,
        fontWeight: "600",
        lineHeightPx: 32,
        text: "任务 A 等待 I/O",
        fontReady: true,
      },
    },
  ],
});

const sampleFrames = planQualitySampleFrames(composition, scenes, { intervalFrames: 15 });
assert(sampleFrames.includes(0) && sampleFrames.includes(30) && sampleFrames.includes(59), "sample planner keeps boundaries");

const probes = sampleFrames.map(goodProbe);
const project = materializeRemotionQualityProject({
  composition,
  scenes,
  probeFrames: probes,
  renderDiagnostics: [],
});
assert(project.scenes[0].elements.length === 3, "materializer creates tracked elements");
assert(project.scenes[0].elements.every((element) => element.layoutSamples.length > 0), "layoutSamples are automatic");
assert(project.scenes[0].elements.find((element) => element.id === "caption")?.typography?.fontSizePx === 32, "typography is automatic");
assert(project.scenes[0].alignmentGroups?.[0]?.elementIds.length === 2, "alignment groups are automatic");
assert(inspectDomProbeFrames(probes).length === 0, "good DOM probe has no diagnostics");

const bad: DomProbeFrameArtifact = {
  ...goodProbe(10),
  documentFontsStatus: "loading",
  duplicateIds: ["caption"],
  elements: goodProbe(10).elements.map((element) =>
    element.id === "caption"
      ? {
          ...element,
          box: { x: -12, y: 120, width: 350, height: 32 },
          clientWidth: 200,
          scrollWidth: 340,
          overflowX: "hidden",
          typography: { ...element.typography!, fontReady: false },
        }
      : element,
  ),
};
const badIssues = inspectDomProbeFrames([bad]);
for (const kind of ["clipping", "font-load", "invalid-layout"] as const) {
  assert(badIssues.some((issue) => issue.kind === kind), `bad DOM detects ${kind}`);
}

const dark = await sharp({ create: { width: 320, height: 180, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
const bright = await sharp({ create: { width: 320, height: 180, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
const frameIssues = await inspectRenderedFrames([
  { frame: 10, buffer: dark },
  { frame: 11, buffer: bright },
], composition, { expectedChangeWindows: [] });
assert(frameIssues.some((issue) => issue.kind === "flicker"), "frame inspector detects unexplained pixel flicker");

const stable = await sharp({ create: { width: 320, height: 180, channels: 4, background: { r: 40, g: 40, b: 40, alpha: 1 } } }).png().toBuffer();
const mockDriver: RemotionQualityRendererDriver = {
  async selectComposition() {
    return { quality: composition, nativeComposition: { fixture: true } };
  },
  async renderFrames(options) {
    for (const frame of options.frames) {
      const probe = goodProbe(frame);
      options.onArtifact({
        filename: `vqe/dom/frame-${String(frame).padStart(6, "0")}.json`,
        content: JSON.stringify(probe),
        frame,
      });
      options.onFrameBuffer(stable, frame);
    }
  },
};

const result = await runRemotionAutoQualityPipeline({
  serveUrl: "mock://remotion",
  compositionId: composition.id,
  scenes,
  sampling: { intervalFrames: 15 },
}, mockDriver);
assert(result.probeFrames.length === result.sampledFrames.length, "pipeline receives one probe artifact per sample");
assert(result.renderDiagnostics.length === 0, "good automatic pipeline has no render diagnostics");
assert(result.report.status === "pass", "good automatic pipeline reaches quality gate");

console.log(JSON.stringify({
  status: "PASS",
  sampledFrames: result.sampledFrames.length,
  autoElements: project.scenes[0].elements.length,
  badDomIssueKinds: [...new Set(badIssues.map((issue) => issue.kind))].sort(),
  frameIssueKinds: [...new Set(frameIssues.map((issue) => issue.kind))].sort(),
}, null, 2));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
