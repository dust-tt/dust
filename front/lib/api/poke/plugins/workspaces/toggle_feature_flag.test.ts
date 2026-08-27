import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { toggleFeatureFlagPlugin } from "@app/lib/api/poke/plugins/workspaces/toggle_feature_flag";
import { Authenticator } from "@app/lib/auth";
import { DUST_COMPANY_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { PlanFactory } from "@app/tests/utils/PlanFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import {
  WHITELISTABLE_FEATURES,
  WHITELISTABLE_FEATURES_CONFIG,
} from "@app/types/shared/feature_flags";
import { describe, expect, it, vi } from "vitest";

function findFeatureFlagByDustOnlyStatus(dustOnly: boolean) {
  const feature = WHITELISTABLE_FEATURES.find(
    (feature) =>
      (WHITELISTABLE_FEATURES_CONFIG[feature].stage === "dust_only") ===
      dustOnly
  );

  if (!feature) {
    throw new Error(
      `Expected at least one ${dustOnly ? "Dust-only" : "non-Dust-only"} feature flag.`
    );
  }

  return feature;
}

describe("toggleFeatureFlagPlugin.execute", () => {
  it("ensures auto MCP server views when enabling a feature flag", async () => {
    const plan = await PlanFactory.enterprise(DUST_COMPANY_PLAN_CODE);
    const workspace = await WorkspaceFactory.fromPlan(plan);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

    const sandboxMCPServerId = autoInternalMCPServerNameToSId({
      name: "sandbox_functions",
      workspaceId: workspace.id,
    });

    await expect(
      MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        sandboxMCPServerId
      )
    ).resolves.toBeNull();
    await expect(
      MCPServerViewResource.getMCPServerViewForGlobalSpace(
        auth,
        sandboxMCPServerId
      )
    ).resolves.toBeNull();

    const enableResult = await toggleFeatureFlagPlugin.execute(auth, null, {
      features: ["sandbox_functions"],
    });

    expect(enableResult.isOk()).toBe(true);
    if (!enableResult.isOk()) {
      throw enableResult.error;
    }

    const systemViewAfterEnable =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        sandboxMCPServerId
      );
    const globalViewAfterEnable =
      await MCPServerViewResource.getMCPServerViewForGlobalSpace(
        auth,
        sandboxMCPServerId
      );
    expect(systemViewAfterEnable).not.toBeNull();
    expect(globalViewAfterEnable).not.toBeNull();

    const disableResult = await toggleFeatureFlagPlugin.execute(auth, null, {
      features: [],
    });
    expect(disableResult.isOk()).toBe(true);
    if (!disableResult.isOk()) {
      throw disableResult.error;
    }

    const reenableResult = await toggleFeatureFlagPlugin.execute(auth, null, {
      features: ["sandbox_functions"],
    });
    expect(reenableResult.isOk()).toBe(true);
    if (!reenableResult.isOk()) {
      throw reenableResult.error;
    }

    // Re-enabling must not create new views: the system/global view sIds
    // should match the ones returned right after the first enable.
    const systemViewAfterReenable =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        sandboxMCPServerId
      );
    const globalViewAfterReenable =
      await MCPServerViewResource.getMCPServerViewForGlobalSpace(
        auth,
        sandboxMCPServerId
      );
    expect(systemViewAfterReenable?.sId).toBe(systemViewAfterEnable?.sId);
    expect(globalViewAfterReenable?.sId).toBe(globalViewAfterEnable?.sId);
  });

  it("rejects enabling Dust-only feature flags on other plans", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const dustOnlyFeature = findFeatureFlagByDustOnlyStatus(true);

    const result = await toggleFeatureFlagPlugin.execute(auth, null, {
      features: [dustOnlyFeature],
    });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      throw new Error("Expected enabling the feature flag to fail.");
    }
    expect(result.error.message).toContain(
      "Dust-only feature flags can only be enabled on Dust or Friends & Family plans."
    );
    await expect(
      FeatureFlagResource.isEnabledForWorkspace(workspace, dustOnlyFeature)
    ).resolves.toBe(false);
  });

  it("allows enabling Dust-only feature flags on Friends & Family plans", async () => {
    const plan = await PlanFactory.enterprise("FREE_FRIENDSAMILY");
    const workspace = await WorkspaceFactory.fromPlan(plan);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const dustOnlyFeature = findFeatureFlagByDustOnlyStatus(true);

    const result = await toggleFeatureFlagPlugin.execute(auth, null, {
      features: [dustOnlyFeature],
    });

    expect(result.isOk()).toBe(true);
    await expect(
      FeatureFlagResource.isEnabledForWorkspace(workspace, dustOnlyFeature)
    ).resolves.toBe(true);
  });

  it("allows enabling Dust-only feature flags on any plan in development", async () => {
    vi.stubEnv("IS_DEVELOPMENT", "true");
    try {
      const workspace = await WorkspaceFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      const dustOnlyFeature = findFeatureFlagByDustOnlyStatus(true);

      const result = await toggleFeatureFlagPlugin.execute(auth, null, {
        features: [dustOnlyFeature],
      });

      expect(result.isOk()).toBe(true);
      await expect(
        FeatureFlagResource.isEnabledForWorkspace(workspace, dustOnlyFeature)
      ).resolves.toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("allows enabling non-Dust-only feature flags on other plans", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const nonDustOnlyFeature = findFeatureFlagByDustOnlyStatus(false);

    const result = await toggleFeatureFlagPlugin.execute(auth, null, {
      features: [nonDustOnlyFeature],
    });

    expect(result.isOk()).toBe(true);
    await expect(
      FeatureFlagResource.isEnabledForWorkspace(workspace, nonDustOnlyFeature)
    ).resolves.toBe(true);
  });
});
