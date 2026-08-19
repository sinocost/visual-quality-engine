export type InputKind = "S" | "V" | "T" | "A";
export type Severity = "info" | "warning" | "major" | "critical";
export type MetricStatus = "pass" | "warn" | "fail";

export interface MetricDefinition {
  id: string;
  name: string;
  category: string;
  input: InputKind[];
  formula: string;
  threshold: string;
  severity: Severity;
  autofix: string | null;
  mode: "deterministic" | "heuristic" | "semantic";
  p0: boolean;
  enabledByDefault: boolean;
}

export interface QualitySnapshot {
  profile: string;
  fps: number;
  frameWidth: number;
  frameHeight: number;
  metrics: {
    safeMarginRatio: number;
    alignmentErrorPx1080: number;
    unexpectedOverlapRatio: number;
    fontFamilies: number;
    minFontSizePx1080: number;
    maxCjkCharsPerSecond: number;
    maxConcurrentPrimaryMotionGroups: number;
    linearEntranceExitRatio: number;
    minKeyEventSpacingSec: number;
    minResolutionHoldSec: number;
    maxAbsVoiceSyncOffsetSec: number;
    maxTeleportRatio: number;
    maxPrimaryClaimsPerScene: number;
    semanticLinkedMotionRatio: number;
    renderIntegrityIssues: number;
  };
  evidence?: Record<string, MetricEvidence>;
}

export interface MetricEvidence {
  sceneId?: string;
  frameStart?: number;
  frameEnd?: number;
  elementIds?: string[];
}

export interface MetricPatch {
  target: string;
  property: string;
  before: unknown;
  after: unknown;
}

export interface MetricResult {
  metricId: string;
  category: string;
  severity: Severity;
  status: MetricStatus;
  score: number;
  confidence: number;
  actual: unknown;
  expected: unknown;
  evidence: MetricEvidence;
  message: string;
  patch?: MetricPatch;
}

export interface QualityReport {
  profile: string;
  status: "pass" | "review" | "reject";
  hardGateFailed: boolean;
  provisionalScore: number;
  coverage: {
    implementedMetrics: number;
    catalogMetrics: number;
  };
  results: MetricResult[];
}
