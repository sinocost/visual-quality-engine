import type { RemotionCompositionInput } from "../adapters/remotion-quality-types.js";

export interface RendererArtifact {
  filename: string;
  content: string | Uint8Array;
  frame: number;
}

export interface RendererSelectedComposition {
  quality: RemotionCompositionInput;
  /** Driver-owned native composition object. The quality engine treats it as opaque. */
  nativeComposition: unknown;
}

export interface RendererSelectCompositionOptions {
  serveUrl: string;
  compositionId: string;
  inputProps: Record<string, unknown>;
}

export interface RendererRenderFramesOptions {
  serveUrl: string;
  composition: RendererSelectedComposition;
  inputProps: Record<string, unknown>;
  frames: number[];
  concurrency?: number | string;
  onArtifact: (artifact: RendererArtifact) => void;
  onFrameBuffer: (buffer: Uint8Array, frame: number) => void;
}

export interface RemotionQualityRendererDriver {
  selectComposition(options: RendererSelectCompositionOptions): Promise<RendererSelectedComposition>;
  renderFrames(options: RendererRenderFramesOptions): Promise<void>;
}
