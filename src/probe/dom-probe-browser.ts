import {
  buildCoverage,
  buildExplicitCandidates,
  discoverAutoCandidates,
  isHTMLElement,
  promoteAutoCandidates,
  resolveAutoDiscovery,
} from "./dom-auto-discovery.js";
import { toDomProbeSnapshot } from "./dom-element-snapshot.js";
import {
  DOM_PROBE_VERSION,
  type DomProbeFrameArtifact,
  type DomProbeOptions,
  type DomProbeElementSnapshot,
  type QualityElementAnnotation,
} from "./dom-probe-types.js";

const DEFAULT_ROOT_SELECTOR = "[data-vqe-root]";
const DEFAULT_ELEMENT_SELECTOR = "[data-vqe-id]";

export function qualityRootAttributes(): Record<string, string> {
  return { "data-vqe-root": "true" };
}

export function qualitySceneAttributes(sceneId: string): Record<string, string> {
  return { "data-vqe-scene-id": sceneId };
}

export function qualityElementAttributes(annotation: QualityElementAnnotation): Record<string, string> {
  const attrs: Record<string, string> = { "data-vqe-id": annotation.id };
  if (annotation.role) attrs["data-vqe-role"] = annotation.role;
  if (annotation.sceneId) attrs["data-vqe-scene-id"] = annotation.sceneId;
  if (annotation.allowOverlapWith?.length) attrs["data-vqe-allow-overlap-with"] = annotation.allowOverlapWith.join(",");
  if (annotation.allowClipping) attrs["data-vqe-allow-clipping"] = "true";
  if (annotation.allowTextOverflow) attrs["data-vqe-allow-text-overflow"] = "true";
  if (annotation.requiredVisible) attrs["data-vqe-required-visible"] = "true";
  if (annotation.alignment) {
    attrs["data-vqe-align-group"] = annotation.alignment.groupId;
    attrs["data-vqe-align-axis"] = annotation.alignment.axis;
    attrs["data-vqe-align-anchor"] = annotation.alignment.anchor;
  }
  return attrs;
}

export function collectDomQualityProbeFrame(doc: Document, options: DomProbeOptions): DomProbeFrameArtifact {
  const rootSelector = options.rootSelector ?? DEFAULT_ROOT_SELECTOR;
  const elementSelector = options.elementSelector ?? DEFAULT_ELEMENT_SELECTOR;
  const root = doc.querySelector<HTMLElement>(rootSelector);
  const queryRoot: ParentNode = root ?? doc;
  const rootRect = root?.getBoundingClientRect() ?? { left: 0, top: 0, width: options.width, height: options.height };

  const explicitNodes = [...queryRoot.querySelectorAll<HTMLElement>(elementSelector)].filter((node) => isHTMLElement(doc, node));
  const explicitIds = explicitNodes.map((node) => node.dataset.vqeId?.trim()).filter(isNonEmptyString);
  const counts = new Map<string, number>();
  for (const id of explicitIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const duplicateIds = [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();

  const auto = resolveAutoDiscovery(options.autoDiscovery);
  const reservedIds = new Set(explicitIds);
  const explicitCandidates = buildExplicitCandidates(doc, explicitNodes, rootRect, reservedIds);
  const autoCandidates = discoverAutoCandidates(doc, queryRoot, root, rootRect, elementSelector, reservedIds, auto);
  const promotedAuto = promoteAutoCandidates(autoCandidates, auto.policy);
  const tracked = [...explicitCandidates, ...promotedAuto];
  const trackedNodeIds = new Map<HTMLElement, string>(tracked.map((candidate) => [candidate.node, candidate.id]));
  const elements = tracked
    .map((candidate) => toDomProbeSnapshot(doc, candidate, root, rootRect.left, rootRect.top, trackedNodeIds))
    .filter((item): item is DomProbeElementSnapshot => item !== null);

  const allCounts = new Map<string, number>();
  for (const element of elements) allCounts.set(element.id, (allCounts.get(element.id) ?? 0) + 1);
  for (const [id, count] of allCounts) if (count > 1 && !duplicateIds.includes(id)) duplicateIds.push(id);
  duplicateIds.sort();

  const fontsStatus = doc.fonts ? (doc.fonts.status === "loaded" ? "loaded" : "loading") : "unsupported";
  return {
    version: DOM_PROBE_VERSION,
    frame: options.frame,
    width: options.width,
    height: options.height,
    rootFound: Boolean(root),
    documentFontsStatus: fontsStatus,
    duplicateIds,
    elements,
    coverage: auto.enabled ? buildCoverage([...explicitCandidates, ...autoCandidates], auto.policy) : undefined,
  };
}

function isNonEmptyString(value: string | undefined): value is string {
  return Boolean(value);
}
