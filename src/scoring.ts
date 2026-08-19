import type { MetricResult } from "./types.js";

export const DEFAULT_CATEGORY_WEIGHTS: Record<string, number> = {
  composition: 0.15,
  hierarchy: 0.12,
  typography: 0.12,
  color: 0.08,
  motion: 0.18,
  rhythm: 0.15,
  continuity: 0.08,
  semantic: 0.12,
};

export function weightedProfessionalScore(
  results: MetricResult[],
  weights = DEFAULT_CATEGORY_WEIGHTS,
): number {
  const categories = Object.keys(weights);
  let score = 0;
  let usedWeight = 0;

  for (const category of categories) {
    const categoryResults = results.filter(r => r.category === category);
    if (!categoryResults.length) continue;
    const categoryScore = categoryResults.reduce((sum, r) => sum + r.score, 0) / categoryResults.length;
    score += categoryScore * weights[category];
    usedWeight += weights[category];
  }

  return usedWeight ? Math.round(score / usedWeight) : 0;
}
