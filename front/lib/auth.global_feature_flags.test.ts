import { Authenticator, getFeatureFlags, hasFeatureFlag } from "@app/lib/auth";
import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { GlobalFeatureFlagModel } from "@app/lib/models/global_feature_flag";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GlobalFeatureFlagResource } from "@app/lib/resources/global_feature_flag_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import {
  RequestQueryCache,
  setRequestStorageResolver,
} from "@app/types/shared/utils/request_context";
import { afterEach, describe, expect, it } from "vitest";

describe("getFeatureFlags with global flags", () => {
  afterEach(async () => {
    setRequestStorageResolver(null);
    await GlobalFeatureFlagModel.destroy({ where: {} });
  });

  it("returns global flag when no workspace flag is set", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Set global flag at 100%.
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "dummy_feature_for_flag_testing",
      100
    );

    const flags = await getFeatureFlags(auth);
    expect(flags).toContain("dummy_feature_for_flag_testing");
  });

  it("workspace flag takes precedence over global flag", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Enable at workspace level and globally.
    await FeatureFlagResource.enable(
      workspace,
      "dummy_feature_for_flag_testing"
    );
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "dummy_feature_for_flag_testing",
      100
    );

    const flags = await getFeatureFlags(auth);
    // Should appear exactly once, not duplicated.
    expect(
      flags.filter((f) => f === "dummy_feature_for_flag_testing")
    ).toHaveLength(1);
  });

  it("global flag at 0% is not returned", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Setting to 0 should remove the global flag.
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "dummy_feature_for_flag_testing",
      100
    );
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "dummy_feature_for_flag_testing",
      0
    );

    const flags = await getFeatureFlags(auth);
    expect(flags).not.toContain("dummy_feature_for_flag_testing");
  });

  it("global flag with percentage respects rollout bucket", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const bucket = workspace.id % 100;

    // Set percentage just above the workspace bucket so it's included.
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "dummy_feature_for_flag_testing",
      bucket + 1
    );

    const flagsIn = await getFeatureFlags(auth);
    expect(flagsIn).toContain("dummy_feature_for_flag_testing");

    // Set percentage to exactly the bucket value so it's excluded.
    if (bucket > 0) {
      await GlobalFeatureFlagResource.setRolloutPercentage(
        "dummy_feature_for_flag_testing",
        bucket
      );

      const flagsOut = await getFeatureFlags(auth);
      expect(flagsOut).not.toContain("dummy_feature_for_flag_testing");
    }
  });

  it("global flag applies only to workspaces meeting all its conditions", async () => {
    const enterpriseWorkspace = await WorkspaceFactory.enterprise();
    const proWorkspace = await WorkspaceFactory.basic();

    await GlobalFeatureFlagResource.setRolloutPercentage(
      "dummy_feature_for_flag_testing",
      100,
      ["enterprise_plan"]
    );

    const enterpriseFlags = await getFeatureFlags(
      await Authenticator.internalAdminForWorkspace(enterpriseWorkspace.sId)
    );
    const proFlags = await getFeatureFlags(
      await Authenticator.internalAdminForWorkspace(proWorkspace.sId)
    );
    expect(enterpriseFlags).toContain("dummy_feature_for_flag_testing");
    expect(proFlags).not.toContain("dummy_feature_for_flag_testing");
  });

  it("global flag with an unknown condition applies to no workspace", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await GlobalFeatureFlagModel.create({
      name: "dummy_feature_for_flag_testing",
      rolloutPercentage: 100,
      conditions: ["legacy_pro_plan", "removed_condition"],
    });

    const flags = await getFeatureFlags(auth);
    expect(flags).not.toContain("dummy_feature_for_flag_testing");
  });

  it("workspace flag applies regardless of global flag conditions", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await FeatureFlagResource.enable(
      workspace,
      "dummy_feature_for_flag_testing"
    );
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "dummy_feature_for_flag_testing",
      100,
      ["enterprise_plan"]
    );

    const flags = await getFeatureFlags(auth);
    expect(flags).toContain("dummy_feature_for_flag_testing");
  });

  it("global flags and workspace flags are merged", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await FeatureFlagResource.enable(workspace, "deepseek_feature");
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "dummy_feature_for_flag_testing",
      100
    );

    const flags = await getFeatureFlags(auth);
    expect(flags).toContain("deepseek_feature");
    expect(flags).toContain("dummy_feature_for_flag_testing");
  });

  it("returns disable_computer_feature alongside other feature flags", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await FeatureFlagResource.enableMany(workspace, [
      "disable_computer_feature",
      "deepseek_feature",
    ]);

    const flags = await getFeatureFlags(auth);
    expect(flags).toContain("disable_computer_feature");
    expect(flags).toContain("deepseek_feature");
  });

  it("keeps disable_computer_feature independent from raw feature flag checks", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await FeatureFlagResource.enableMany(workspace, [
      "disable_computer_feature",
      "deepseek_feature",
    ]);

    const flags = await getFeatureFlags(auth);
    expect(isComputerFeatureEnabled(flags)).toBe(false);
    await expect(hasFeatureFlag(auth, "deepseek_feature")).resolves.toBe(true);
  });

  it("enables Computer by default when disable_computer_feature is absent", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const flags = await getFeatureFlags(auth);
    expect(isComputerFeatureEnabled(flags)).toBe(true);

    await FeatureFlagResource.enable(workspace, "disable_computer_feature");

    const disabledFlags = await getFeatureFlags(auth);
    expect(disabledFlags).toContain("disable_computer_feature");
    expect(isComputerFeatureEnabled(disabledFlags)).toBe(false);
  });

  it("ignores legacy sandbox_tools rows while keeping Computer controlled by the disable flag", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await FeatureFlagModel.create({
      workspaceId: workspace.id,
      name: "sandbox_tools" as never,
    });
    await GlobalFeatureFlagModel.create({
      name: "sandbox_tools" as never,
      rolloutPercentage: 100,
    });

    const flags = await getFeatureFlags(auth);
    expect(flags).not.toContain("sandbox_tools");
    expect(isComputerFeatureEnabled(flags)).toBe(true);

    await FeatureFlagResource.enable(workspace, "disable_computer_feature");

    const disabledFlags = await getFeatureFlags(auth);
    expect(disabledFlags).not.toContain("sandbox_tools");
    expect(disabledFlags).toContain("disable_computer_feature");
    expect(isComputerFeatureEnabled(disabledFlags)).toBe(false);
  });

  it("disable_frames_v2 overrides the global frames_v2 rollout", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await GlobalFeatureFlagResource.setRolloutPercentage("frames_v2", 100);
    await GlobalFeatureFlagResource.setRolloutPercentage(
      "dummy_feature_for_flag_testing",
      100
    );
    await FeatureFlagResource.enable(workspace, "disable_frames_v2");

    const flags = await getFeatureFlags(auth);
    expect(flags).not.toContain("frames_v2");
    expect(flags).toContain("disable_frames_v2");
    expect(flags).toContain("dummy_feature_for_flag_testing");
    await expect(hasFeatureFlag(auth, "frames_v2")).resolves.toBe(false);
  });

  it("disable_frames_v2 overrides a workspace frames_v2 flag", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await FeatureFlagResource.enable(workspace, "frames_v2");
    await FeatureFlagResource.enable(workspace, "disable_frames_v2");

    const flags = await getFeatureFlags(auth);
    expect(flags).not.toContain("frames_v2");
  });

  it("keeps a stable resource snapshot until the next request", async () => {
    const workspace = await WorkspaceFactory.basic();
    const requestContext = {
      method: "GET",
      route: "/test",
      url: "/test",
    };
    let queryCache = new RequestQueryCache();
    setRequestStorageResolver(() => ({ queryCache, requestContext }));

    const first = await FeatureFlagResource.listForWorkspace(workspace);
    const second = await FeatureFlagResource.listForWorkspace(workspace);
    expect(second).toBe(first);

    await FeatureFlagResource.enable(workspace, "deepseek_feature");

    const afterMutation = await FeatureFlagResource.listForWorkspace(workspace);
    expect(afterMutation).toBe(first);
    expect(afterMutation.map((flag) => flag.name)).not.toContain(
      "deepseek_feature"
    );

    queryCache = new RequestQueryCache();
    const flags = await FeatureFlagResource.listForWorkspace(workspace);
    expect(flags.map((flag) => flag.name)).toContain("deepseek_feature");
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
