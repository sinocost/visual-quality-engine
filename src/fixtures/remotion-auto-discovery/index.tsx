import React from "react";
import { Composition, registerRoot } from "remotion";
import { AutoDiscoveryFixture } from "./Composition.js";

const Root: React.FC = () => (
  <Composition
    id="AutoDiscoveryFixture"
    component={AutoDiscoveryFixture}
    durationInFrames={90}
    fps={30}
    width={320}
    height={180}
  />
);

registerRoot(Root);
