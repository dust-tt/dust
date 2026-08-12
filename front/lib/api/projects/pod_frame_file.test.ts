import { podRelativePathFromScopedPath } from "@app/lib/api/projects/pod_frame_file";
import { describe, expect, it } from "vitest";

const POD_ID = "vlt_abc123";

describe("podRelativePathFromScopedPath", () => {
  it("strips the canonical scope prefix", () => {
    // The bug this guards: passing the canonical scoped path straight to moveProjectFile. That form
    // is not recognised as scoped, so it was treated as relative and produced
    // `.../files/pod-{podId}/AnimalManager.tsx` — a path with the scope prefix nested inside the
    // mount path, which no object has.
    expect(
      podRelativePathFromScopedPath(`pod-${POD_ID}/AnimalManager.tsx`, POD_ID)
    ).toBe("AnimalManager.tsx");
  });

  it("keeps a nested path below the Pod root", () => {
    expect(
      podRelativePathFromScopedPath(
        `pod-${POD_ID}/AnimalManager/AnimalManager.tsx`,
        POD_ID
      )
    ).toBe("AnimalManager/AnimalManager.tsx");
  });

  it("returns null for another Pod's path", () => {
    expect(
      podRelativePathFromScopedPath("pod-vlt_other/Frame.tsx", POD_ID)
    ).toBeNull();
  });

  it("returns null for a path that is not Pod-scoped", () => {
    expect(
      podRelativePathFromScopedPath("conversation-abc/Frame.tsx", POD_ID)
    ).toBeNull();
    expect(podRelativePathFromScopedPath("Frame.tsx", POD_ID)).toBeNull();
  });

  it("returns null when nothing follows the prefix", () => {
    expect(podRelativePathFromScopedPath(`pod-${POD_ID}/`, POD_ID)).toBeNull();
  });
});
