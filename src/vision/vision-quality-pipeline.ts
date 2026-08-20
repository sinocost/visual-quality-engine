import type { CapturedRenderFrame } from "../probe/frame-inspector.js";
import {
  runRemotionAutoQualityPipeline,
  type RemotionAutoQualityPipelineOptions,
  type RemotionAutoQualityPipelineResult,
} from "../probe/remotion-auto-quality-pipeline.js";
import type { RemotionQualityRendererDriver } from "../probe/remotion-renderer-driver.js";
import { planVisionCriticFrames, VisionCriticV1 } from "./vision-critic.js";
import type {
  VisionCriticOptions,
  VisionCriticProvider,
  VisionCriticReport,
} from "./vision-critic-types.js";

export interface VisionQualityPassOptions extends VisionCriticOptions {
  provider: VisionCriticProvider;
  failureMode?: "advisory" | "error";
}

export interface RemotionVisionQualityPipelineResult
  extends RemotionAutoQualityPipelineResult {
  vision: VisionCriticReport;
}

/**
 * Runs the deterministic automatic quality pipeline first, then performs a
 * sparse second frame pass for semantic vision review. This keeps P0 policy
 * independent from model availability and limits vision cost.
 */
export async function runRemotionVisionQualityPipeline(
  options: RemotionAutoQualityPipelineOptions,
  renderer: RemotionQualityRendererDriver,
  vision: VisionQualityPassOptions,
): Promise<RemotionVisionQualityPipelineResult> {
  const base = await runRemotionAutoQualityPipeline(options, renderer);
  const inputProps = options.inputProps ?? {};
  const selected = await renderer.selectComposition({
    serveUrl: options.serveUrl,
    compositionId: options.compositionId,
    inputProps,
  });

  const framesToRender = planVisionCriticFrames({
    availableFrames: base.sampledFrames,
    scenes: options.scenes,
    saliency: base.saliency,
    maxFrames: vision.maxFrames,
  });

  const buffers = new Map<number, Uint8Array>();
  if (framesToRender.length) {
    await renderer.renderFrames({
      serveUrl: options.serveUrl,
      composition: selected,
      inputProps,
      frames: framesToRender,
      concurrency: options.concurrency,
      onArtifact: () => undefined,
      onFrameBuffer: (buffer, frame) => buffers.set(frame, buffer),
    });
  }

  const capturedFrames: CapturedRenderFrame[] = framesToRender.flatMap(
    (frame) => {
      const buffer = buffers.get(frame);
      return buffer ? [{ frame, buffer }] : [];
    },
  );

  const critic = new VisionCriticV1(vision.provider, vision);
  const report = await critic.analyze({
    frames: capturedFrames,
    probeFrames: base.probeFrames,
    composition: selected.quality,
    scenes: options.scenes,
    saliency: base.saliency,
  });

  if (vision.failureMode === "error" && report.status !== "completed") {
    throw new Error(
      `Vision Critic did not complete: ${report.status}; ${report.errors
        .map((item) => `frame ${item.frame}: ${item.message}`)
        .join("; ")}`,
    );
  }

  return { ...base, vision: report };
}
