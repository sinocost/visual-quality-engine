import type {
  AlignmentAnchor,
  AlignmentAxis,
  BoundingBox,
  ElementRole,
} from "../adapters/remotion-quality-types.js";

export const DOM_PROBE_VERSION = "vqe-dom-probe@1" as const;

export interface DomProbeAlignment {
  groupId: string;
  axis: AlignmentAxis;
  anchor: AlignmentAnchor;
}

export interface DomProbeTypography {
  fontFamily: string;
  fontSizePx: number;
  fontWeight: string;
  lineHeightPx: number | null;
  text: string;
  fontReady: boolean;
}

export interface DomProbeClippingAncestor {
  qualityElementId?: string;
  tagName: string;
  overflowX: string;
  overflowY: string;
}

export interface DomProbeCoverageCandidate {
  id: string;
  sceneId?: string;
  source: "explicit" | "auto";
  importanceScore: number;
  promoted: boolean;
  keyElement: boolean;
  tagName: string;
  nativeId?: string;
  box: BoundingBox;
}

export interface DomProbeCoverage {
  candidateCount: number;
  explicitElementCount: number;
  autoPromotedCount: number;
  totalImportance: number;
  explicitImportance: number;
  resolvedImportance: number;
  explicitCoverageRatio: number;
  resolvedCoverageRatio: number;
  candidates: DomProbeCoverageCandidate[];
}

export interface DomProbeAutoDiscoveryOptions {
  enabled?: boolean;
  minCandidateScore?: number;
  minImportanceScore?: number;
  keyElementScore?: number;
  maxElements?: number;
  minAreaRatio?: number;
  ignoreSelectors?: string[];
}

export interface DomProbeElementSnapshot {
  id: string;
  sceneId?: string;
  role: ElementRole;
  parentId?: string;
  allowOverlapWith?: string[];
  allowClipping: boolean;
  allowTextOverflow: boolean;
  requiredVisible: boolean;
  box: BoundingBox;
  visible: boolean;
  opacity: number;
  display: string;
  visibility: string;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  overflowX: string;
  overflowY: string;
  /** Nearest non-root ancestor that actually clips this element. */
  clippingAncestor?: DomProbeClippingAncestor;
  alignment?: DomProbeAlignment;
  typography?: DomProbeTypography;
  /** Automatic-discovery provenance and evidence. */
  source?: "explicit" | "auto";
  importanceScore?: number;
  nativeId?: string;
  tagName?: string;
}

export interface DomProbeFrameArtifact {
  version: typeof DOM_PROBE_VERSION;
  frame: number;
  width: number;
  height: number;
  rootFound: boolean;
  documentFontsStatus: "loaded" | "loading" | "unsupported";
  duplicateIds: string[];
  elements: DomProbeElementSnapshot[];
  coverage?: DomProbeCoverage;
}

export interface DomProbeOptions {
  frame: number;
  width: number;
  height: number;
  rootSelector?: string;
  elementSelector?: string;
  autoDiscovery?: boolean | DomProbeAutoDiscoveryOptions;
}

export interface QualityElementAnnotation {
  id: string;
  role?: ElementRole;
  sceneId?: string;
  allowOverlapWith?: string[];
  allowClipping?: boolean;
  allowTextOverflow?: boolean;
  requiredVisible?: boolean;
  alignment?: DomProbeAlignment;
}
