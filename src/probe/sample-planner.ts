import type { RemotionCompositionInput } from "../adapters/remotion-quality-types.js";
import type { RemotionAutoSceneInput } from "./probe-materializer.js";

export interface QualitySamplePlanOptions {
  intervalFrames?: number;
  neighborRadius?: number;
  extraFrames?: number[];
  maxUniformSamples?: number;
}

export function planQualitySampleFrames(
  composition: RemotionCompositionInput,
  scenes: RemotionAutoSceneInput[],
  options: QualitySamplePlanOptions = {},
): number[] {
  const duration = composition.durationInFrames;
  if (duration <= 0) return [];

  const interval = Math.max(1, options.intervalFrames ?? Math.round(composition.fps / 2));
  const radius = Math.max(0, options.neighborRadius ?? 1);
  const mandatory = new Set<number>([0, duration - 1]);
  const add = (frame: number) => {
    if (Number.isInteger(frame) && frame >= 0 && frame < duration) mandatory.add(frame);
  };
  const addWithNeighbors = (frame: number) => {
    for (let delta = -radius; delta <= radius; delta++) add(frame + delta);
  };

  for (const scene of scenes) {
    const start = scene.fromFrame;
    const endExclusive = scene.fromFrame + scene.durationInFrames;
    addWithNeighbors(start);
    addWithNeighbors(endExclusive - 1);

    for (const motion of scene.motionEvents) {
      addWithNeighbors(start + motion.startFrame);
      addWithNeighbors(start + motion.endFrame - 1);
    }
    for (const event of scene.keyEvents) addWithNeighbors(start + event.frame);
  }
  for (const frame of options.extraFrames ?? []) addWithNeighbors(frame);

  const uniform: number[] = [];
  for (let frame = 0; frame < duration; frame += interval) uniform.push(frame);
  const maxUniform = options.maxUniformSamples ?? 180;
  const stride = uniform.length > maxUniform ? Math.ceil(uniform.length / maxUniform) : 1;
  for (let i = 0; i < uniform.length; i += stride) add(uniform[i]);

  return [...mandatory].sort((a, b) => a - b);
}

export interface ExpectedChangeWindow {
  startFrame: number;
  endFrame: number;
}

export function buildExpectedChangeWindows(scenes: RemotionAutoSceneInput[]): ExpectedChangeWindow[] {
  const windows: ExpectedChangeWindow[] = [];
  for (const scene of scenes) {
    for (const motion of scene.motionEvents) {
      windows.push({
        startFrame: scene.fromFrame + motion.startFrame,
        endFrame: scene.fromFrame + motion.endFrame,
      });
    }
    for (const event of scene.keyEvents) {
      const frame = scene.fromFrame + event.frame;
      windows.push({ startFrame: Math.max(0, frame - 1), endFrame: frame + 2 });
    }
    windows.push({
      startFrame: Math.max(0, scene.fromFrame - 1),
      endFrame: scene.fromFrame + 2,
    });
  }
  return mergeWindows(windows);
}

function mergeWindows(windows: ExpectedChangeWindow[]): ExpectedChangeWindow[] {
  const sorted = [...windows].sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame);
  const merged: ExpectedChangeWindow[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (!last || current.startFrame > last.endFrame) {
      merged.push({ ...current });
    } else {
      last.endFrame = Math.max(last.endFrame, current.endFrame);
    }
  }
  return merged;
}
