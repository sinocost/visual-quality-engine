import type { ElementRole } from "../adapters/remotion-quality-types.js";
import {
  DOM_PROBE_VERSION,
  type DomProbeAlignment,
  type DomProbeElementSnapshot,
  type DomProbeFrameArtifact,
  type DomProbeOptions,
  type QualityElementAnnotation,
} from "./dom-probe-types.js";

const DEFAULT_ROOT_SELECTOR = "[data-vqe-root]";
const DEFAULT_ELEMENT_SELECTOR = "[data-vqe-id]";
const ROLES = new Set<ElementRole>(["primary", "secondary", "text", "decorative", "container"]);

export function qualityRootAttributes(): Record<string, string> {
  return { "data-vqe-root": "true" };
}

export function qualitySceneAttributes(sceneId: string): Record<string, string> {
  return { "data-vqe-scene-id": sceneId };
}

export function qualityElementAttributes(annotation: QualityElementAnnotation): Record<string, string> {
  const attrs: Record<string, string> = {
    "data-vqe-id": annotation.id,
  };
  if (annotation.role) attrs["data-vqe-role"] = annotation.role;
  if (annotation.sceneId) attrs["data-vqe-scene-id"] = annotation.sceneId;
  if (annotation.allowOverlapWith?.length) {
    attrs["data-vqe-allow-overlap-with"] = annotation.allowOverlapWith.join(",");
  }
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

export function collectDomQualityProbeFrame(
  doc: Document,
  options: DomProbeOptions,
): DomProbeFrameArtifact {
  const rootSelector = options.rootSelector ?? DEFAULT_ROOT_SELECTOR;
  const elementSelector = options.elementSelector ?? DEFAULT_ELEMENT_SELECTOR;
  const root = doc.querySelector<HTMLElement>(rootSelector);
  const queryRoot: ParentNode = root ?? doc;
  const rootRect = root?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    width: options.width,
    height: options.height,
  };

  const nodes = [...queryRoot.querySelectorAll<HTMLElement>(elementSelector)];
  const ids = nodes.map((node) => node.dataset.vqeId?.trim()).filter(isNonEmptyString);
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const duplicateIds = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();

  const elements = nodes
    .map((node) => toSnapshot(doc, node, rootRect.left, rootRect.top))
    .filter((item): item is DomProbeElementSnapshot => item !== null);

  const fontsStatus = doc.fonts
    ? doc.fonts.status === "loaded"
      ? "loaded"
      : "loading"
    : "unsupported";

  return {
    version: DOM_PROBE_VERSION,
    frame: options.frame,
    width: options.width,
    height: options.height,
    rootFound: Boolean(root),
    documentFontsStatus: fontsStatus,
    duplicateIds,
    elements,
  };
}

function toSnapshot(
  doc: Document,
  node: HTMLElement,
  rootLeft: number,
  rootTop: number,
): DomProbeElementSnapshot | null {
  const id = node.dataset.vqeId?.trim();
  if (!id) return null;

  const rect = node.getBoundingClientRect();
  const style = doc.defaultView?.getComputedStyle(node);
  if (!style) return null;

  const role = parseRole(node.dataset.vqeRole, node);
  const text = normalizeText(node.textContent ?? "");
  const fontSizePx = finiteOr(parseFloat(style.fontSize), 0);
  const opacity = finiteOr(parseFloat(style.opacity), 1);
  const parentTracked = node.parentElement?.closest<HTMLElement>(DEFAULT_ELEMENT_SELECTOR);
  const sceneOwner = node.closest<HTMLElement>("[data-vqe-scene-id]");
  const visible =
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.visibility !== "collapse" &&
    opacity > 0.01 &&
    rect.width > 0.5 &&
    rect.height > 0.5;

  const typography = text
    ? {
        fontFamily: style.fontFamily,
        fontSizePx,
        fontWeight: style.fontWeight,
        lineHeightPx: style.lineHeight === "normal" ? null : finiteOr(parseFloat(style.lineHeight), null),
        text,
        fontReady: isFontReady(doc, fontSizePx, style.fontFamily),
      }
    : undefined;

  return {
    id,
    sceneId: node.dataset.vqeSceneId?.trim() || sceneOwner?.dataset.vqeSceneId?.trim() || undefined,
    role,
    parentId: parentTracked?.dataset.vqeId?.trim() || undefined,
    allowOverlapWith: splitList(node.dataset.vqeAllowOverlapWith),
    allowClipping: node.dataset.vqeAllowClipping === "true",
    allowTextOverflow: node.dataset.vqeAllowTextOverflow === "true",
    requiredVisible: node.dataset.vqeRequiredVisible === "true",
    box: {
      x: rect.left - rootLeft,
      y: rect.top - rootTop,
      width: rect.width,
      height: rect.height,
    },
    visible,
    opacity,
    display: style.display,
    visibility: style.visibility,
    clientWidth: node.clientWidth,
    clientHeight: node.clientHeight,
    scrollWidth: node.scrollWidth,
    scrollHeight: node.scrollHeight,
    overflowX: style.overflowX,
    overflowY: style.overflowY,
    alignment: parseAlignment(node),
    typography,
  };
}

function parseRole(value: string | undefined, node: HTMLElement): ElementRole {
  if (value && ROLES.has(value as ElementRole)) return value as ElementRole;
  if (normalizeText(node.textContent ?? "")) return "text";
  return "secondary";
}

function parseAlignment(node: HTMLElement): DomProbeAlignment | undefined {
  const groupId = node.dataset.vqeAlignGroup?.trim();
  if (!groupId) return undefined;
  const axis = node.dataset.vqeAlignAxis === "x" ? "x" : "y";
  const rawAnchor = node.dataset.vqeAlignAnchor;
  const anchor = rawAnchor === "center" || rawAnchor === "end" ? rawAnchor : "start";
  return { groupId, axis, anchor };
}

function isFontReady(doc: Document, fontSizePx: number, fontFamily: string): boolean {
  if (!doc.fonts || typeof doc.fonts.check !== "function") return true;
  if (!fontSizePx || !fontFamily) return true;
  try {
    return doc.fonts.check(`${fontSizePx}px ${fontFamily}`);
  } catch {
    return doc.fonts.status === "loaded";
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((item) => item.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

function finiteOr<T>(value: number, fallback: T): number | T {
  return Number.isFinite(value) ? value : fallback;
}

function isNonEmptyString(value: string | undefined): value is string {
  return Boolean(value);
}
