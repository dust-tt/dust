import { describe, expect, it } from "vitest";

import { ACTIVATION_POD_FRAME_TEMPLATE } from "./activation_pod_frame_template";

describe("ACTIVATION_POD_FRAME_TEMPLATE", () => {
  it("renders the evidence surface: why-chosen signals over a candidate stack", () => {
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("const WHY_CHOSEN");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain(
      "function WhyChosenSection"
    );
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("function CandidateStack");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("const CANDIDATES");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("HOW_IT_WORKS");
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

  it("embeds the result frame opened from a result sheet", () => {
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain(
      "fil_REPLACE_WITH_RESULT_FRAME_ID"
    );
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain("function ResultSheet");
  });

  it("uses an anonymized placeholder identity", () => {
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain('name: "User Name"');
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain('role: "Engineering"');
  });

  it("dropped the legacy tabbed / day-one design and its dead components", () => {
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain("TAB_TITLES");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain("const LEVEL");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain("function DayOneView");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain("function InputCard");
  });
});
