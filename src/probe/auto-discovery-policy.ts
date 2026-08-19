import type { ElementRole } from "../adapters/remotion-quality-types.js";

export interface AutoDiscoveryFeatures {
  areaRatio: number;
  centerDistance: number;
  fontSizeRatio: number;
  fontWeight: number;
  hasText: boolean;
  textLength: number;
  headingLevel?: number;
  mediaLike: boolean;
  visualContainer: boolean;
  ariaHidden: boolean;
  opacity: number;
  nativeId?: string;
  stableLabel?: string;
}

export interface AutoDiscoveryPolicy {
  minCandidateScore: number;
  minImportanceScore: number;
  keyElementScore: number;
  maxElements: number;
  minAreaRatio: number;
}

export const DEFAULT_AUTO_DISCOVERY_POLICY: AutoDiscoveryPolicy = {
  minCandidateScore: 0.12,
  minImportanceScore: 0.30,
  keyElementScore: 0.58,
  maxElements: 64,
  minAreaRatio: 0.0005,
};

export function scoreAutoDiscoveryFeatures(features: AutoDiscoveryFeatures): number {
  if (features.ariaHidden || features.opacity <= 0.01) return 0;

  const area = clamp01(Math.sqrt(Math.max(0, features.areaRatio)) * 3.2);
  const center = clamp01(1 - features.centerDistance);
  const typography = features.hasText
    ? clamp01(features.fontSizeRatio * 9 + (features.fontWeight >= 600 ? 0.18 : 0))
    : 0;
  const heading = features.headingLevel ? clamp01(1.05 - features.headingLevel * 0.12) : 0;
  const semantic = features.hasText
    ? clamp01(0.35 + Math.min(features.textLength, 80) / 160)
    : 0;
  const identity = features.nativeId || features.stableLabel ? 0.18 : 0;
  const media = features.mediaLike ? 1 : 0;
  const container = features.visualContainer ? 0.7 : 0;

  const score =
    0.30 * area +
    0.15 * center +
    0.20 * typography +
    0.10 * heading +
    0.10 * semantic +
    0.08 * media +
    0.05 * container +
    0.02 * identity;

  return clamp01(score * Math.sqrt(clamp01(features.opacity)));
}

export function inferAutoDiscoveryRole(
  features: AutoDiscoveryFeatures,
  score: number,
): ElementRole {
  if (features.ariaHidden || score < 0.12) return "decorative";
  if (features.headingLevel || score >= 0.68) return "primary";
  if (features.hasText) return "text";
  if (features.visualContainer && features.areaRatio >= 0.04) return "container";
  return "secondary";
}

export function shouldConsiderAutoCandidate(
  features: AutoDiscoveryFeatures,
  policy: AutoDiscoveryPolicy = DEFAULT_AUTO_DISCOVERY_POLICY,
): boolean {
  if (features.ariaHidden || features.opacity <= 0.01) return false;
  if (features.areaRatio < policy.minAreaRatio && !features.hasText && !features.mediaLike) return false;
  return scoreAutoDiscoveryFeatures(features) >= policy.minCandidateScore;
}

export function shouldPromoteAutoCandidate(
  features: AutoDiscoveryFeatures,
  policy: AutoDiscoveryPolicy = DEFAULT_AUTO_DISCOVERY_POLICY,
): boolean {
  return shouldConsiderAutoCandidate(features, policy) &&
    scoreAutoDiscoveryFeatures(features) >= policy.minImportanceScore;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
