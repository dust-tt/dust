import { makeGenerateFrameOgImageWorkflowId } from "@app/temporal/frame_og/helpers";
import { describe, expect, it } from "vitest";

describe("frame_og helpers", () => {
  it("builds a deterministic workflow id per workspace + frame", () => {
    expect(
      makeGenerateFrameOgImageWorkflowId({
        workspaceId: "w_abc",
        frameId: "fil_xyz",
      })
    ).toBe("frame-og-w_abc-fil_xyz");
  });
});
