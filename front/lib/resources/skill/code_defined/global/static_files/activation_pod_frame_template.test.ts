import { describe, expect, it } from "vitest";

import { ACTIVATION_POD_FRAME_TEMPLATE } from "./activation_pod_frame_template";

describe("ACTIVATION_POD_FRAME_TEMPLATE", () => {
  it("is a single-state frame: a collapsible explainer plus recommendation tiles", () => {
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("const TILES");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("function PodIntro");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("function Tiles");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("const WHY_THIS_POD");
    // No day1/grown state machine, no tabbed dashboard.
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain("const LEVEL");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain("function DayOneView");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain("function GrownView");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain("TAB_TITLES");
  });

  it("contains both view modes", () => {
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("function FullView");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("function BannerView");
  });

  it("exports a default component", () => {
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain(
      "export default function ActivationPodFrame"
    );
  });

  it("uses anonymized placeholder data", () => {
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("Acme");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("Marketing");
  });
});
