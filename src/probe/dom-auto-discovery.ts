import {
  DEFAULT_AUTO_DISCOVERY_POLICY,
  inferAutoDiscoveryRole,
  scoreAutoDiscoveryFeatures,
  shouldConsiderAutoCandidate,
  type AutoDiscoveryFeatures,
  type AutoDiscoveryPolicy,
} from "./auto-discovery-policy.js";
import {
  createStableAutoId,
  isMeaningfulVisualNode,
  measureCandidateFeatures,
  parseExplicitRole,
  resolveSceneId,
} from "./dom-auto-features.js";
import type {
  DomProbeAutoDiscoveryOptions,
  DomProbeCoverage,
  DomProbeCoverageCandidate,
  DomProbeOptions,
} from "./dom-probe-types.js";
import type { ElementRole } from "../adapters/remotion-quality-types.js";

const IGNORED_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "HEAD", "TITLE", "SOURCE", "TRACK", "BR"]);

export interface CandidateNode {
  node: HTMLElement;
  id: string;
  sceneId?: string;
  source: "explicit" | "auto";
  features: AutoDiscoveryFeatures;
  importanceScore: number;
  role: ElementRole;
  promoted: boolean;
}

export interface ResolvedAutoDiscovery {
  enabled: boolean;
  policy: AutoDiscoveryPolicy;
  ignoreSelectors: string[];
}

export function resolveAutoDiscovery(value: DomProbeOptions["autoDiscovery"]): ResolvedAutoDiscovery {
  if (value === false || value === undefined) {
    return { enabled: false, policy: DEFAULT_AUTO_DISCOVERY_POLICY, ignoreSelectors: [] };
  }
  if (value === true) {
    return { enabled: true, policy: DEFAULT_AUTO_DISCOVERY_POLICY, ignoreSelectors: [] };
  }
  const config: DomProbeAutoDiscoveryOptions = value;
  return {
    enabled: config.enabled ?? true,
    ignoreSelectors: config.ignoreSelectors ?? [],
    policy: {
      minCandidateScore: config.minCandidateScore ?? DEFAULT_AUTO_DISCOVERY_POLICY.minCandidateScore,
      minImportanceScore: config.minImportanceScore ?? DEFAULT_AUTO_DISCOVERY_POLICY.minImportanceScore,
      keyElementScore: config.keyElementScore ?? DEFAULT_AUTO_DISCOVERY_POLICY.keyElementScore,
      maxElements: config.maxElements ?? DEFAULT_AUTO_DISCOVERY_POLICY.maxElements,
      minAreaRatio: config.minAreaRatio ?? DEFAULT_AUTO_DISCOVERY_POLICY.minAreaRatio,
    },
  };
}

export function buildExplicitCandidates(
  doc: Document,
  nodes: HTMLElement[],
  rootRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  reservedIds: Set<string>,
): CandidateNode[] {
  return nodes.flatMap((node) => {
    const id = node.dataset.vqeId?.trim();
    if (!id) return [];
    reservedIds.add(id);
    const features = measureCandidateFeatures(doc, node, rootRect);
    return [{
      node,
      id,
      source: "explicit" as const,
      sceneId: resolveSceneId(node),
      features,
      importanceScore: Math.max(0.2, scoreAutoDiscoveryFeatures(features)),
      role: parseExplicitRole(node.dataset.vqeRole, node),
      promoted: true,
    }];
  });
}

export function discoverAutoCandidates(
  doc: Document,
  queryRoot: ParentNode,
  root: HTMLElement | null,
  rootRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  elementSelector: string,
  reservedIds: Set<string>,
  resolved: ResolvedAutoDiscovery,
): CandidateNode[] {
  if (!resolved.enabled) return [];
  const result: CandidateNode[] = [];
  const nodes = [...queryRoot.querySelectorAll<HTMLElement>("*")].filter((node) => isHTMLElement(doc, node));
  for (const node of nodes) {
    if (node === root || IGNORED_TAGS.has(node.tagName)) continue;
    if (node.dataset.vqeIgnore === "true" || matchesAny(node, resolved.ignoreSelectors)) continue;
    if (node.matches(elementSelector) || node.closest(elementSelector)) continue;
    const features = measureCandidateFeatures(doc, node, rootRect);
    if (!isMeaningfulVisualNode(doc, node, features)) continue;
    if (!shouldConsiderAutoCandidate(features, resolved.policy)) continue;
    const importanceScore = scoreAutoDiscoveryFeatures(features);
    const id = createStableAutoId(doc, node, root, reservedIds);
    reservedIds.add(id);
    result.push({
      node,
      id,
      source: "auto",
      sceneId: resolveSceneId(node),
      features,
      importanceScore,
      role: inferAutoDiscoveryRole(features, importanceScore),
      promoted: false,
    });
  }
  return result;
}

export function promoteAutoCandidates(candidates: CandidateNode[], policy: AutoDiscoveryPolicy): CandidateNode[] {
  const promoted = candidates
    .filter((candidate) => candidate.importanceScore >= policy.minImportanceScore)
    .sort((a, b) => b.importanceScore - a.importanceScore || a.id.localeCompare(b.id))
    .slice(0, policy.maxElements);
  const ids = new Set(promoted.map((candidate) => candidate.id));
  for (const candidate of candidates) candidate.promoted = ids.has(candidate.id);
  return promoted;
}

export function buildCoverage(candidates: CandidateNode[], policy: AutoDiscoveryPolicy): DomProbeCoverage {
  const rows: DomProbeCoverageCandidate[] = candidates.map((candidate) => ({
    id: candidate.id,
    sceneId: candidate.sceneId,
    source: candidate.source,
    importanceScore: candidate.importanceScore,
    promoted: candidate.promoted,
    keyElement: candidate.source === "auto" && candidate.importanceScore >= policy.keyElementScore,
    tagName: candidate.node.tagName.toLowerCase(),
    nativeId: candidate.node.id || undefined,
    box: rectToBox(candidate.node.getBoundingClientRect()),
  }));
  const totalImportance = sumImportance(rows);
  const explicitImportance = sumImportance(rows.filter((candidate) => candidate.source === "explicit"));
  const resolvedImportance = sumImportance(rows.filter((candidate) => candidate.source === "explicit" || candidate.promoted));
  const ratio = (value: number) => totalImportance > 1e-9 ? Math.min(1, value / totalImportance) : 1;
  return {
    candidateCount: rows.length,
    explicitElementCount: rows.filter((candidate) => candidate.source === "explicit").length,
    autoPromotedCount: rows.filter((candidate) => candidate.source === "auto" && candidate.promoted).length,
    totalImportance,
    explicitImportance,
    resolvedImportance,
    explicitCoverageRatio: ratio(explicitImportance),
    resolvedCoverageRatio: ratio(resolvedImportance),
    candidates: rows,
  };
}

export function findNearestTrackedParentId(node: HTMLElement, trackedNodeIds: Map<HTMLElement, string>): string | undefined {
  let parent = node.parentElement;
  while (parent) {
    const id = trackedNodeIds.get(parent);
    if (id) return id;
    parent = parent.parentElement;
  }
  return undefined;
}

export function isHTMLElement(doc: Document, node: Element): node is HTMLElement {
  const ctor = doc.defaultView?.HTMLElement;
  return ctor ? node instanceof ctor : "dataset" in node;
}

function matchesAny(node: HTMLElement, selectors: string[]): boolean {
  return selectors.some((selector) => {
    try { return node.matches(selector); } catch { return false; }
  });
}

function rectToBox(rect: DOMRect) {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function sumImportance(rows: DomProbeCoverageCandidate[]): number {
  return rows.reduce((sum, candidate) => sum + candidate.importanceScore, 0);
}
