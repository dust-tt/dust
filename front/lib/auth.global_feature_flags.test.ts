import {
  Authenticator,
  getFeatureFlags,
  invalidateFeatureFlagsCache,
  invalidateGlobalFeatureFlagsCache,
} from "@app/lib/auth";
import { GlobalFeatureFlagModel } from "@app/lib/models/global_feature_flag";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GlobalFeatureFlagResource } from "@app/lib/resources/global_feature_flag_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { afterEach, describe, expect, it } from "vitest";

function invalidateAllCaches(auth: Authenticator) {
  invalidateFeatureFlagsCache(auth);
  invalidateGlobalFeatureFlagsCache();
}

describe("getFeatureFlags with global flags", () => {
  afterEach(async () => {
    await GlobalFeatureFlagModel.destroy({ where: {} });
  });

  it("returns global flag when no workspace flag is set", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Set global flag at 100%.
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "labs_transcripts",
      100
    );
    invalidateAllCaches(auth);

    const flags = await getFeatureFlags(auth);
    expect(flags).toContain("labs_transcripts");
  });

  it("workspace flag takes precedence over global flag", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Enable at workspace level and globally.
    await FeatureFlagResource.enable(workspace, "labs_transcripts");
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "labs_transcripts",
      100
    );
    invalidateAllCaches(auth);

    const flags = await getFeatureFlags(auth);
    // Should appear exactly once, not duplicated.
    expect(flags.filter((f) => f === "labs_transcripts")).toHaveLength(1);
  });

  it("global flag at 0% is not returned", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Setting to 0 should remove the global flag.
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "labs_transcripts",
      100
    );
    await GlobalFeatureFlagResource.setRolloutPercentage("labs_transcripts", 0);
    invalidateAllCaches(auth);

    const flags = await getFeatureFlags(auth);
    expect(flags).not.toContain("labs_transcripts");
  });

  it("global flag with percentage respects rollout bucket", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const bucket = workspace.id % 100;

    // Set percentage just above the workspace bucket so it's included.
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "labs_transcripts",
      bucket + 1
    );
    invalidateAllCaches(auth);

    const flagsIn = await getFeatureFlags(auth);
    expect(flagsIn).toContain("labs_transcripts");

    // Set percentage to exactly the bucket value so it's excluded.
    if (bucket > 0) {
      await GlobalFeatureFlagResource.setRolloutPercentage(
        "labs_transcripts",
        bucket
      );
      invalidateAllCaches(auth);

      const flagsOut = await getFeatureFlags(auth);
      expect(flagsOut).not.toContain("labs_transcripts");
    }
  });

  it("global flags and workspace flags are merged", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await FeatureFlagResource.enable(workspace, "deepseek_feature");
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "labs_transcripts",
      100
    );
    invalidateAllCaches(auth);

    const flags = await getFeatureFlags(auth);
    expect(flags).toContain("deepseek_feature");
    expect(flags).toContain("labs_transcripts");
  });
});

describe("GlobalFeatureFlagResource.isInRollout", () => {
  it("returns false for 0%", () => {
    expect(GlobalFeatureFlagResource.isInRollout(42, 0)).toBe(false);
  });

  it("returns true for 100%", () => {
    expect(GlobalFeatureFlagResource.isInRollout(42, 100)).toBe(true);
  });

  it("is deterministic", () => {
    const result = GlobalFeatureFlagResource.isInRollout(42, 50);
    expect(GlobalFeatureFlagResource.isInRollout(42, 50)).toBe(result);
  });

  it("is monotonic — included at lower % means included at higher %", () => {
    for (let id = 0; id < 200; id++) {
      let wasIn = false;
      for (let pct = 0; pct <= 100; pct++) {
        const isIn = GlobalFeatureFlagResource.isInRollout(id, pct);
        if (wasIn) {
          expect(isIn).toBe(true);
        }
        wasIn = isIn;
      }
    }
  });
});
