import type { MetricResult, QualityReport, QualitySnapshot, Severity } from "./types.js";

type Rule = {
  id: string;
  category: string;
  severity: Severity;
  expected: string;
  actual: (s: QualitySnapshot) => number;
  pass: (value: number) => boolean;
  message: (value: number) => string;
};

const RULES: Rule[] = [
  { id:"C03", category:"composition", severity:"major", expected:">= 0.04", actual:s=>s.metrics.safeMarginRatio, pass:v=>v>=0.04, message:v=>`safe margin ratio ${v.toFixed(3)}; require >= 0.04` },
  { id:"C04", category:"composition", severity:"major", expected:"<= 4px@1080p", actual:s=>s.metrics.alignmentErrorPx1080, pass:v=>v<=4, message:v=>`alignment error ${v.toFixed(1)}px@1080p; require <= 4` },
  { id:"C06", category:"composition", severity:"critical", expected:"= 0", actual:s=>s.metrics.unexpectedOverlapRatio, pass:v=>v<=0, message:v=>`unexpected overlap ratio ${v.toFixed(3)}; require 0` },
  { id:"T01", category:"typography", severity:"major", expected:"<= 2", actual:s=>s.metrics.fontFamilies, pass:v=>v<=2, message:v=>`${v} font families; require <= 2` },
  { id:"T03", category:"typography", severity:"major", expected:">= 28px@1080p", actual:s=>s.metrics.minFontSizePx1080, pass:v=>v>=28, message:v=>`minimum font ${v.toFixed(1)}px@1080p; require >= 28` },
  { id:"T06", category:"typography", severity:"major", expected:"<= 6 CJK chars/s", actual:s=>s.metrics.maxCjkCharsPerSecond, pass:v=>v<=6, message:v=>`reading load ${v.toFixed(2)} CJK chars/s; require <= 6` },
  { id:"M01", category:"motion", severity:"major", expected:"<= 2 primary motion groups", actual:s=>s.metrics.maxConcurrentPrimaryMotionGroups, pass:v=>v<=2, message:v=>`${v} concurrent primary motion groups; require <= 2` },
  { id:"M03", category:"motion", severity:"warning", expected:"< 0.20", actual:s=>s.metrics.linearEntranceExitRatio, pass:v=>v<0.20, message:v=>`linear entrance/exit ratio ${v.toFixed(2)}; require < 0.20` },
  { id:"R03", category:"rhythm", severity:"major", expected:">= 0.20s", actual:s=>s.metrics.minKeyEventSpacingSec, pass:v=>v>=0.20, message:v=>`key-event spacing ${v.toFixed(2)}s; require >= 0.20s` },
  { id:"R04", category:"rhythm", severity:"major", expected:">= 0.60s", actual:s=>s.metrics.minResolutionHoldSec, pass:v=>v>=0.60, message:v=>`resolution hold ${v.toFixed(2)}s; require >= 0.60s` },
  { id:"R05", category:"rhythm", severity:"major", expected:"<= 0.40s", actual:s=>s.metrics.maxAbsVoiceSyncOffsetSec, pass:v=>v<=0.40, message:v=>`voice/visual max offset ${v.toFixed(2)}s; require <= 0.40s` },
  { id:"CN02", category:"continuity", severity:"critical", expected:"< 0.12 frame diagonal", actual:s=>s.metrics.maxTeleportRatio, pass:v=>v<0.12, message:v=>`unexplained position jump ratio ${v.toFixed(3)}; require < 0.12` },
  { id:"S01", category:"semantic", severity:"major", expected:"<= 1 primary claim/scene", actual:s=>s.metrics.maxPrimaryClaimsPerScene, pass:v=>v<=1, message:v=>`${v} primary claims in a scene; require <= 1` },
  { id:"S02", category:"semantic", severity:"major", expected:">= 0.90", actual:s=>s.metrics.semanticLinkedMotionRatio, pass:v=>v>=0.90, message:v=>`semantic-linked motion ratio ${v.toFixed(2)}; require >= 0.90` },
  { id:"Q02", category:"quality", severity:"critical", expected:"= 0 integrity issues", actual:s=>s.metrics.renderIntegrityIssues, pass:v=>v===0, message:v=>`${v} render integrity issues; require 0` },
];

function scoreFor(rule: Rule, pass: boolean): number {
  if (pass) return 100;
  if (rule.severity === "critical") return 0;
  if (rule.severity === "major") return 45;
  return 70;
}

export function validateP0(snapshot: QualitySnapshot): QualityReport {
  const results: MetricResult[] = RULES.map(rule => {
    const value = rule.actual(snapshot);
    const ok = rule.pass(value);
    return {
      metricId: rule.id,
      category: rule.category,
      severity: rule.severity,
      status: ok ? "pass" : (rule.severity === "warning" ? "warn" : "fail"),
      score: scoreFor(rule, ok),
      confidence: 1,
      actual: value,
      expected: rule.expected,
      evidence: snapshot.evidence?.[rule.id] ?? {},
      message: rule.message(value),
    };
  });

  const hardGateFailed = results.some(r => r.status === "fail" && (r.metricId === "Q02" || r.severity === "critical"));
  const failed = results.some(r => r.status === "fail");
  const provisionalScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
  const status = hardGateFailed ? "reject" : failed ? "review" : "pass";

  return {
    profile: snapshot.profile,
    status,
    hardGateFailed,
    provisionalScore,
    coverage: { implementedMetrics: RULES.length, catalogMetrics: 50 },
    results,
  };
}
