import { describe, expect, it } from "vitest";

import { ACTIVATION_POD_FRAME_TEMPLATE } from "./activation_pod_frame_template";

describe("ACTIVATION_POD_FRAME_TEMPLATE", () => {
  it("contains all four tab titles", () => {
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain('"Overview"');
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain('"Your work"');
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain('"Your setup"');
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain('"Recommendations"');
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
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain('name: "Alex"');
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain('role: "Marketing"');
    expect(ACTIVATION_POD_FRAME_TEMPLATE).toContain('company: "Acme"');
  });

  it("does not contain real identifying information", () => {
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain('"Frank"');
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain("0ec9852c2f");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain("Doctolib");
    expect(ACTIVATION_POD_FRAME_TEMPLATE).not.toContain("Jul 20");
  });
});
