import type { RemotionAutoQualityPipelineOptions } from "../probe/remotion-auto-quality-pipeline.js";
import { officialRemotionRendererDriver } from "../probe/official-remotion-renderer.js";
import {
  runRemotionVisionQualityPipeline,
  type RemotionVisionQualityPipelineResult,
  type VisionQualityPassOptions,
} from "./vision-quality-pipeline.js";

export function runOfficialRemotionVisionQualityPipeline(
  options: RemotionAutoQualityPipelineOptions,
  vision: VisionQualityPassOptions,
): Promise<RemotionVisionQualityPipelineResult> {
  return runRemotionVisionQualityPipeline(
    options,
    officialRemotionRendererDriver,
    vision,
  );
}
