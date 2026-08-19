import type {
  AlignmentGroup,
  RemotionCompositionInput,
  RemotionKeyEvent,
  RemotionMotionEvent,
  RemotionProjectQualityInput,
  RemotionQualityElement,
  RenderIntegrityIssue,
  TranscriptCue,
} from "../adapters/remotion-quality-types.js";
import type { DomProbeElementSnapshot, DomProbeFrameArtifact } from "./dom-probe-types.js";

export interface RemotionAutoSceneInput {
  id: string;
  fromFrame: number;
  durationInFrames: number;
  primaryClaims: string[];
  motionEvents: RemotionMotionEvent[];
  keyEvents: RemotionKeyEvent[];
}

export interface MaterializeAutoQualityInput {
  profile?: string;
  composition: RemotionCompositionInput;
  scenes: RemotionAutoSceneInput[];
  transcript?: TranscriptCue[];
  probeFrames: DomProbeFrameArtifact[];
  renderDiagnostics: RenderIntegrityIssue[];
}

export function materializeRemotionQualityProject(
  input: MaterializeAutoQualityInput,
): RemotionProjectQualityInput {
  const sortedProbeFrames = [...input.probeFrames].sort((a, b) => a.frame - b.frame);

  return {
    profile: input.profile,
    composition: input.composition,
    scenes: input.scenes.map((scene) => {
      const sceneFrames = sortedProbeFrames.filter(
        (probe) => scene.fromFrame <= probe.frame && probe.frame < scene.fromFrame + scene.durationInFrames,
      );
      return {
        ...scene,
        elements: materializeElements(scene, sceneFrames),
        alignmentGroups: materializeAlignmentGroups(scene, sceneFrames),
      };
    }),
    transcript: input.transcript,
    renderDiagnostics: { issues: input.renderDiagnostics },
  };
}

function materializeElements(
  scene: RemotionAutoSceneInput,
  frames: DomProbeFrameArtifact[],
): RemotionQualityElement[] {
  const ids = new Set<string>();
  for (const frame of frames) {
    for (const element of elementsForScene(frame, scene.id)) ids.add(element.id);
  }

  return [...ids]
    .sort()
    .map((id) => materializeElement(scene, frames, id))
    .filter((element): element is RemotionQualityElement => element !== null);
}

function materializeElement(
  scene: RemotionAutoSceneInput,
  frames: DomProbeFrameArtifact[],
  id: string,
): RemotionQualityElement | null {
  const samples = frames
    .map((frame) => ({
      frame,
      element: elementsForScene(frame, scene.id).find((item) => item.id === id),
    }))
    .filter((item): item is { frame: DomProbeFrameArtifact; element: DomProbeElementSnapshot } => Boolean(item.element));

  if (!samples.length) return null;
  const first = samples[0].element;
  const layoutSamples = samples.map(({ frame, element }) => ({
    frame: frame.frame - scene.fromFrame,
    box: element.box,
  }));

  const typography = materializeTypography(scene, frames, id);
  const overlap = new Set<string>();
  for (const { element } of samples) {
    for (const target of element.allowOverlapWith ?? []) overlap.add(target);
  }

  return {
    id,
    role: first.role,
    parentId: first.parentId,
    layoutSamples,
    typography,
    allowOverlapWith: overlap.size ? [...overlap].sort() : undefined,
  };
}

function materializeTypography(
  scene: RemotionAutoSceneInput,
  frames: DomProbeFrameArtifact[],
  id: string,
): RemotionQualityElement["typography"] {
  if (!frames.length) return undefined;
  const visibility = frames.map((frame) => {
    const element = elementsForScene(frame, scene.id).find((item) => item.id === id);
    return {
      absoluteFrame: frame.frame,
      element,
      readable: Boolean(element?.visible && element.typography?.text),
    };
  });

  const runs = contiguousReadableRuns(visibility);
  if (!runs.length) return undefined;
  const run = runs.reduce((best, candidate) =>
    candidate.length > best.length ? candidate : best,
  );
  const readableItems = run
    .map((index) => visibility[index])
    .filter((item): item is typeof item & { element: DomProbeElementSnapshot } => Boolean(item.element));
  const typographySamples = readableItems
    .map((item) => item.element.typography)
    .filter((item): item is NonNullable<DomProbeElementSnapshot["typography"]> => Boolean(item));
  if (!typographySamples.length) return undefined;

  const firstIndex = run[0];
  const lastIndex = run[run.length - 1];
  const previousFrame = firstIndex > 0 ? visibility[firstIndex - 1].absoluteFrame : scene.fromFrame - 1;
  const nextFrame =
    lastIndex < visibility.length - 1
      ? visibility[lastIndex + 1].absoluteFrame
      : scene.fromFrame + scene.durationInFrames;

  const readableFromFrame = Math.max(0, previousFrame + 1 - scene.fromFrame);
  const readableToFrame = Math.min(scene.durationInFrames, nextFrame - scene.fromFrame);
  const minFont = typographySamples.reduce((best, sample) =>
    sample.fontSizePx < best.fontSizePx ? sample : best,
  );
  const longestText = typographySamples.reduce((best, sample) =>
    sample.text.length > best.text.length ? sample : best,
  );

  return {
    fontFamily: mostCommon(typographySamples.map((sample) => sample.fontFamily)),
    fontSizePx: minFont.fontSizePx,
    text: longestText.text,
    readableFromFrame,
    readableToFrame: Math.max(readableFromFrame + 1, readableToFrame),
  };
}

function contiguousReadableRuns(
  items: Array<{ readable: boolean }>,
): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].readable) {
      current.push(i);
    } else if (current.length) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);
  return runs;
}

function materializeAlignmentGroups(
  scene: RemotionAutoSceneInput,
  frames: DomProbeFrameArtifact[],
): AlignmentGroup[] | undefined {
  const groups = new Map<string, AlignmentGroup>();
  for (const frame of frames) {
    for (const element of elementsForScene(frame, scene.id)) {
      const alignment = element.alignment;
      if (!alignment) continue;
      const existing = groups.get(alignment.groupId);
      if (!existing) {
        groups.set(alignment.groupId, {
          id: alignment.groupId,
          elementIds: [element.id],
          axis: alignment.axis,
          anchor: alignment.anchor,
        });
        continue;
      }
      if (!existing.elementIds.includes(element.id)) existing.elementIds.push(element.id);
    }
  }

  const result = [...groups.values()]
    .map((group) => ({ ...group, elementIds: [...group.elementIds].sort() }))
    .filter((group) => group.elementIds.length >= 2)
    .sort((a, b) => a.id.localeCompare(b.id));
  return result.length ? result : undefined;
}

function elementsForScene(frame: DomProbeFrameArtifact, sceneId: string): DomProbeElementSnapshot[] {
  return frame.elements.filter((element) => !element.sceneId || element.sceneId === sceneId);
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}
