import { frameSandboxOnlyMounts } from "@app/lib/api/sandbox/frame_mounts";
import { describe, expect, it } from "vitest";

describe("frameSandboxOnlyMounts", () => {
  it("mounts only the stable Frame publication root read-only", () => {
    expect(frameSandboxOnlyMounts({ sId: "fil_frame" })).toEqual([
      {
        kind: "frame_publications",
        id: "fil_frame",
        sandboxMountPoint: "/frames/fil_frame/publications",
        readOnly: true,
      },
    ]);
  });
});
