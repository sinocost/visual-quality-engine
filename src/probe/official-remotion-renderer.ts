import { renderFrames, selectComposition } from "@remotion/renderer";
import type { RemotionQualityRendererDriver } from "./remotion-renderer-driver.js";

/** Official @remotion/renderer bridge used by the automatic quality pipeline. */
export const officialRemotionRendererDriver: RemotionQualityRendererDriver = {
  async selectComposition(options) {
    const composition = await selectComposition({
      serveUrl: options.serveUrl,
      id: options.compositionId,
      inputProps: options.inputProps,
    });
    return {
      quality: {
        id: composition.id,
        fps: composition.fps,
        width: composition.width,
        height: composition.height,
        durationInFrames: composition.durationInFrames,
      },
      nativeComposition: composition,
    };
  },

  async renderFrames(options) {
    await renderFrames({
      serveUrl: options.serveUrl,
      composition: options.composition.nativeComposition as Parameters<typeof renderFrames>[0]["composition"],
      inputProps: options.inputProps,
      frames: options.frames,
      imageFormat: "png",
      outputDir: null,
      muted: true,
      concurrency: options.concurrency,
      onStart: () => undefined,
      onFrameUpdate: () => undefined,
      onArtifact: (artifact) => options.onArtifact(artifact),
      onFrameBuffer: (buffer, frame) => options.onFrameBuffer(buffer, frame),
    });
  },
};
