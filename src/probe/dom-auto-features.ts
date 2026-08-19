import type { ElementRole } from "../adapters/remotion-quality-types.js";
import type { AutoDiscoveryFeatures } from "./auto-discovery-policy.js";

const ROLES = new Set<ElementRole>(["primary", "secondary", "text", "decorative", "container"]);

export function measureCandidateFeatures(
  doc: Document,
  node: HTMLElement,
  rootRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): AutoDiscoveryFeatures {
  const rect = node.getBoundingClientRect();
  const style = doc.defaultView?.getComputedStyle(node);
  const opacity = style ? finiteOr(parseFloat(style.opacity), 1) : 1;
  const rootArea = Math.max(1, rootRect.width * rootRect.height);
  const areaRatio = Math.max(0, rect.width * rect.height) / rootArea;
  const rootCenterX = rootRect.left + rootRect.width / 2;
  const rootCenterY = rootRect.top + rootRect.height / 2;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const halfDiagonal = Math.max(1, Math.hypot(rootRect.width, rootRect.height) / 2);
  const centerDistance = Math.min(1, Math.hypot(centerX - rootCenterX, centerY - rootCenterY) / halfDiagonal);
  const directText = normalizeText([...node.childNodes]
    .filter((child) => child.nodeType === 3)
    .map((child) => child.textContent ?? "")
    .join(" "));
  const fontSizePx = style ? finiteOr(parseFloat(style.fontSize), 0) : 0;
  const fontWeight = style ? parseFontWeight(style.fontWeight) : 400;
  const tag = node.tagName.toUpperCase();
  const headingLevel = /^H[1-6]$/.test(tag) ? Number(tag.slice(1)) : undefined;
  const mediaLike = ["IMG", "VIDEO", "CANVAS", "SVG", "PICTURE"].includes(tag);
  const visualContainer = Boolean(style && hasVisualContainerStyle(style));
  const stableLabel = node.getAttribute("aria-label")?.trim() || node.dataset.testid?.trim() || undefined;

  return {
    areaRatio,
    centerDistance,
    fontSizeRatio: rootRect.height > 0 ? fontSizePx / rootRect.height : 0,
    fontWeight,
    hasText: Boolean(directText),
    textLength: directText.length,
    headingLevel,
    mediaLike,
    visualContainer,
    ariaHidden: node.getAttribute("aria-hidden") === "true",
    opacity,
    nativeId: node.id || undefined,
    stableLabel,
  };
}

export function isMeaningfulVisualNode(doc: Document, node: HTMLElement, features: AutoDiscoveryFeatures): boolean {
  const rect = node.getBoundingClientRect();
  const style = doc.defaultView?.getComputedStyle(node);
  if (!style) return false;
  if (
    style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" ||
    features.opacity <= 0.01 || rect.width <= 0.5 || rect.height <= 0.5
  ) return false;
  if (features.areaRatio > 0.94 && !features.hasText && !features.mediaLike && !features.nativeId) return false;
  return Boolean(features.hasText || features.mediaLike || features.visualContainer || features.nativeId || features.stableLabel);
}

export function createStableAutoId(doc: Document, node: HTMLElement, root: HTMLElement | null, reservedIds: Set<string>): string {
  const native = node.id.trim();
  if (native && isUniqueNativeId(doc, native) && !reservedIds.has(native)) return native;
  const testId = node.dataset.testid?.trim();
  if (testId) {
    const candidate = `testid:${slug(testId)}`;
    if (!reservedIds.has(candidate)) return candidate;
  }
  const aria = node.getAttribute("aria-label")?.trim();
  if (aria) {
    const candidate = `aria:${slug(aria)}`;
    if (!reservedIds.has(candidate)) return candidate;
  }
  const sceneId = resolveSceneId(node) ?? "root";
  const base = `auto:${slug(sceneId)}:${domPath(node, root)}`;
  if (!reservedIds.has(base)) return base;
  let suffix = 2;
  while (reservedIds.has(`${base}#${suffix}`)) suffix++;
  return `${base}#${suffix}`;
}

export function resolveSceneId(node: HTMLElement): string | undefined {
  const owner = node.closest<HTMLElement>("[data-vqe-scene-id]");
  return node.dataset.vqeSceneId?.trim() || owner?.dataset.vqeSceneId?.trim() || undefined;
}

export function parseExplicitRole(value: string | undefined, node: HTMLElement): ElementRole {
  if (value && ROLES.has(value as ElementRole)) return value as ElementRole;
  if (normalizeText(node.textContent ?? "")) return "text";
  return "secondary";
}

function domPath(node: HTMLElement, root: HTMLElement | null): string {
  const parts: string[] = [];
  let current: HTMLElement | null = node;
  while (current && current !== root && parts.length < 7) {
    const tag = current.tagName.toLowerCase();
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) {
      parts.push(tag);
      break;
    }
    const peers = [...parent.children].filter((child) => child.tagName === current!.tagName);
    const index = Math.max(1, peers.indexOf(current) + 1);
    parts.push(`${tag}:${index}`);
    current = parent;
  }
  return parts.reverse().join("/");
}

function hasVisualContainerStyle(style: CSSStyleDeclaration): boolean {
  const background = style.backgroundColor.trim().toLowerCase();
  const hasBackground = background !== "transparent" && background !== "rgba(0, 0, 0, 0)" && background !== "rgba(0,0,0,0)";
  const border = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
    .some((value) => finiteOr(parseFloat(value), 0) > 0);
  return Boolean(hasBackground || border || (style.boxShadow && style.boxShadow !== "none"));
}

function parseFontWeight(value: string): number {
  if (value === "bold") return 700;
  if (value === "normal") return 400;
  return finiteOr(parseFloat(value), 400);
}

function isUniqueNativeId(doc: Document, id: string): boolean {
  return [...doc.querySelectorAll<HTMLElement>("[id]")].filter((node) => node.id === id).length === 1;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "element";
}

function finiteOr<T>(value: number, fallback: T): number | T {
  return Number.isFinite(value) ? value : fallback;
}
