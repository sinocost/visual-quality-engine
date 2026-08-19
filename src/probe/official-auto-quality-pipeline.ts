import {
  runRemotionAutoQualityPipeline,
  type RemotionAutoQualityPipelineOptions,
  type RemotionAutoQualityPipelineResult,
} from "./remotion-auto-quality-pipeline.js";
import { officialRemotionRendererDriver } from "./official-remotion-renderer.js";

export function runOfficialRemotionAutoQualityPipeline(
  options: RemotionAutoQualityPipelineOptions,
): Promise<RemotionAutoQualityPipelineResult> {
  return runRemotionAutoQualityPipeline(options, officialRemotionRendererDriver);
}
