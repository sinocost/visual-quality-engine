import type { DomProbeFrameArtifact } from "./dom-probe-types.js";

export interface AutoProbeCoverageFrame {
  frame: number;
  candidateCount: number;
  explicitElementCount: number;
  autoPromotedCount: number;
  explicitCoverageRatio: number;
  resolvedCoverageRatio: number;
  keyAutoElementIds: string[];
  autoPromotedElementIds: string[];
}

export interface AutoProbeCoverageReport {
  critic: "auto-probe-coverage-v1";
  target: number;
  framesAnalyzed: number;
  minExplicitCoverageRatio: number;
  averageExplicitCoverageRatio: number;
  minResolvedCoverageRatio: number;
  averageResolvedCoverageRatio: number;
  keyAutoElementIds: string[];
  autoPromotedElementIds: string[];
  framesBelowTarget: number[];
  frames: AutoProbeCoverageFrame[];
}

export function analyzeAutoProbeCoverage(
  frames: DomProbeFrameArtifact[],
  target = 0.85,
): AutoProbeCoverageReport {
  const rows: AutoProbeCoverageFrame[] = [];

  for (const frame of [...frames].sort((a, b) => a.frame - b.frame)) {
    const coverage = frame.coverage;
    if (!coverage) continue;

    const keyAutoElementIds = coverage.candidates
      .filter((candidate) => candidate.source === "auto" && candidate.keyElement)
      .map((candidate) => candidate.id)
      .sort();
    const autoPromotedElementIds = coverage.candidates
      .filter((candidate) => candidate.source === "auto" && candidate.promoted)
      .map((candidate) => candidate.id)
      .sort();

    rows.push({
      frame: frame.frame,
      candidateCount: coverage.candidateCount,
      explicitElementCount: coverage.explicitElementCount,
      autoPromotedCount: coverage.autoPromotedCount,
      explicitCoverageRatio: clamp01(coverage.explicitCoverageRatio),
      resolvedCoverageRatio: clamp01(coverage.resolvedCoverageRatio),
      keyAutoElementIds,
      autoPromotedElementIds,
    });
  }

  const explicit = rows.map((row) => row.explicitCoverageRatio);
  const resolved = rows.map((row) => row.resolvedCoverageRatio);

  return {
    critic: "auto-probe-coverage-v1",
    target,
    framesAnalyzed: rows.length,
    minExplicitCoverageRatio: explicit.length ? Math.min(...explicit) : 1,
    averageExplicitCoverageRatio: average(explicit, 1),
    minResolvedCoverageRatio: resolved.length ? Math.min(...resolved) : 1,
    averageResolvedCoverageRatio: average(resolved, 1),
    keyAutoElementIds: unique(rows.flatMap((row) => row.keyAutoElementIds)),
    autoPromotedElementIds: unique(rows.flatMap((row) => row.autoPromotedElementIds)),
    framesBelowTarget: rows
      .filter((row) => row.resolvedCoverageRatio < target)
      .map((row) => row.frame),
    frames: rows,
  };
}

function average(values: number[], fallback: number): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : fallback;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
