import { collectRemotionQualitySnapshot } from "../adapters/remotion-quality-adapter.js";
import type {
  RenderIntegrityIssue,
  TranscriptCue,
} from "../adapters/remotion-quality-types.js";
import { validateP0 } from "../p0-validator.js";
import type { QualityReport, QualitySnapshot } from "../types.js";
import { analyzeAutoProbeCoverage, type AutoProbeCoverageReport } from "./coverage-analyzer.js";
import { inspectRenderedFrames, type CapturedRenderFrame } from "./frame-inspector.js";
import { PixelSaliencyCritic, type VisionSaliencyCritic, type VisionSaliencyReport } from "./pixel-saliency-critic.js";
import {
  materializeRemotionQualityProject,
  type RemotionAutoSceneInput,
} from "./probe-materializer.js";
import {
  inspectDomProbeFrames,
  suppressExpectedTransientDomIssues,
} from "./render-diagnostics.js";
import type {
  RemotionQualityRendererDriver,
  RendererArtifact,
} from "./remotion-renderer-driver.js";
import {
  buildExpectedChangeWindows,
  planQualitySampleFrames,
  type QualitySamplePlanOptions,
} from "./sample-planner.js";
import {
  DOM_PROBE_VERSION,
  type DomProbeFrameArtifact,
} from "./dom-probe-types.js";

export interface RemotionAutoQualityPipelineOptions {
  serveUrl: string;
  compositionId: string;
  inputProps?: Record<string, unknown>;
  profile?: string;
  scenes: RemotionAutoSceneInput[];
  transcript?: TranscriptCue[];
  sampling?: QualitySamplePlanOptions;
  concurrency?: number | string;
  artifactPrefix?: string;
  additionalRenderDiagnostics?: RenderIntegrityIssue[];
  /** Advisory coverage target; auto-discovered elements count as resolved coverage. */
  coverageTarget?: number;
  /** Pixel saliency is advisory and never becomes a P0 hard gate. */
  saliency?: false | {
    minCoveredSaliencyRatio?: number;
    critic?: VisionSaliencyCritic;
  };
}

export interface RemotionAutoQualityPipelineResult {
  sampledFrames: number[];
  probeFrames: DomProbeFrameArtifact[];
  renderDiagnostics: RenderIntegrityIssue[];
  coverage: AutoProbeCoverageReport;
  saliency: VisionSaliencyReport | null;
  snapshot: QualitySnapshot;
  report: QualityReport;
}

export async function runRemotionAutoQualityPipeline(
  options: RemotionAutoQualityPipelineOptions,
  renderer: RemotionQualityRendererDriver,
): Promise<RemotionAutoQualityPipelineResult> {
  const inputProps = options.inputProps ?? {};
  const selected = await renderer.selectComposition({
    serveUrl: options.serveUrl,
    compositionId: options.compositionId,
    inputProps,
  });
  const composition = selected.quality;
  validateSceneBounds(options.scenes, composition.durationInFrames);

  const sampledFrames = planQualitySampleFrames(composition, options.scenes, options.sampling);
  const artifactPrefix = normalizePrefix(options.artifactPrefix ?? "vqe/dom");
  const artifacts: RendererArtifact[] = [];
  const buffers = new Map<number, Uint8Array>();

  await renderer.renderFrames({
    serveUrl: options.serveUrl,
    composition: selected,
    inputProps,
    frames: sampledFrames,
    concurrency: options.concurrency,
    onArtifact: (artifact) => artifacts.push(artifact),
    onFrameBuffer: (buffer, frame) => buffers.set(frame, buffer),
  });

  const parsed = parseProbeArtifacts(artifacts, artifactPrefix);
  const probeByFrame = new Map(parsed.frames.map((frame) => [frame.frame, frame]));
  const issues: RenderIntegrityIssue[] = [
    ...(options.additionalRenderDiagnostics ?? []),
    ...parsed.issues,
  ];

  for (const frame of sampledFrames) {
    if (!probeByFrame.has(frame)) {
      issues.push({
        kind: "missing-resource",
        frame,
        message: `DOM probe artifact missing for frame ${frame}; mount RemotionDomQualityProbe at the composition root`,
      });
    }
    if (!buffers.has(frame)) {
      issues.push({
        kind: "missing-resource",
        frame,
        message: `renderer did not return an image buffer for sampled frame ${frame}`,
      });
    }
  }

  const domIssues = suppressExpectedTransientDomIssues(
    inspectDomProbeFrames(parsed.frames),
    options.scenes,
  );
  issues.push(...domIssues);

  const capturedFrames: CapturedRenderFrame[] = [];
  for (const frame of sampledFrames) {
    const buffer = buffers.get(frame);
    if (!buffer) continue;
    const probe = probeByFrame.get(frame);
    capturedFrames.push({
      frame,
      buffer,
      hasVisibleTrackedContent: Boolean(
        probe?.elements.some((element) => element.visible && element.role !== "decorative"),
      ),
    });
  }

  issues.push(
    ...(await inspectRenderedFrames(capturedFrames, composition, {
      expectedChangeWindows: buildExpectedChangeWindows(options.scenes),
    })),
  );

  const coverage = analyzeAutoProbeCoverage(parsed.frames, options.coverageTarget ?? 0.85);
  const saliency = options.saliency === false
    ? null
    : await (options.saliency?.critic ?? new PixelSaliencyCritic()).analyze({
        frames: capturedFrames,
        probeFrames: parsed.frames,
        composition,
        minCoveredSaliencyRatio: options.saliency?.minCoveredSaliencyRatio,
      });

  const renderDiagnostics = dedupeIssues(issues);
  const project = materializeRemotionQualityProject({
    profile: options.profile,
    composition,
    scenes: options.scenes,
    transcript: options.transcript,
    probeFrames: parsed.frames,
    renderDiagnostics,
  });
  const snapshot = await collectRemotionQualitySnapshot(project);
  const report = validateP0(snapshot);

  return {
    sampledFrames,
    probeFrames: parsed.frames,
    renderDiagnostics,
    coverage,
    saliency,
    snapshot,
    report,
  };
}

interface ParsedProbeArtifacts {
  frames: DomProbeFrameArtifact[];
  issues: RenderIntegrityIssue[];
}

function parseProbeArtifacts(
  artifacts: RendererArtifact[],
  artifactPrefix: string,
): ParsedProbeArtifacts {
  const frames: DomProbeFrameArtifact[] = [];
  const issues: RenderIntegrityIssue[] = [];
  const byFrame = new Map<number, DomProbeFrameArtifact>();

  for (const artifact of artifacts) {
    if (!artifact.filename.startsWith(`${artifactPrefix}/`)) continue;
    try {
      const text = typeof artifact.content === "string"
        ? artifact.content
        : new TextDecoder().decode(artifact.content);
      const parsed = JSON.parse(text) as unknown;
      if (!isDomProbeFrameArtifact(parsed)) {
        issues.push({
          kind: "invalid-layout",
          frame: artifact.frame,
          message: `invalid VQE DOM probe artifact: ${artifact.filename}`,
        });
        continue;
      }
      if (parsed.frame !== artifact.frame) {
        issues.push({
          kind: "invalid-layout",
          frame: artifact.frame,
          message: `probe frame mismatch: artifact=${artifact.frame}, payload=${parsed.frame}`,
        });
      }
      byFrame.set(parsed.frame, parsed);
    } catch (error) {
      issues.push({
        kind: "invalid-layout",
        frame: artifact.frame,
        message: `cannot parse VQE DOM probe artifact ${artifact.filename}: ${errorMessage(error)}`,
      });
    }
  }

  frames.push(...[...byFrame.values()].sort((a, b) => a.frame - b.frame));
  return { frames, issues };
}

function isDomProbeFrameArtifact(value: unknown): value is DomProbeFrameArtifact {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DomProbeFrameArtifact>;
  return (
    item.version === DOM_PROBE_VERSION &&
    Number.isInteger(item.frame) &&
    typeof item.width === "number" &&
    typeof item.height === "number" &&
    Array.isArray(item.elements) &&
    Array.isArray(item.duplicateIds)
  );
}

function validateSceneBounds(scenes: RemotionAutoSceneInput[], durationInFrames: number): void {
  for (const scene of scenes) {
    if (!Number.isInteger(scene.fromFrame) || !Number.isInteger(scene.durationInFrames)) {
      throw new Error(`scene ${scene.id} must use integer frame values`);
    }
    if (scene.fromFrame < 0 || scene.durationInFrames <= 0) {
      throw new Error(`scene ${scene.id} has an invalid frame range`);
    }
    if (scene.fromFrame + scene.durationInFrames > durationInFrames) {
      throw new Error(`scene ${scene.id} exceeds composition duration ${durationInFrames}`);
    }
  }
}

function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, "");
}

function dedupeIssues(issues: RenderIntegrityIssue[]): RenderIntegrityIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = [issue.kind, issue.frame, (issue.elementIds ?? []).join(","), issue.message ?? ""].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
