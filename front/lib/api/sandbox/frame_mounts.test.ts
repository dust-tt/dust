import { frameSandboxOnlyMounts } from "@app/lib/api/sandbox/frame_mounts";
import { describe, expect, it } from "vitest";

describe("frameSandboxOnlyMounts", () => {
  it("mounts stable Frame publications and durable state", () => {
    expect(frameSandboxOnlyMounts({ sId: "fil_frame" })).toEqual([
      {
        kind: "frame_publications",
        frameId: "fil_frame",
        sandboxMountPoint: "/frames/fil_frame/publications",
        readOnly: true,
      },
      {
        kind: "frame_state",
        frameId: "fil_frame",
        sandboxMountPoint: "/sandbox-state/replica",
        readOnly: false,
      },
    ]);
  });
});
