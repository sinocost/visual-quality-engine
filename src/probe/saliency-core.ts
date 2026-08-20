import type { BoundingBox } from "../adapters/remotion-quality-types.js";

export interface ElementSaliency {
  elementId: string;
  saliencyRatio: number;
}

export interface SaliencyRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  saliencyRatio: number;
}

export interface SaliencyFrameResult {
  frame: number;
  coveredSaliencyRatio: number;
  totalSaliency: number;
  elementSaliency: ElementSaliency[];
  topUncoveredRegions: SaliencyRegion[];
}

export interface AnalyzeRawSaliencyFrameInput {
  frame: number;
  width: number;
  height: number;
  channels: number;
  pixels: Uint8Array;
  compositionWidth: number;
  compositionHeight: number;
  trackedBoxes: Array<{ id: string; box: BoundingBox }>;
}

export function analyzeRawSaliencyFrame(
  input: AnalyzeRawSaliencyFrameInput,
): SaliencyFrameResult {
  const { width, height, channels, pixels } = input;
  if (
    width <= 0 ||
    height <= 0 ||
    channels < 3 ||
    pixels.length < width * height * channels
  ) {
    return {
      frame: input.frame,
      coveredSaliencyRatio: 1,
      totalSaliency: 0,
      elementSaliency: [],
      topUncoveredRegions: [],
    };
  }

  const saliency = new Float64Array(width * height);
  let total = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = pixels[idx] ?? 0;
      const g = pixels[idx + 1] ?? 0;
      const b = pixels[idx + 2] ?? 0;
      const lum = luminance(r, g, b);
      const right =
        x + 1 < width
          ? luminance(
              pixels[idx + channels] ?? r,
              pixels[idx + channels + 1] ?? g,
              pixels[idx + channels + 2] ?? b,
            )
          : lum;
      const downIdx = idx + width * channels;
      const down =
        y + 1 < height
          ? luminance(
              pixels[downIdx] ?? r,
              pixels[downIdx + 1] ?? g,
              pixels[downIdx + 2] ?? b,
            )
          : lum;
      const gradient = Math.min(
        1,
        (Math.abs(lum - right) + Math.abs(lum - down)) / 255,
      );
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = (max - min) / 255;
      const nx = (x + 0.5) / width - 0.5;
      const ny = (y + 0.5) / height - 0.5;
      const center = Math.max(0, 1 - Math.hypot(nx, ny) / Math.SQRT1_2);
      const value = gradient * 0.58 + saturation * 0.27 + center * 0.15;
      saliency[y * width + x] = value;
      total += value;
    }
  }

  if (total <= 1e-9) {
    return {
      frame: input.frame,
      coveredSaliencyRatio: 1,
      totalSaliency: 0,
      elementSaliency: input.trackedBoxes.map((box) => ({
        elementId: box.id,
        saliencyRatio: 0,
      })),
      topUncoveredRegions: [],
    };
  }

  const boxes = input.trackedBoxes.map((tracked) => ({
    elementId: tracked.id,
    x1: clampInt(
      Math.floor((tracked.box.x / input.compositionWidth) * width),
      0,
      width,
    ),
    y1: clampInt(
      Math.floor((tracked.box.y / input.compositionHeight) * height),
      0,
      height,
    ),
    x2: clampInt(
      Math.ceil(
        ((tracked.box.x + tracked.box.width) / input.compositionWidth) * width,
      ),
      0,
      width,
    ),
    y2: clampInt(
      Math.ceil(
        ((tracked.box.y + tracked.box.height) / input.compositionHeight) *
          height,
      ),
      0,
      height,
    ),
  }));

  let covered = 0;
  const perElement = new Map<string, number>(
    boxes.map((box) => [box.elementId, 0]),
  );
  const uncovered = new Float64Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = saliency[y * width + x];
      const hits = boxes.filter(
        (box) => box.x1 <= x && x < box.x2 && box.y1 <= y && y < box.y2,
      );
      if (hits.length) {
        covered += value;
        for (const hit of hits) {
          perElement.set(
            hit.elementId,
            (perElement.get(hit.elementId) ?? 0) + value / hits.length,
          );
        }
      } else {
        uncovered[y * width + x] = value;
      }
    }
  }

  return {
    frame: input.frame,
    coveredSaliencyRatio: Math.min(1, covered / total),
    totalSaliency: total,
    elementSaliency: [...perElement.entries()]
      .map(([elementId, value]) => ({
        elementId,
        saliencyRatio: value / total,
      }))
      .sort(
        (a, b) =>
          b.saliencyRatio - a.saliencyRatio ||
          a.elementId.localeCompare(b.elementId),
      ),
    topUncoveredRegions: topRegions(
      uncovered,
      width,
      height,
      input.compositionWidth,
      input.compositionHeight,
      total,
    ),
  };
}

function topRegions(
  values: Float64Array,
  width: number,
  height: number,
  compositionWidth: number,
  compositionHeight: number,
  total: number,
): SaliencyRegion[] {
  const cols = Math.min(6, width);
  const rows = Math.min(4, height);
  const regions: SaliencyRegion[] = [];

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const x1 = Math.floor((gx * width) / cols);
      const x2 = Math.floor(((gx + 1) * width) / cols);
      const y1 = Math.floor((gy * height) / rows);
      const y2 = Math.floor(((gy + 1) * height) / rows);
      let score = 0;
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) score += values[y * width + x];
      }
      if (score <= 0) continue;
      regions.push({
        x: (x1 / width) * compositionWidth,
        y: (y1 / height) * compositionHeight,
        width: ((x2 - x1) / width) * compositionWidth,
        height: ((y2 - y1) / height) * compositionHeight,
        saliencyRatio: score / total,
      });
    }
  }

  return regions
    .sort((a, b) => b.saliencyRatio - a.saliencyRatio)
    .slice(0, 3);
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
