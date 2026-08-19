import { DOM_PROBE_VERSION, type DomProbeFrameArtifact } from "./dom-probe-types.js";
import { inspectDomProbeFrames } from "./render-diagnostics.js";

const frame: DomProbeFrameArtifact = {
  version: DOM_PROBE_VERSION,
  frame: 10,
  width: 320,
  height: 180,
  rootFound: true,
  documentFontsStatus: "loaded",
  duplicateIds: [],
  elements: [
    {
      id: "task-card",
      role: "primary",
      allowClipping: false,
      allowTextOverflow: false,
      requiredVisible: false,
      box: { x: 40, y: 40, width: 100, height: 50 },
      visible: true,
      opacity: 1,
      display: "block",
      visibility: "visible",
      clientWidth: 100,
      clientHeight: 50,
      scrollWidth: 100,
      scrollHeight: 50,
      overflowX: "visible",
      overflowY: "visible",
      clippingAncestor: {
        qualityElementId: "viewport",
        tagName: "div",
        overflowX: "hidden",
        overflowY: "visible",
      },
    },
  ],
};

const issues = inspectDomProbeFrames([frame]);
const clipping = issues.find(
  (issue) =>
    issue.kind === "clipping" &&
    issue.elementIds?.includes("task-card") &&
    issue.message?.includes("viewport"),
);

if (!clipping) {
  throw new Error("Assertion failed: ancestor overflow clipping was not detected");
}

console.log(JSON.stringify({
  status: "PASS",
  issue: clipping,
}, null, 2));
