import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { runOfficialRemotionAutoQualityPipeline } from "./official-auto-quality-pipeline.js";
import type { RemotionAutoSceneInput } from "./probe-materializer.js";

const entryPoint = resolve(process.cwd(), "src/fixtures/remotion-auto-discovery/index.tsx");
const serveUrl = await bundle({ entryPoint });

const scenes: RemotionAutoSceneInput[] = [{
  id: "scene-1",
  fromFrame: 0,
  durationInFrames: 90,
  primaryClaims: ["await yields execution to another runnable task"],
  motionEvents: [
    {
      id: "task-a-enter",
      elementId: "task-a",
      groupId: "task-a",
      kind: "entrance",
      priority: "primary",
      startFrame: 10,
      endFrame: 22,
      easing: "ease",
      reason: { type: "state_transition", trigger: "await" },
      animated: true,
    },
    {
      id: "task-b-enter",
      elementId: "task-b",
      groupId: "task-b",
      kind: "entrance",
      priority: "primary",
      startFrame: 34,
      endFrame: 44,
      easing: "ease",
      reason: { type: "execution_handoff", trigger: "task_a_waiting" },
      animated: true,
    },
  ],
  keyEvents: [
    { id: "await", frame: 30, kind: "key", transcriptCueId: "await-cue" },
    { id: "resolved", frame: 60, kind: "resolution" },
  ],
}];

try {
  const result = await runOfficialRemotionAutoQualityPipeline({
    serveUrl,
    compositionId: "AutoDiscoveryFixture",
    scenes,
    transcript: [{
      id: "await-cue",
      text: "await 让出执行权",
      startFrame: 28,
      endFrame: 40,
      syncFrame: 30,
    }],
    sampling: { intervalFrames: 10, neighborRadius: 1 },
    concurrency: 2,
  });

  assert(result.probeFrames.length > 0, "real renderer emitted DOM probe artifacts");
  assert(result.coverage.autoPromotedElementIds.includes("hero-title"), "native h1 id auto-promoted");
  assert(result.coverage.autoPromotedElementIds.includes("task-a"), "task-a auto-promoted without VQE annotation");
  assert(result.coverage.autoPromotedElementIds.includes("task-b"), "task-b auto-promoted without VQE annotation");
  assert(result.coverage.minResolvedCoverageRatio >= 0.8, "automatic probe resolves most DOM importance");
  assert(result.snapshot.metrics.renderIntegrityIssues === 0, "fixture has no render integrity failures");
  assert(result.report.status !== "reject", "real Remotion fixture clears hard gates");

  console.log(JSON.stringify({
    status: "PASS",
    sampledFrames: result.sampledFrames.length,
    autoPromoted: result.coverage.autoPromotedElementIds,
    keyAutoElements: result.coverage.keyAutoElementIds,
    minCoverage: Number(result.coverage.minResolvedCoverageRatio.toFixed(3)),
    minSaliencyCoverage: Number((result.saliency?.minimumCoveredSaliencyRatio ?? 1).toFixed(3)),
    qualityStatus: result.report.status,
    score: result.report.provisionalScore,
  }, null, 2));
} finally {
  await rm(serveUrl, { recursive: true, force: true }).catch(() => undefined);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
