import { describe, expect, it } from "vitest";

import { ACTIVATION_POD_FRAME_TEMPLATE } from "./activation_pod_frame_template";

describe("ACTIVATION_POD_FRAME_TEMPLATE", () => {
  it("is a single-column progressive frame (Day 1 + grown, no tabs)", () => {
    // v9 renders by maturity LEVEL, not tabs.
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("const LEVEL");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("function DayOneView");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("function GrownView");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("HOW_IT_WORKS");
    // The old tabbed dashboard is gone (it overwhelmed new users).
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain("TAB_TITLES");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain('"Your setup"');
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
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain('name: "User"');
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain('role: "Marketing"');
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain('company: "Acme"');
  });
});
