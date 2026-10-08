import { isAudioTranscriptionAvailable } from "@app/lib/workspace_policies";
import { LightPlanFactory } from "@app/tests/utils/LightPlanFactory";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { describe, expect, it } from "vitest";

describe("isAudioTranscriptionAvailable", () => {
  it("is off for plans paid with customer credentials", () => {
    const owner = LightWorkspaceFactory.build();

    expect(
      isAudioTranscriptionAvailable({
        owner,
        plan: LightPlanFactory.build({ isByok: true }),
      })
    ).toBe(false);
    expect(
      isAudioTranscriptionAvailable({
        owner,
        plan: LightPlanFactory.build({ gateway: "edgee" }),
      })
    ).toBe(false);
  });
});
