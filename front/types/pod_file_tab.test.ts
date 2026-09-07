import { podFileTabBasename } from "@app/types/pod_file_tab";
import { describe, expect, it } from "vitest";

describe("podFileTabBasename", () => {
  it("strips frame extensions", () => {
    expect(podFileTabBasename("pod-p1/frames/Dashboard.tsx")).toBe("Dashboard");
    expect(podFileTabBasename("Activity.jsx")).toBe("Activity");
  });

  it("strips markdown and other previewable extensions", () => {
    expect(podFileTabBasename("pod-p1/notes/readme.md")).toBe("readme");
    expect(podFileTabBasename("report.pdf")).toBe("report");
    expect(podFileTabBasename("data.csv")).toBe("data");
  });

  it("keeps names without extensions", () => {
    expect(podFileTabBasename("pod-p1/notes/README")).toBe("README");
  });
});
