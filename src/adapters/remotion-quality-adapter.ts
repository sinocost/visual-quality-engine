import type { MetricEvidence, QualitySnapshot } from "../types.js";
import type { RemotionQualityAdapter } from "./remotion-adapter.contract.js";
import type {
  AlignmentGroup,
  BoundingBox,
  LayoutSample,
  RemotionMotionEvent,
  RemotionProjectQualityInput,
  RemotionQualityElement,
  RemotionSceneQualityInput,
  TranscriptCue,
} from "./remotion-quality-types.js";

const DEFAULT_PROFILE = "technical_explainer";

interface Worst<T = unknown> {
  value: number;
  evidence: MetricEvidence;
  detail?: T;
}

interface AbsoluteMotionEvent extends RemotionMotionEvent {
  sceneId: string;
  absoluteStartFrame: number;
  absoluteEndFrame: number;
}

interface AbsoluteKeyEvent {
  id: string;
  sceneId: string;
  frame: number;
  sceneEndFrame: number;
  kind: "key" | "resolution";
  transcriptCueId?: string;
}

interface AbsoluteLayoutSample {
  sceneId: string;
  element: RemotionQualityElement;
  frame: number;
  box: BoundingBox;
}

export class RemotionProjectQualityAdapter
  implements RemotionQualityAdapter<RemotionProjectQualityInput>
{
  async collect(project: RemotionProjectQualityInput): Promise<QualitySnapshot> {
    validateProject(project);

    const { composition } = project;
    const evidence: Record<string, MetricEvidence> = {};
    const frameDiagonal = Math.hypot(composition.width, composition.height);
    const normalized1080Scale = 1080 / composition.height;

    const allLayoutSamples = flattenLayoutSamples(project.scenes);
    const safeMargin = measureSafeMargin(
      allLayoutSamples.filter(sample => sample.element.role !== "decorative"),
      composition.width,
      composition.height,
    );
    evidence.C03 = safeMargin.evidence;

    const alignment = measureAlignmentError(project.scenes, normalized1080Scale);
    evidence.C04 = alignment.evidence;

    const overlap = measureUnexpectedOverlap(allLayoutSamples);
    evidence.C06 = overlap.evidence;

    const typographyElements = project.scenes.flatMap(scene =>
      scene.elements
        .filter(element => element.typography)
        .map(element => ({ scene, element })),
    );

    const fontFamilies = new Set(
      typographyElements.map(({ element }) => normalizeFontFamily(element.typography!.fontFamily)),
    ).size;

    const minFont = measureMinFontSize(typographyElements, normalized1080Scale);
    evidence.T03 = minFont.evidence;

    const readingLoad = measureReadingLoad(typographyElements, composition.fps);
    evidence.T06 = readingLoad.evidence;

    const motions = flattenMotionEvents(project.scenes);
    const concurrency = measurePrimaryMotionConcurrency(motions);
    evidence.M01 = concurrency.evidence;

    const linearRatio = measureLinearEntranceExitRatio(motions);
    evidence.M03 = linearRatio.evidence;

    const keyEvents = flattenKeyEvents(project.scenes);
    const keySpacing = measureKeyEventSpacing(keyEvents, composition.fps, composition.durationInFrames);
    evidence.R03 = keySpacing.evidence;

    const resolutionHold = measureResolutionHold(keyEvents, composition.fps, composition.durationInFrames);
    evidence.R04 = resolutionHold.evidence;

    const voiceSync = measureVoiceSync(keyEvents, project.transcript ?? [], composition.fps);
    evidence.R05 = voiceSync.evidence;

    const teleport = measureTeleportRatio(motions, frameDiagonal);
    evidence.CN02 = teleport.evidence;

    const claims = measurePrimaryClaims(project.scenes);
    evidence.S01 = claims.evidence;

    const semanticMotion = measureSemanticMotionRatio(motions);
    evidence.S02 = semanticMotion.evidence;

    const firstIssue = project.renderDiagnostics.issues[0];
    if (firstIssue) {
      evidence.Q02 = {
        frameStart: firstIssue.frame,
        frameEnd: firstIssue.frame,
        elementIds: firstIssue.elementIds,
      };
    }

    return {
      profile: project.profile ?? DEFAULT_PROFILE,
      fps: composition.fps,
      frameWidth: composition.width,
      frameHeight: composition.height,
      metrics: {
        safeMarginRatio: safeMargin.value,
        alignmentErrorPx1080: alignment.value,
        unexpectedOverlapRatio: overlap.value,
        fontFamilies,
        minFontSizePx1080: minFont.value,
        maxCjkCharsPerSecond: readingLoad.value,
        maxConcurrentPrimaryMotionGroups: concurrency.value,
        linearEntranceExitRatio: linearRatio.value,
        minKeyEventSpacingSec: keySpacing.value,
        minResolutionHoldSec: resolutionHold.value,
        maxAbsVoiceSyncOffsetSec: voiceSync.value,
        maxTeleportRatio: teleport.value,
        maxPrimaryClaimsPerScene: claims.value,
        semanticLinkedMotionRatio: semanticMotion.value,
        renderIntegrityIssues: project.renderDiagnostics.issues.length,
      },
      evidence,
    };
  }
}

export async function collectRemotionQualitySnapshot(
  project: RemotionProjectQualityInput,
): Promise<QualitySnapshot> {
  return new RemotionProjectQualityAdapter().collect(project);
}

function flattenLayoutSamples(scenes: RemotionSceneQualityInput[]): AbsoluteLayoutSample[] {
  return scenes.flatMap(scene =>
    scene.elements.flatMap(element =>
      element.layoutSamples.map(sample => ({
        sceneId: scene.id,
        element,
        frame: scene.fromFrame + sample.frame,
        box: sample.box,
      })),
    ),
  );
}

function flattenMotionEvents(scenes: RemotionSceneQualityInput[]): AbsoluteMotionEvent[] {
  return scenes.flatMap(scene =>
    scene.motionEvents.map(event => ({
      ...event,
      sceneId: scene.id,
      absoluteStartFrame: scene.fromFrame + event.startFrame,
      absoluteEndFrame: scene.fromFrame + event.endFrame,
    })),
  );
}

function flattenKeyEvents(scenes: RemotionSceneQualityInput[]): AbsoluteKeyEvent[] {
  return scenes.flatMap(scene =>
    scene.keyEvents.map(event => ({
      ...event,
      sceneId: scene.id,
      frame: scene.fromFrame + event.frame,
      sceneEndFrame: scene.fromFrame + scene.durationInFrames,
    })),
  );
}

function measureSafeMargin(
  samples: AbsoluteLayoutSample[],
  width: number,
  height: number,
): Worst {
  if (!samples.length) return { value: 1, evidence: {} };
  const denominator = Math.min(width, height);
  let worst: Worst = { value: Number.POSITIVE_INFINITY, evidence: {} };

  for (const sample of samples) {
    const { box } = sample;
    const edgeDistance = Math.min(box.x, box.y, width - (box.x + box.width), height - (box.y + box.height));
    const ratio = edgeDistance / denominator;
    if (ratio < worst.value) {
      worst = {
        value: ratio,
        evidence: {
          sceneId: sample.sceneId,
          frameStart: sample.frame,
          frameEnd: sample.frame,
          elementIds: [sample.element.id],
        },
      };
    }
  }

  return worst;
}

function measureAlignmentError(
  scenes: RemotionSceneQualityInput[],
  normalized1080Scale: number,
): Worst {
  let worst: Worst = { value: 0, evidence: {} };

  for (const scene of scenes) {
    const byId = new Map(scene.elements.map(element => [element.id, element]));
    for (const group of scene.alignmentGroups ?? []) {
      const elements = group.elementIds.map(id => byId.get(id)).filter(isDefined);
      if (elements.length < 2) continue;

      const frames = group.frames ?? sharedFrames(elements);
      for (const frame of frames) {
        const anchors = elements
          .map(element => {
            const sample = element.layoutSamples.find(item => item.frame === frame);
            return sample ? { element, value: alignmentAnchor(sample, group) } : null;
          })
          .filter(isDefined);
        if (anchors.length < 2) continue;

        const values = anchors.map(item => item.value);
        const error = (Math.max(...values) - Math.min(...values)) * normalized1080Scale;
        if (error > worst.value) {
          worst = {
            value: error,
            evidence: {
              sceneId: scene.id,
              frameStart: scene.fromFrame + frame,
              frameEnd: scene.fromFrame + frame,
              elementIds: anchors.map(item => item.element.id),
            },
          };
        }
      }
    }
  }

  return worst;
}

function sharedFrames(elements: RemotionQualityElement[]): number[] {
  if (!elements.length) return [];
  let shared = new Set(elements[0].layoutSamples.map(sample => sample.frame));
  for (const element of elements.slice(1)) {
    const frames = new Set(element.layoutSamples.map(sample => sample.frame));
    shared = new Set([...shared].filter(frame => frames.has(frame)));
  }
  return [...shared].sort((a, b) => a - b);
}

function alignmentAnchor(sample: LayoutSample, group: AlignmentGroup): number {
  const { box } = sample;
  const start = group.axis === "x" ? box.x : box.y;
  const size = group.axis === "x" ? box.width : box.height;
  if (group.anchor === "start") return start;
  if (group.anchor === "center") return start + size / 2;
  return start + size;
}

function measureUnexpectedOverlap(samples: AbsoluteLayoutSample[]): Worst {
  let worst: Worst = { value: 0, evidence: {} };
  const bySceneFrame = new Map<string, AbsoluteLayoutSample[]>();

  for (const sample of samples) {
    const key = `${sample.sceneId}:${sample.frame}`;
    const current = bySceneFrame.get(key) ?? [];
    current.push(sample);
    bySceneFrame.set(key, current);
  }

  for (const frameSamples of bySceneFrame.values()) {
    for (let i = 0; i < frameSamples.length; i++) {
      for (let j = i + 1; j < frameSamples.length; j++) {
        const a = frameSamples[i];
        const b = frameSamples[j];
        if (shouldIgnoreOverlap(a.element, b.element)) continue;
        const ratio = overlapRatio(a.box, b.box);
        if (ratio > worst.value) {
          worst = {
            value: ratio,
            evidence: {
              sceneId: a.sceneId,
              frameStart: a.frame,
              frameEnd: a.frame,
              elementIds: [a.element.id, b.element.id],
            },
          };
        }
      }
    }
  }

  return worst;
}

function shouldIgnoreOverlap(a: RemotionQualityElement, b: RemotionQualityElement): boolean {
  if (a.parentId === b.id || b.parentId === a.id) return true;
  if (a.role === "container" || b.role === "container") return true;
  if (a.role === "decorative" && b.role === "decorative") return true;
  return Boolean(a.allowOverlapWith?.includes(b.id) || b.allowOverlapWith?.includes(a.id));
}

function overlapRatio(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const intersection = (x2 - x1) * (y2 - y1);
  const denominator = Math.min(a.width * a.height, b.width * b.height);
  return denominator > 0 ? intersection / denominator : 0;
}

function measureMinFontSize(
  typographyElements: Array<{ scene: RemotionSceneQualityInput; element: RemotionQualityElement }>,
  scale: number,
): Worst {
  if (!typographyElements.length) return { value: 999, evidence: {} };
  let worst: Worst = { value: Number.POSITIVE_INFINITY, evidence: {} };
  for (const { scene, element } of typographyElements) {
    const value = element.typography!.fontSizePx * scale;
    if (value < worst.value) {
      worst = {
        value,
        evidence: { sceneId: scene.id, elementIds: [element.id] },
      };
    }
  }
  return worst;
}

function measureReadingLoad(
  typographyElements: Array<{ scene: RemotionSceneQualityInput; element: RemotionQualityElement }>,
  fps: number,
): Worst {
  let worst: Worst = { value: 0, evidence: {} };
  for (const { scene, element } of typographyElements) {
    const typography = element.typography!;
    const cjkChars = countCjkCharacters(typography.text);
    if (!cjkChars) continue;
    const durationFrames = typography.readableToFrame - typography.readableFromFrame;
    const durationSec = durationFrames / fps;
    const rate = durationSec > 0 ? cjkChars / durationSec : Number.POSITIVE_INFINITY;
    if (rate > worst.value) {
      worst = {
        value: rate,
        evidence: {
          sceneId: scene.id,
          frameStart: scene.fromFrame + typography.readableFromFrame,
          frameEnd: scene.fromFrame + typography.readableToFrame - 1,
          elementIds: [element.id],
        },
      };
    }
  }
  return worst;
}

function countCjkCharacters(text: string): number {
  return [...text].filter(char => /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(char)).length;
}

function measurePrimaryMotionConcurrency(motions: AbsoluteMotionEvent[]): Worst {
  const boundaries = new Set<number>();
  for (const motion of motions) {
    if (motion.priority !== "primary") continue;
    boundaries.add(motion.absoluteStartFrame);
    boundaries.add(motion.absoluteEndFrame);
  }

  let worst: Worst = { value: 0, evidence: {} };
  for (const frame of [...boundaries].sort((a, b) => a - b)) {
    const active = motions.filter(
      motion =>
        motion.priority === "primary" &&
        motion.absoluteStartFrame <= frame &&
        frame < motion.absoluteEndFrame,
    );
    const groups = new Map<string, AbsoluteMotionEvent>();
    for (const motion of active) groups.set(motion.groupId ?? motion.elementId, motion);
    if (groups.size > worst.value) {
      const events = [...groups.values()];
      worst = {
        value: groups.size,
        evidence: {
          sceneId: sameScene(events) ? events[0]?.sceneId : undefined,
          frameStart: frame,
          frameEnd: frame,
          elementIds: events.map(event => event.elementId),
        },
      };
    }
  }
  return worst;
}

function sameScene(events: AbsoluteMotionEvent[]): boolean {
  return events.length > 0 && events.every(event => event.sceneId === events[0].sceneId);
}

function measureLinearEntranceExitRatio(motions: AbsoluteMotionEvent[]): Worst {
  const transitions = motions.filter(motion => motion.kind === "entrance" || motion.kind === "exit");
  if (!transitions.length) return { value: 0, evidence: {} };
  const linear = transitions.filter(motion => motion.easing === "linear");
  const first = linear[0];
  return {
    value: linear.length / transitions.length,
    evidence: first
      ? {
          sceneId: first.sceneId,
          frameStart: first.absoluteStartFrame,
          frameEnd: first.absoluteEndFrame - 1,
          elementIds: [first.elementId],
        }
      : {},
  };
}

function measureKeyEventSpacing(
  events: AbsoluteKeyEvent[],
  fps: number,
  durationInFrames: number,
): Worst {
  const sorted = [...events].sort((a, b) => a.frame - b.frame);
  if (sorted.length < 2) return { value: durationInFrames / fps, evidence: {} };
  let worst: Worst = { value: Number.POSITIVE_INFINITY, evidence: {} };
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    const gap = (current.frame - previous.frame) / fps;
    if (gap < worst.value) {
      worst = {
        value: gap,
        evidence: {
          sceneId: previous.sceneId === current.sceneId ? previous.sceneId : undefined,
          frameStart: previous.frame,
          frameEnd: current.frame,
        },
      };
    }
  }
  return worst;
}

function measureResolutionHold(
  events: AbsoluteKeyEvent[],
  fps: number,
  durationInFrames: number,
): Worst {
  const sorted = [...events].sort((a, b) => a.frame - b.frame);
  const resolutions = sorted.filter(event => event.kind === "resolution");
  if (!resolutions.length) return { value: durationInFrames / fps, evidence: {} };

  let worst: Worst = { value: Number.POSITIVE_INFINITY, evidence: {} };
  for (const resolution of resolutions) {
    const next = sorted.find(event => event.frame > resolution.frame);
    const boundary = Math.min(next?.frame ?? resolution.sceneEndFrame, resolution.sceneEndFrame);
    const hold = Math.max(0, boundary - resolution.frame) / fps;
    if (hold < worst.value) {
      worst = {
        value: hold,
        evidence: {
          sceneId: resolution.sceneId,
          frameStart: resolution.frame,
          frameEnd: boundary,
        },
      };
    }
  }
  return worst;
}

function measureVoiceSync(
  events: AbsoluteKeyEvent[],
  transcript: TranscriptCue[],
  fps: number,
): Worst {
  const cues = new Map(transcript.map(cue => [cue.id, cue]));
  let worst: Worst = { value: 0, evidence: {} };
  for (const event of events) {
    if (!event.transcriptCueId) continue;
    const cue = cues.get(event.transcriptCueId);
    if (!cue) continue;
    const anchor = cue.syncFrame ?? cue.startFrame;
    const offset = Math.abs(event.frame - anchor) / fps;
    if (offset > worst.value) {
      worst = {
        value: offset,
        evidence: {
          sceneId: event.sceneId,
          frameStart: Math.min(event.frame, anchor),
          frameEnd: Math.max(event.frame, anchor),
        },
      };
    }
  }
  return worst;
}

function measureTeleportRatio(motions: AbsoluteMotionEvent[], frameDiagonal: number): Worst {
  let worst: Worst = { value: 0, evidence: {} };
  for (const motion of motions) {
    if (motion.kind !== "move" || !motion.fromPosition || !motion.toPosition) continue;
    const isTeleport = motion.animated === false || motion.absoluteEndFrame <= motion.absoluteStartFrame;
    if (!isTeleport) continue;
    const distance = Math.hypot(
      motion.toPosition.x - motion.fromPosition.x,
      motion.toPosition.y - motion.fromPosition.y,
    );
    const ratio = frameDiagonal > 0 ? distance / frameDiagonal : 0;
    if (ratio > worst.value) {
      worst = {
        value: ratio,
        evidence: {
          sceneId: motion.sceneId,
          frameStart: motion.absoluteStartFrame,
          frameEnd: motion.absoluteEndFrame,
          elementIds: [motion.elementId],
        },
      };
    }
  }
  return worst;
}

function measurePrimaryClaims(scenes: RemotionSceneQualityInput[]): Worst {
  let worst: Worst = { value: 0, evidence: {} };
  for (const scene of scenes) {
    if (scene.primaryClaims.length > worst.value) {
      worst = {
        value: scene.primaryClaims.length,
        evidence: {
          sceneId: scene.id,
          frameStart: scene.fromFrame,
          frameEnd: scene.fromFrame + scene.durationInFrames - 1,
        },
      };
    }
  }
  return worst;
}

function measureSemanticMotionRatio(motions: AbsoluteMotionEvent[]): Worst {
  if (!motions.length) return { value: 1, evidence: {} };
  const linked = motions.filter(motion => motion.reason && motion.reason.type !== "decoration");
  const unlinked = motions.find(motion => !motion.reason || motion.reason.type === "decoration");
  return {
    value: linked.length / motions.length,
    evidence: unlinked
      ? {
          sceneId: unlinked.sceneId,
          frameStart: unlinked.absoluteStartFrame,
          frameEnd: unlinked.absoluteEndFrame - 1,
          elementIds: [unlinked.elementId],
        }
      : {},
  };
}

function normalizeFontFamily(value: string): string {
  return value.trim().toLowerCase().replace(/["']/g, "");
}

function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

function validateProject(project: RemotionProjectQualityInput): void {
  const { composition } = project;
  assertPositive(composition.fps, "composition.fps");
  assertPositive(composition.width, "composition.width");
  assertPositive(composition.height, "composition.height");
  assertPositive(composition.durationInFrames, "composition.durationInFrames");

  const sceneIds = new Set<string>();
  for (const scene of project.scenes) {
    if (sceneIds.has(scene.id)) throw new Error(`Duplicate scene id: ${scene.id}`);
    sceneIds.add(scene.id);
    assertIntegerAtLeast(scene.fromFrame, 0, `scene ${scene.id}.fromFrame`);
    assertIntegerAtLeast(scene.durationInFrames, 1, `scene ${scene.id}.durationInFrames`);
    if (scene.fromFrame + scene.durationInFrames > composition.durationInFrames) {
      throw new Error(`Scene ${scene.id} exceeds composition duration`);
    }

    const elementIds = new Set<string>();
    for (const element of scene.elements) {
      if (elementIds.has(element.id)) throw new Error(`Duplicate element id in ${scene.id}: ${element.id}`);
      elementIds.add(element.id);
      for (const sample of element.layoutSamples) {
        assertFrameInScene(sample.frame, scene, `${element.id}.layoutSamples.frame`);
        validateBox(sample.box, `${scene.id}/${element.id}`);
      }
      if (element.typography) {
        assertFrameInScene(element.typography.readableFromFrame, scene, `${element.id}.readableFromFrame`, true);
        assertFrameInScene(element.typography.readableToFrame, scene, `${element.id}.readableToFrame`, true);
        if (element.typography.readableToFrame <= element.typography.readableFromFrame) {
          throw new Error(`${scene.id}/${element.id} readable range must be positive`);
        }
        assertPositive(element.typography.fontSizePx, `${scene.id}/${element.id}.fontSizePx`);
      }
    }

    for (const group of scene.alignmentGroups ?? []) {
      for (const id of group.elementIds) {
        if (!elementIds.has(id)) throw new Error(`Alignment group ${group.id} references unknown element ${id}`);
      }
      for (const frame of group.frames ?? []) {
        assertFrameInScene(frame, scene, `alignment group ${group.id}.frame`);
      }
    }

    for (const motion of scene.motionEvents) {
      assertFrameInScene(motion.startFrame, scene, `${motion.id}.startFrame`, true);
      assertFrameInScene(motion.endFrame, scene, `${motion.id}.endFrame`, true);
      if (motion.endFrame < motion.startFrame) {
        throw new Error(`${scene.id}/${motion.id} endFrame must be >= startFrame`);
      }
      if (!elementIds.has(motion.elementId)) {
        throw new Error(`Motion ${motion.id} references unknown element ${motion.elementId}`);
      }
    }

    for (const event of scene.keyEvents) {
      assertFrameInScene(event.frame, scene, `${event.id}.frame`);
    }
  }

  const transcriptIds = new Set<string>();
  for (const cue of project.transcript ?? []) {
    if (transcriptIds.has(cue.id)) throw new Error(`Duplicate transcript cue id: ${cue.id}`);
    transcriptIds.add(cue.id);
    assertIntegerAtLeast(cue.startFrame, 0, `transcript ${cue.id}.startFrame`);
    assertIntegerAtLeast(cue.endFrame, cue.startFrame, `transcript ${cue.id}.endFrame`);
    if (cue.endFrame > composition.durationInFrames) {
      throw new Error(`Transcript cue ${cue.id} exceeds composition duration`);
    }
    if (cue.syncFrame !== undefined) {
      assertIntegerAtLeast(cue.syncFrame, 0, `transcript ${cue.id}.syncFrame`);
      if (cue.syncFrame > composition.durationInFrames) {
        throw new Error(`Transcript cue ${cue.id}.syncFrame exceeds composition duration`);
      }
    }
  }

  for (const scene of project.scenes) {
    for (const event of scene.keyEvents) {
      if (event.transcriptCueId && !transcriptIds.has(event.transcriptCueId)) {
        throw new Error(`Key event ${scene.id}/${event.id} references unknown transcript cue ${event.transcriptCueId}`);
      }
    }
  }
}

function assertPositive(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${path} must be a positive finite number`);
}

function assertIntegerAtLeast(value: number, minimum: number, path: string): void {
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${path} must be an integer >= ${minimum}`);
}

function assertFrameInScene(
  frame: number,
  scene: RemotionSceneQualityInput,
  path: string,
  allowEnd = false,
): void {
  const max = allowEnd ? scene.durationInFrames : scene.durationInFrames - 1;
  if (!Number.isInteger(frame) || frame < 0 || frame > max) {
    throw new Error(`${scene.id}/${path} must be within 0..${max}`);
  }
}

function validateBox(box: BoundingBox, path: string): void {
  for (const [key, value] of Object.entries(box)) {
    if (!Number.isFinite(value)) throw new Error(`${path}.box.${key} must be finite`);
  }
  if (box.width <= 0 || box.height <= 0) throw new Error(`${path}.box must have positive width and height`);
}
