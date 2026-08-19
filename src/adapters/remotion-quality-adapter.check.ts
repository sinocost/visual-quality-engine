import { validateP0 } from "../p0-validator.js";
import { RemotionProjectQualityAdapter } from "./remotion-quality-adapter.js";
import { defineRemotionQualityProject } from "./remotion-quality-types.js";
import type { RemotionProjectQualityInput } from "./remotion-quality-types.js";

const project: RemotionProjectQualityInput = defineRemotionQualityProject({
  profile: "technical_explainer",
  composition: {
    id: "AsyncioExplainer",
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: 180,
  },
  scenes: [
    {
      id: "await-handoff",
      fromFrame: 0,
      durationInFrames: 90,
      primaryClaims: ["await yields execution to another runnable task"],
      elements: [
        {
          id: "task-a",
          role: "primary",
          layoutSamples: [
            { frame: 0, box: { x: 160, y: 220, width: 420, height: 180 } },
            { frame: 45, box: { x: 160, y: 220, width: 420, height: 180 } },
          ],
        },
        {
          id: "task-b",
          role: "secondary",
          layoutSamples: [
            { frame: 0, box: { x: 720, y: 220, width: 420, height: 180 } },
            { frame: 45, box: { x: 720, y: 220, width: 420, height: 180 } },
          ],
        },
        {
          id: "caption",
          role: "text",
          layoutSamples: [{ frame: 45, box: { x: 320, y: 760, width: 1280, height: 100 } }],
          typography: {
            fontFamily: "Inter",
            fontSizePx: 42,
            text: "任务 A 等待 I/O，执行权切换到任务 B",
            readableFromFrame: 30,
            readableToFrame: 90,
          },
        },
      ],
      alignmentGroups: [
        {
          id: "task-row",
          elementIds: ["task-a", "task-b"],
          axis: "y",
          anchor: "start",
          frames: [0, 45],
        },
      ],
      motionEvents: [
        {
          id: "task-a-wait",
          elementId: "task-a",
          groupId: "task-a-state",
          kind: "state",
          priority: "primary",
          startFrame: 18,
          endFrame: 30,
          easing: "ease",
          reason: { type: "state_transition", trigger: "await_request" },
        },
        {
          id: "task-b-run",
          elementId: "task-b",
          groupId: "task-b-state",
          kind: "entrance",
          priority: "primary",
          startFrame: 30,
          endFrame: 42,
          easing: "spring",
          reason: { type: "execution_handoff", trigger: "task_a_waiting" },
        },
      ],
      keyEvents: [
        { id: "await", frame: 18, kind: "key", transcriptCueId: "await-cue" },
        { id: "handoff", frame: 30, kind: "key", transcriptCueId: "handoff-cue" },
        { id: "resolved", frame: 60, kind: "resolution" },
      ],
    },
    {
      id: "io-complete",
      fromFrame: 90,
      durationInFrames: 90,
      primaryClaims: ["I/O completion moves Task A back to ready"],
      elements: [
        {
          id: "task-a-ready",
          role: "primary",
          layoutSamples: [{ frame: 0, box: { x: 300, y: 300, width: 460, height: 180 } }],
        },
        {
          id: "ready-label",
          role: "text",
          layoutSamples: [{ frame: 30, box: { x: 820, y: 330, width: 500, height: 80 } }],
          typography: {
            fontFamily: "Inter",
            fontSizePx: 38,
            text: "I/O 完成，Task A 进入 READY",
            readableFromFrame: 20,
            readableToFrame: 90,
          },
        },
      ],
      motionEvents: [
        {
          id: "task-a-ready-state",
          elementId: "task-a-ready",
          kind: "state",
          priority: "primary",
          startFrame: 12,
          endFrame: 24,
          easing: "ease",
          reason: { type: "state_transition", trigger: "io_complete" },
        },
      ],
      keyEvents: [
        { id: "io-complete", frame: 12, kind: "key", transcriptCueId: "io-cue" },
        { id: "ready", frame: 30, kind: "resolution" },
      ],
    },
  ],
  transcript: [
    { id: "await-cue", text: "遇到 await", startFrame: 17, endFrame: 25, syncFrame: 18 },
    { id: "handoff-cue", text: "执行权切换到任务 B", startFrame: 29, endFrame: 43, syncFrame: 30 },
    { id: "io-cue", text: "I/O 完成", startFrame: 101, endFrame: 112, syncFrame: 102 },
  ],
  renderDiagnostics: { issues: [] },
});

const snapshot = await new RemotionProjectQualityAdapter().collect(project);
const report = validateP0(snapshot);

const expected: Array<[string, number]> = [
  ["safeMarginRatio", 160 / 1080],
  ["alignmentErrorPx1080", 0],
  ["unexpectedOverlapRatio", 0],
  ["fontFamilies", 1],
  ["minFontSizePx1080", 38],
  ["maxConcurrentPrimaryMotionGroups", 1],
  ["linearEntranceExitRatio", 0],
  ["maxAbsVoiceSyncOffsetSec", 0],
  ["maxTeleportRatio", 0],
  ["maxPrimaryClaimsPerScene", 1],
  ["semanticLinkedMotionRatio", 1],
  ["renderIntegrityIssues", 0],
];

for (const [key, value] of expected) {
  const actual = snapshot.metrics[key as keyof typeof snapshot.metrics];
  if (Math.abs(actual - value) > 1e-9) {
    throw new Error(`Expected ${key}=${value}, got ${actual}`);
  }
}

if (report.status !== "pass" || report.hardGateFailed) {
  throw new Error(`Expected adapter fixture to pass, got ${report.status}`);
}

console.log(JSON.stringify({ status: report.status, score: report.provisionalScore, metrics: snapshot.metrics }, null, 2));

const badProject = structuredClone(project);
const badScene = badProject.scenes[0];
const taskA = badScene.elements.find(element => element.id === "task-a")!;
const taskB = badScene.elements.find(element => element.id === "task-b")!;
const caption = badScene.elements.find(element => element.id === "caption")!;

taskA.layoutSamples[0].box.x = 5;
taskA.typography = {
  fontFamily: "Arial",
  fontSizePx: 32,
  text: "Task A",
  readableFromFrame: 0,
  readableToFrame: 30,
};
taskB.layoutSamples[0].box = { x: 200, y: 240, width: 420, height: 180 };
taskB.typography = {
  fontFamily: "Roboto Mono",
  fontSizePx: 32,
  text: "Task B",
  readableFromFrame: 0,
  readableToFrame: 30,
};
caption.typography = {
  ...caption.typography!,
  fontFamily: "Inter",
  fontSizePx: 20,
  text: "任务等待操作系统网络文件输入输出完成之后才能继续执行",
  readableFromFrame: 30,
  readableToFrame: 45,
};

badScene.primaryClaims.push("second competing claim");
badScene.motionEvents.find(event => event.id === "task-b-run")!.easing = "linear";
badScene.motionEvents.push(
  {
    id: "noise-a",
    elementId: "task-b",
    groupId: "noise-a",
    kind: "scale",
    priority: "primary",
    startFrame: 20,
    endFrame: 25,
    easing: "linear",
    reason: { type: "decoration" },
  },
  {
    id: "noise-b",
    elementId: "caption",
    groupId: "noise-b",
    kind: "other",
    priority: "primary",
    startFrame: 20,
    endFrame: 25,
    easing: "linear",
  },
  {
    id: "teleport",
    elementId: "task-a",
    kind: "move",
    priority: "secondary",
    startFrame: 50,
    endFrame: 50,
    fromPosition: { x: 100, y: 100 },
    toPosition: { x: 1500, y: 800 },
    animated: false,
  },
);

badScene.keyEvents.find(event => event.id === "handoff")!.frame = 19;
badScene.keyEvents.find(event => event.id === "resolved")!.frame = 85;
badProject.transcript!.find(cue => cue.id === "await-cue")!.syncFrame = 50;
badProject.renderDiagnostics.issues.push({
  kind: "clipping",
  frame: 44,
  elementIds: ["caption"],
  message: "caption clipped by frame bounds",
});

const badSnapshot = await new RemotionProjectQualityAdapter().collect(badProject);
const badReport = validateP0(badSnapshot);
const expectedProblems = [
  "C03", "C04", "C06", "T01", "T03", "T06", "M01", "M03",
  "R03", "R04", "R05", "CN02", "S01", "S02", "Q02",
];
for (const metricId of expectedProblems) {
  const result = badReport.results.find(item => item.metricId === metricId);
  if (!result || result.status === "pass") {
    throw new Error(`Expected ${metricId} to report a problem`);
  }
}
if (badReport.status !== "reject" || !badReport.hardGateFailed) {
  throw new Error(`Expected bad adapter fixture to reject, got ${badReport.status}`);
}

console.log(JSON.stringify({
  badFixture: {
    status: badReport.status,
    score: badReport.provisionalScore,
    problems: badReport.results.filter(item => item.status !== "pass").map(item => item.metricId),
  },
}, null, 2));
