import type { QualitySnapshot } from "../types.js";

/**
 * Contract between a Remotion project and Visual Quality Engine.
 *
 * Keep project-specific extraction here. The quality engine must not depend on
 * a project's React component tree or VideoSpec schema directly.
 */
export interface RemotionQualityAdapter<InputProject = unknown> {
  collect(project: InputProject): Promise<QualitySnapshot>;
}

/**
 * Recommended extraction pipeline:
 * 1. VideoSpec/scene graph -> layout, typography, semantic claims, motion reasons.
 * 2. Timeline/keyframes -> event spacing, holds, concurrency, easing, teleportation.
 * 3. Transcript timestamps -> narration/visual sync.
 * 4. Preview render -> overlap/render integrity + future saliency metrics.
 */
