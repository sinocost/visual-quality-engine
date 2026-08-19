/**
 * Structured quality telemetry exported by a Remotion composition.
 *
 * Frame values inside scenes are scene-relative, matching the mental model of
 * useCurrentFrame() when components are rendered inside <Sequence>.
 * Transcript frames are composition-absolute because narration commonly spans
 * multiple scenes.
 */

export interface RemotionCompositionInput {
  id: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutSample {
  /** Scene-relative frame. */
  frame: number;
  box: BoundingBox;
}

export type ElementRole = "primary" | "secondary" | "text" | "decorative" | "container";

export interface TypographySample {
  fontFamily: string;
  fontSizePx: number;
  text: string;
  /** Scene-relative inclusive start frame when the text is readable. */
  readableFromFrame: number;
  /** Scene-relative exclusive end frame when the text is readable. */
  readableToFrame: number;
}

export interface RemotionQualityElement {
  id: string;
  role: ElementRole;
  parentId?: string;
  layoutSamples: LayoutSample[];
  typography?: TypographySample;
  /** Explicit overlap exceptions for badges, labels, overlays, etc. */
  allowOverlapWith?: string[];
}

export type AlignmentAxis = "x" | "y";
export type AlignmentAnchor = "start" | "center" | "end";

export interface AlignmentGroup {
  id: string;
  elementIds: string[];
  axis: AlignmentAxis;
  anchor: AlignmentAnchor;
  /** Optional scene-relative frames to check. All shared sample frames are used when omitted. */
  frames?: number[];
}

export type MotionKind = "entrance" | "exit" | "move" | "scale" | "camera" | "state" | "other";
export type MotionPriority = "primary" | "secondary" | "decorative";
export type EasingKind = "linear" | "ease" | "bezier" | "spring" | "step" | "custom";

export interface MotionReason {
  type: string;
  trigger?: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface RemotionMotionEvent {
  id: string;
  elementId: string;
  /** Semantic group. Multiple child elements moving together count once for M01. */
  groupId?: string;
  kind: MotionKind;
  priority: MotionPriority;
  /** Scene-relative inclusive start frame. */
  startFrame: number;
  /** Scene-relative exclusive end frame. */
  endFrame: number;
  easing?: EasingKind;
  reason?: MotionReason;
  fromPosition?: Point;
  toPosition?: Point;
  /** False means a position change occurs without visible interpolation. */
  animated?: boolean;
}

export type KeyEventKind = "key" | "resolution";

export interface RemotionKeyEvent {
  id: string;
  /** Scene-relative frame. */
  frame: number;
  kind: KeyEventKind;
  /** Transcript cue whose semantic anchor should coincide with this visual event. */
  transcriptCueId?: string;
}

export interface RemotionSceneQualityInput {
  id: string;
  /** Composition-absolute start frame, equivalent to <Sequence from={...}>. */
  fromFrame: number;
  durationInFrames: number;
  primaryClaims: string[];
  elements: RemotionQualityElement[];
  alignmentGroups?: AlignmentGroup[];
  motionEvents: RemotionMotionEvent[];
  keyEvents: RemotionKeyEvent[];
}

export interface TranscriptCue {
  id: string;
  text: string;
  /** Composition-absolute cue range. */
  startFrame: number;
  endFrame: number;
  /** Composition-absolute semantic word/phrase anchor; startFrame is used when omitted. */
  syncFrame?: number;
}

export type RenderIntegrityIssueKind =
  | "overflow"
  | "clipping"
  | "missing-resource"
  | "font-load"
  | "flicker"
  | "invalid-layout"
  | "other";

export interface RenderIntegrityIssue {
  kind: RenderIntegrityIssueKind;
  frame: number;
  elementIds?: string[];
  message?: string;
}

export interface RemotionProjectQualityInput {
  profile?: string;
  composition: RemotionCompositionInput;
  scenes: RemotionSceneQualityInput[];
  transcript?: TranscriptCue[];
  renderDiagnostics: {
    issues: RenderIntegrityIssue[];
  };
}

export function defineRemotionQualityProject<T extends RemotionProjectQualityInput>(project: T): T {
  return project;
}
