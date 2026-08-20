import type {
  BoundingBox,
  ElementRole,
  RemotionCompositionInput,
} from "../adapters/remotion-quality-types.js";
import type { CapturedRenderFrame } from "../probe/frame-inspector.js";
import type { DomProbeFrameArtifact } from "../probe/dom-probe-types.js";
import type { VisionSaliencyReport } from "../probe/pixel-saliency-critic.js";
import type { RemotionAutoSceneInput } from "../probe/probe-materializer.js";

export type VisionCriterionId =
  | "primary-focus"
  | "hierarchy"
  | "semantic-relevance"
  | "attention-competition";

export interface VisionContextElement {
  id: string;
  role: ElementRole;
  text?: string;
  box: BoundingBox;
  source?: "explicit" | "auto";
  importanceScore?: number;
  tagName?: string;
}

export interface VisionContextSaliency {
  coveredSaliencyRatio: number;
  topUncoveredRegions: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    saliencyRatio: number;
  }>;
}

export interface VisionCriticProviderFrameInput {
  frame: number;
  sceneId?: string;
  sceneClaims: string[];
  image: Uint8Array;
  imageMimeType: "image/png";
  elements: VisionContextElement[];
  saliency?: VisionContextSaliency;
}

export interface VisionCriterionAssessment {
  score: number;
  confidence: number;
  elementIds: string[];
  rationale: string;
  recommendation: string;
}

export interface VisionCriticProviderFrameOutput {
  primaryFocus: VisionCriterionAssessment;
  hierarchy: VisionCriterionAssessment;
  semanticRelevance: VisionCriterionAssessment;
  attentionCompetition: VisionCriterionAssessment;
}

export interface VisionCriticProvider {
  readonly name: string;
  evaluateFrame(
    input: VisionCriticProviderFrameInput,
  ): Promise<VisionCriticProviderFrameOutput>;
}

export interface VisionCriticFrameAssessment
  extends VisionCriticProviderFrameOutput {
  frame: number;
  sceneId?: string;
  provider: string;
}

export interface VisionCriticFinding {
  frame: number;
  sceneId?: string;
  criterion: VisionCriterionId;
  severity: "warning" | "major";
  score: number;
  confidence: number;
  elementIds: string[];
  message: string;
  recommendation: string;
}

export interface VisionCriticAggregate {
  overallScore: number;
  primaryFocusScore: number;
  hierarchyScore: number;
  semanticRelevanceScore: number;
  attentionCompetitionScore: number;
}

export interface VisionCriticError {
  frame: number;
  message: string;
}

export interface VisionCriticReport {
  critic: "vision-critic-v1";
  provider: string;
  status: "completed" | "partial" | "unavailable";
  framesRequested: number;
  framesAnalyzed: number;
  aggregate: VisionCriticAggregate;
  findings: VisionCriticFinding[];
  frames: VisionCriticFrameAssessment[];
  errors: VisionCriticError[];
}

export interface VisionCriticInput {
  frames: CapturedRenderFrame[];
  probeFrames: DomProbeFrameArtifact[];
  composition: RemotionCompositionInput;
  scenes: RemotionAutoSceneInput[];
  saliency: VisionSaliencyReport | null;
}

export interface VisionCriticOptions {
  maxFrames?: number;
  concurrency?: number;
  warnBelow?: number;
  majorBelow?: number;
}
