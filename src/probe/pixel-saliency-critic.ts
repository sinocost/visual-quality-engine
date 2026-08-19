import sharp from "sharp";
import type { RemotionCompositionInput } from "../adapters/remotion-quality-types.js";
import type { CapturedRenderFrame } from "./frame-inspector.js";
import type { DomProbeFrameArtifact } from "./dom-probe-types.js";
import { analyzeRawSaliencyFrame, type SaliencyFrameResult } from "./saliency-core.js";

export interface SaliencyFinding {
  frame: number;
  kind: "uncovered-saliency";
  coveredSaliencyRatio: number;
  topUncoveredRegions: SaliencyFrameResult["topUncoveredRegions"];
}

export interface VisionSaliencyReport {
  critic: string;
  framesAnalyzed: number;
  minimumCoveredSaliencyRatio: number;
  averageCoveredSaliencyRatio: number;
  findings: SaliencyFinding[];
  frames: SaliencyFrameResult[];
}

export interface VisionSaliencyCriticInput {
  frames: CapturedRenderFrame[];
  probeFrames: DomProbeFrameArtifact[];
  composition: RemotionCompositionInput;
  minCoveredSaliencyRatio?: number;
}

export interface VisionSaliencyCritic {
  analyze(input: VisionSaliencyCriticInput): Promise<VisionSaliencyReport>;
}

export class PixelSaliencyCritic implements VisionSaliencyCritic {
  constructor(
    private readonly analysisWidth = 96,
    private readonly analysisHeight = 54,
  ) {}

  async analyze(input: VisionSaliencyCriticInput): Promise<VisionSaliencyReport> {
    const probeByFrame = new Map(input.probeFrames.map((frame) => [frame.frame, frame]));
    const results: SaliencyFrameResult[] = [];

    for (const captured of [...input.frames].sort((a, b) => a.frame - b.frame)) {
      const probe = probeByFrame.get(captured.frame);
      const { data, info } = await sharp(captured.buffer, { failOn: "error" })
        .resize(this.analysisWidth, this.analysisHeight, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      results.push(analyzeRawSaliencyFrame({
        frame: captured.frame,
        width: info.width,
        height: info.height,
        channels: info.channels,
        pixels: data,
        compositionWidth: input.composition.width,
        compositionHeight: input.composition.height,
        trackedBoxes: (probe?.elements ?? [])
          .filter((element) => element.visible && element.role !== "decorative")
          .map((element) => ({ id: element.id, box: element.box })),
      }));
    }

    const threshold = input.minCoveredSaliencyRatio ?? 0.72;
    const covered = results.map((result) => result.coveredSaliencyRatio);
    return {
      critic: "pixel-saliency-v1",
      framesAnalyzed: results.length,
      minimumCoveredSaliencyRatio: covered.length ? Math.min(...covered) : 1,
      averageCoveredSaliencyRatio: covered.length
        ? covered.reduce((sum, value) => sum + value, 0) / covered.length
        : 1,
      findings: results
        .filter((result) => result.coveredSaliencyRatio < threshold)
        .map((result) => ({
          frame: result.frame,
          kind: "uncovered-saliency" as const,
          coveredSaliencyRatio: result.coveredSaliencyRatio,
          topUncoveredRegions: result.topUncoveredRegions,
        })),
      frames: results,
    };
  }
}
