import { podFrameTabBasename } from "@app/types/pod_frame_tab";
import { describe, expect, it } from "vitest";

describe("podFrameTabBasename", () => {
  it("strips frame extensions", () => {
    expect(podFrameTabBasename("pod-p1/frames/Dashboard.tsx")).toBe(
      "Dashboard"
    );
    expect(podFrameTabBasename("Activity.jsx")).toBe("Activity");
  });

  it("strips markdown and other previewable extensions", () => {
    expect(podFrameTabBasename("pod-p1/notes/readme.md")).toBe("readme");
    expect(podFrameTabBasename("report.pdf")).toBe("report");
    expect(podFrameTabBasename("data.csv")).toBe("data");
  });

  it("keeps names without extensions", () => {
    expect(podFrameTabBasename("pod-p1/notes/README")).toBe("README");
  });
});
