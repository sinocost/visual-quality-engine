import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";
import {
  qualityRootAttributes,
  qualitySceneAttributes,
  RemotionDomQualityProbe,
} from "../../remotion.js";

export const AutoDiscoveryFixture: React.FC = () => {
  const frame = useCurrentFrame();
  const taskAX = interpolate(frame, [8, 22], [-60, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taskAOpacity = interpolate(frame, [8, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taskBOpacity = interpolate(frame, [34, 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      {...qualityRootAttributes()}
      style={{
        backgroundColor: "#0b1020",
        color: "white",
        fontFamily: "Arial, sans-serif",
        padding: 24,
      }}
    >
      <div
        {...qualitySceneAttributes("scene-1")}
        style={{display: "flex", flexDirection: "column", gap: 16, height: "100%"}}
      >
        <h1 id="hero-title" style={{fontSize: 34, margin: 0, fontWeight: 700}}>
          asyncio execution handoff
        </h1>

        <div style={{display: "flex", gap: 18, flex: 1, alignItems: "center"}}>
          <div
            id="task-a"
            style={{
              translate: `${taskAX}px 0px`,
              opacity: taskAOpacity,
              width: 118,
              padding: 16,
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 12,
              backgroundColor: "#17213b",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            Task A · WAITING
          </div>
          <div
            id="task-b"
            style={{
              opacity: taskBOpacity,
              width: 118,
              padding: 16,
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 12,
              backgroundColor: "#17372f",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            Task B · RUNNING
          </div>
        </div>

        <div id="caption" style={{fontSize: 20, lineHeight: "28px"}}>
          await 让出执行权，事件循环继续推进其他任务
        </div>
      </div>

      {/* No qualityElementAttributes() are used in this fixture. */}
      <RemotionDomQualityProbe autoDiscovery />
    </AbsoluteFill>
  );
};
