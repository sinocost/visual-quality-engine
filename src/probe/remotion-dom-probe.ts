import React, { useLayoutEffect, useState } from "react";
import { Artifact, useCurrentFrame, useVideoConfig } from "remotion";
import { collectDomQualityProbeFrame } from "./dom-probe-browser.js";
import type { DomProbeOptions } from "./dom-probe-types.js";

export interface RemotionDomQualityProbeProps {
  rootSelector?: string;
  elementSelector?: string;
  artifactPrefix?: string;
  /** Auto-discovery is enabled by default. Pass false to require explicit data-vqe-id annotations. */
  autoDiscovery?: DomProbeOptions["autoDiscovery"];
}

/**
 * Mount this once at the composition root, outside nested <Sequence> nodes.
 * During renderer runs it emits one JSON artifact for the current composition frame.
 */
export const RemotionDomQualityProbe: React.FC<RemotionDomQualityProbeProps> = ({
  rootSelector,
  elementSelector,
  artifactPrefix = "vqe/dom",
  autoDiscovery = true,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const [sample, setSample] = useState<{ frame: number; content: string } | null>(null);

  useLayoutEffect(() => {
    const payload = collectDomQualityProbeFrame(document, {
      frame,
      width,
      height,
      rootSelector,
      elementSelector,
      autoDiscovery,
    });
    setSample({ frame, content: JSON.stringify(payload) });
  }, [autoDiscovery, elementSelector, frame, height, rootSelector, width]);

  // Prevent a stale previous-frame artifact from registering while React settles the new frame.
  if (!sample || sample.frame !== frame) return null;

  return React.createElement(Artifact, {
    filename: `${artifactPrefix}/frame-${String(frame).padStart(6, "0")}.json`,
    content: sample.content,
  });
};
