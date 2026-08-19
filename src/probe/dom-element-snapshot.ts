import type { DomProbeAlignment, DomProbeClippingAncestor, DomProbeElementSnapshot } from "./dom-probe-types.js";
import { findNearestTrackedParentId, type CandidateNode } from "./dom-auto-discovery.js";

const CLIP_EPSILON_PX = 1;

export function toDomProbeSnapshot(
  doc: Document,
  candidate: CandidateNode,
  root: HTMLElement | null,
  rootLeft: number,
  rootTop: number,
  trackedNodeIds: Map<HTMLElement, string>,
): DomProbeElementSnapshot | null {
  const { node } = candidate;
  const rect = node.getBoundingClientRect();
  const style = doc.defaultView?.getComputedStyle(node);
  if (!style) return null;

  const ownsText = candidate.source === "explicit" || candidate.features.hasText || Boolean(candidate.features.headingLevel);
  const text = ownsText ? normalizeText(node.textContent ?? "") : "";
  const fontSizePx = finiteOr(parseFloat(style.fontSize), 0);
  const opacity = finiteOr(parseFloat(style.opacity), 1);
  const visible = style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" &&
    opacity > 0.01 && rect.width > 0.5 && rect.height > 0.5;

  const typography = text ? {
    fontFamily: style.fontFamily,
    fontSizePx,
    fontWeight: style.fontWeight,
    lineHeightPx: style.lineHeight === "normal" ? null : finiteOr(parseFloat(style.lineHeight), null),
    text,
    fontReady: isFontReady(doc, fontSizePx, style.fontFamily),
  } : undefined;

  return {
    id: candidate.id,
    sceneId: candidate.sceneId,
    role: candidate.role,
    parentId: findNearestTrackedParentId(node, trackedNodeIds),
    allowOverlapWith: splitList(node.dataset.vqeAllowOverlapWith),
    allowClipping: node.dataset.vqeAllowClipping === "true",
    allowTextOverflow: node.dataset.vqeAllowTextOverflow === "true",
    requiredVisible: node.dataset.vqeRequiredVisible === "true",
    box: { x: rect.left - rootLeft, y: rect.top - rootTop, width: rect.width, height: rect.height },
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
    clippingAncestor: findClippingAncestor(doc, node, root, rect),
    alignment: parseAlignment(node),
    typography,
    source: candidate.source,
    importanceScore: candidate.importanceScore,
    nativeId: node.id || undefined,
    tagName: node.tagName.toLowerCase(),
  };
}

function findClippingAncestor(doc: Document, node: HTMLElement, root: HTMLElement | null, rect: DOMRect): DomProbeClippingAncestor | undefined {
  let current = node.parentElement;
  while (current && current !== root) {
    const style = doc.defaultView?.getComputedStyle(current);
    if (style) {
      const ancestorRect = current.getBoundingClientRect();
      const clipsX = isClippingOverflow(style.overflowX) &&
        (rect.left < ancestorRect.left - CLIP_EPSILON_PX || rect.right > ancestorRect.right + CLIP_EPSILON_PX);
      const clipsY = isClippingOverflow(style.overflowY) &&
        (rect.top < ancestorRect.top - CLIP_EPSILON_PX || rect.bottom > ancestorRect.bottom + CLIP_EPSILON_PX);
      if (clipsX || clipsY) {
        return {
          qualityElementId: current.dataset.vqeId?.trim() || undefined,
          tagName: current.tagName.toLowerCase(),
          overflowX: style.overflowX,
          overflowY: style.overflowY,
        };
      }
    }
    current = current.parentElement;
  }
  return undefined;
}

function isClippingOverflow(value: string): boolean {
  return value === "hidden" || value === "clip" || value === "auto" || value === "scroll";
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
  try { return doc.fonts.check(`${fontSizePx}px ${fontFamily}`); }
  catch { return doc.fonts.status === "loaded"; }
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
