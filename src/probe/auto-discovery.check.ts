import {
  inferAutoDiscoveryRole,
  scoreAutoDiscoveryFeatures,
  type AutoDiscoveryFeatures,
} from "./auto-discovery-policy.js";
import { analyzeAutoProbeCoverage } from "./coverage-analyzer.js";
import { DOM_PROBE_VERSION, type DomProbeFrameArtifact } from "./dom-probe-types.js";
import { analyzeRawSaliencyFrame } from "./saliency-core.js";

const title: AutoDiscoveryFeatures = {
  areaRatio: 0.08,
  centerDistance: 0.15,
  fontSizeRatio: 0.075,
  fontWeight: 700,
  hasText: true,
  textLength: 18,
  headingLevel: 1,
  mediaLike: false,
  visualContainer: false,
  ariaHidden: false,
  opacity: 1,
  nativeId: "hero-title",
};
const decoration: AutoDiscoveryFeatures = {
  areaRatio: 0.01,
  centerDistance: 0.8,
  fontSizeRatio: 0,
  fontWeight: 400,
  hasText: false,
  textLength: 0,
  mediaLike: false,
  visualContainer: false,
  ariaHidden: true,
  opacity: 0.5,
};
const titleScore = scoreAutoDiscoveryFeatures(title);
const decorationScore = scoreAutoDiscoveryFeatures(decoration);
assert(titleScore > 0.58, "heading is promoted as a key auto element");
assert(decorationScore === 0, "aria-hidden decoration is ignored");
assert(inferAutoDiscoveryRole(title, titleScore) === "primary", "heading role is primary");

const probe: DomProbeFrameArtifact = {
  version: DOM_PROBE_VERSION,
  frame: 0,
  width: 320,
  height: 180,
  rootFound: true,
  documentFontsStatus: "loaded",
  duplicateIds: [],
  elements: [],
  coverage: {
    candidateCount: 3,
    explicitElementCount: 1,
    autoPromotedCount: 1,
    totalImportance: 1.8,
    explicitImportance: 0.5,
    resolvedImportance: 1.5,
    explicitCoverageRatio: 0.5 / 1.8,
    resolvedCoverageRatio: 1.5 / 1.8,
    candidates: [
      { id: "explicit", source: "explicit", importanceScore: 0.5, promoted: true, keyElement: false, tagName: "div", box: {x:10,y:10,width:50,height:30} },
      { id: "hero-title", source: "auto", importanceScore: 1.0, promoted: true, keyElement: true, tagName: "h1", nativeId: "hero-title", box: {x:70,y:10,width:180,height:40} },
      { id: "minor", source: "auto", importanceScore: 0.3, promoted: false, keyElement: false, tagName: "span", box: {x:10,y:150,width:40,height:10} },
    ],
  },
};
const coverage = analyzeAutoProbeCoverage([probe], 0.8);
assert(coverage.keyAutoElementIds.includes("hero-title"), "coverage reports unmarked key element");
assert(coverage.minResolvedCoverageRatio > coverage.minExplicitCoverageRatio, "auto discovery improves coverage");
assert(coverage.framesBelowTarget.length === 0, "resolved coverage clears target");

const width = 12;
const height = 8;
const pixels = new Uint8Array(width * height * 3);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 3;
    const bright = x >= 7 && x <= 10 && y >= 2 && y <= 5;
    const value = bright ? 255 : 20;
    pixels[offset] = value;
    pixels[offset + 1] = bright ? 70 : value;
    pixels[offset + 2] = bright ? 70 : value;
  }
}

const uncovered = analyzeRawSaliencyFrame({
  frame: 0,
  width,
  height,
  channels: 3,
  pixels,
  compositionWidth: 320,
  compositionHeight: 180,
  trackedBoxes: [],
});
const covered = analyzeRawSaliencyFrame({
  frame: 0,
  width,
  height,
  channels: 3,
  pixels,
  compositionWidth: 320,
  compositionHeight: 180,
  trackedBoxes: [{ id: "visual", box: { x: 170, y: 30, width: 130, height: 120 } }],
});
assert(uncovered.coveredSaliencyRatio === 0, "no tracked boxes means no saliency coverage");
assert(covered.coveredSaliencyRatio > 0.5, "tracked visual covers dominant saliency");
assert(covered.elementSaliency[0]?.elementId === "visual", "saliency is attributed to tracked element");

console.log(JSON.stringify({
  status: "PASS",
  titleScore: Number(titleScore.toFixed(3)),
  resolvedCoverage: Number(coverage.minResolvedCoverageRatio.toFixed(3)),
  saliencyCoverage: Number(covered.coveredSaliencyRatio.toFixed(3)),
}, null, 2));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
