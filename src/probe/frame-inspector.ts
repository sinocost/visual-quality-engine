import sharp from "sharp";
import type {
  RemotionCompositionInput,
  RenderIntegrityIssue,
} from "../adapters/remotion-quality-types.js";
import type { ExpectedChangeWindow } from "./sample-planner.js";

export interface CapturedRenderFrame {
  frame: number;
  buffer: Uint8Array;
  hasVisibleTrackedContent?: boolean;
}

export interface RenderFrameInspectorOptions {
  flickerThreshold?: number;
  expectedChangeWindows?: ExpectedChangeWindow[];
  analysisWidth?: number;
  analysisHeight?: number;
}

interface DecodedFrame {
  frame: number;
  pixels: Uint8Array;
  channels: number;
}

export async function inspectRenderedFrames(
  frames: CapturedRenderFrame[],
  composition: RemotionCompositionInput,
  options: RenderFrameInspectorOptions = {},
): Promise<RenderIntegrityIssue[]> {
  const issues: RenderIntegrityIssue[] = [];
  const decoded: DecodedFrame[] = [];
  const analysisWidth = options.analysisWidth ?? 64;
  const analysisHeight = options.analysisHeight ?? 36;

  for (const frame of [...frames].sort((a, b) => a.frame - b.frame)) {
    try {
      const instance = sharp(frame.buffer, { failOn: "error" });
      const metadata = await instance.metadata();
      if (metadata.width !== composition.width || metadata.height !== composition.height) {
        issues.push({
          kind: "invalid-layout",
          frame: frame.frame,
          message: `rendered frame is ${metadata.width ?? "?"}x${metadata.height ?? "?"}; expected ${composition.width}x${composition.height}`,
        });
      }

      const { data, info } = await sharp(frame.buffer, { failOn: "error" })
        .resize(analysisWidth, analysisHeight, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const alphaMean = meanChannel(data, info.channels, info.channels - 1);
      if (frame.hasVisibleTrackedContent && alphaMean <= 0.5) {
        issues.push({
          kind: "missing-resource",
          frame: frame.frame,
          message: "rendered frame is fully transparent while tracked visible content exists",
        });
      }

      decoded.push({ frame: frame.frame, pixels: data, channels: info.channels });
    } catch (error) {
      issues.push({
        kind: "missing-resource",
        frame: frame.frame,
        message: `renderer returned an unreadable image buffer: ${errorMessage(error)}`,
      });
    }
  }

  const threshold = options.flickerThreshold ?? 0.58;
  const expected = options.expectedChangeWindows ?? [];
  for (let i = 1; i < decoded.length; i++) {
    const previous = decoded[i - 1];
    const current = decoded[i];
    if (current.frame !== previous.frame + 1) continue;
    if (isExpectedChange(previous.frame, current.frame, expected)) continue;
    const diff = normalizedRgbDifference(previous, current);
    if (diff >= threshold) {
      issues.push({
        kind: "flicker",
        frame: current.frame,
        message: `unexpected consecutive-frame pixel change ${(diff * 100).toFixed(1)}% without a declared motion/key-event window`,
      });
    }
  }

  return issues;
}

function meanChannel(data: Uint8Array, channels: number, channel: number): number {
  let total = 0;
  let count = 0;
  for (let i = channel; i < data.length; i += channels) {
    total += data[i];
    count++;
  }
  return count ? total / count : 0;
}

function normalizedRgbDifference(a: DecodedFrame, b: DecodedFrame): number {
  if (a.pixels.length !== b.pixels.length || a.channels !== b.channels) return 1;
  const channels = Math.min(3, a.channels);
  let total = 0;
  let count = 0;
  for (let pixel = 0; pixel < a.pixels.length; pixel += a.channels) {
    for (let channel = 0; channel < channels; channel++) {
      total += Math.abs(a.pixels[pixel + channel] - b.pixels[pixel + channel]);
      count++;
    }
  }
  return count ? total / count / 255 : 0;
}

function isExpectedChange(
  previousFrame: number,
  currentFrame: number,
  windows: ExpectedChangeWindow[],
): boolean {
  return windows.some(
    (window) => window.startFrame <= currentFrame && previousFrame < window.endFrame,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
