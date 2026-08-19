import type {
  RenderIntegrityIssue,
  RemotionSceneQualityInput,
} from "../adapters/remotion-quality-types.js";
import type { DomProbeElementSnapshot, DomProbeFrameArtifact } from "./dom-probe-types.js";

const EPS = 1;

export function inspectDomProbeFrames(frames: DomProbeFrameArtifact[]): RenderIntegrityIssue[] {
  const issues: RenderIntegrityIssue[] = [];

  for (const probe of frames) {
    if (!probe.rootFound) {
      issues.push({
        kind: "invalid-layout",
        frame: probe.frame,
        message: "VQE root not found; add data-vqe-root to the composition canvas wrapper",
      });
    }

    for (const id of probe.duplicateIds) {
      issues.push({
        kind: "invalid-layout",
        frame: probe.frame,
        elementIds: [id],
        message: `duplicate data-vqe-id: ${id}`,
      });
    }

    if (probe.documentFontsStatus === "loading") {
      issues.push({
        kind: "font-load",
        frame: probe.frame,
        message: "document.fonts is still loading at render time",
      });
    }

    for (const element of probe.elements) {
      inspectElement(probe, element, issues);
    }
  }

  return dedupeIssues(issues);
}

export function suppressExpectedTransientDomIssues(
  issues: RenderIntegrityIssue[],
  scenes: Array<Pick<RemotionSceneQualityInput, "id" | "fromFrame" | "motionEvents">>,
): RenderIntegrityIssue[] {
  return issues.filter((issue) => {
    if (issue.kind !== "clipping") return true;
    const elementId = issue.elementIds?.[0];
    if (!elementId) return true;

    return !scenes.some((scene) =>
      scene.motionEvents.some((motion) => {
        if (motion.elementId !== elementId) return false;
        if (motion.kind !== "entrance" && motion.kind !== "exit") return false;
        const start = scene.fromFrame + motion.startFrame;
        const end = scene.fromFrame + motion.endFrame;
        return start <= issue.frame && issue.frame < end;
      }),
    );
  });
}

function inspectElement(
  probe: DomProbeFrameArtifact,
  element: DomProbeElementSnapshot,
  issues: RenderIntegrityIssue[],
): void {
  const { box } = element;
  const values = [box.x, box.y, box.width, box.height];
  if (values.some((value) => !Number.isFinite(value)) || box.width < 0 || box.height < 0) {
    issues.push({
      kind: "invalid-layout",
      frame: probe.frame,
      elementIds: [element.id],
      message: "element has an invalid bounding box",
    });
    return;
  }

  if (element.requiredVisible && !element.visible) {
    issues.push({
      kind: "invalid-layout",
      frame: probe.frame,
      elementIds: [element.id],
      message: "element is marked required-visible but is not visible",
    });
  }

  if (!element.allowClipping && element.visible && outsideFrame(element, probe.width, probe.height)) {
    issues.push({
      kind: "clipping",
      frame: probe.frame,
      elementIds: [element.id],
      message: "tracked element extends outside the composition bounds",
    });
  }

  if (element.typography && element.visible) {
    if (!element.typography.fontReady) {
      issues.push({
        kind: "font-load",
        frame: probe.frame,
        elementIds: [element.id],
        message: `font is not ready: ${element.typography.fontFamily}`,
      });
    }

    if (!element.allowTextOverflow) {
      const horizontalOverflow = element.scrollWidth > element.clientWidth + EPS;
      const verticalOverflow = element.scrollHeight > element.clientHeight + EPS;
      if (horizontalOverflow || verticalOverflow) {
        const clips =
          isClippingOverflow(element.overflowX) ||
          isClippingOverflow(element.overflowY);
        issues.push({
          kind: clips ? "clipping" : "overflow",
          frame: probe.frame,
          elementIds: [element.id],
          message: `text content exceeds its layout box (${element.scrollWidth}x${element.scrollHeight} > ${element.clientWidth}x${element.clientHeight})`,
        });
      }
    }
  }
}

function outsideFrame(element: DomProbeElementSnapshot, width: number, height: number): boolean {
  const { box } = element;
  return (
    box.x < -EPS ||
    box.y < -EPS ||
    box.x + box.width > width + EPS ||
    box.y + box.height > height + EPS
  );
}

function isClippingOverflow(value: string): boolean {
  return value === "hidden" || value === "clip";
}

function dedupeIssues(issues: RenderIntegrityIssue[]): RenderIntegrityIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = [
      issue.kind,
      issue.frame,
      [...(issue.elementIds ?? [])].sort().join(","),
      issue.message ?? "",
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
