import { frameSandboxOnlyMounts } from "@app/lib/api/sandbox/frame_mounts";
import { describe, expect, it } from "vitest";

describe("frameSandboxOnlyMounts", () => {
  it("mounts stable Frame publications, durable state and the files folder", () => {
    expect(frameSandboxOnlyMounts({ sId: "fil_frame" })).toEqual([
      {
        kind: "frame_publications",
        frameId: "fil_frame",
        sandboxMountPoint: "/frames/fil_frame/publications",
        readOnly: true,
      },
      {
        kind: "frame_database_replicas",
        frameId: "fil_frame",
        sandboxMountPoint: "/sandbox-state/replica",
        readOnly: false,
      },
      {
        kind: "frame_persistent_files",
        frameId: "fil_frame",
        sandboxMountPoint: "/frames/fil_frame/files",
        readOnly: false,
      },
    ]);
  });
});
