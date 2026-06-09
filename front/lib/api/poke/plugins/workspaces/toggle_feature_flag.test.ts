import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { toggleFeatureFlagPlugin } from "@app/lib/api/poke/plugins/workspaces/toggle_feature_flag";
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

describe("toggleFeatureFlagPlugin.execute", () => {
  it("ensures sandbox MCP server views when enabling sandbox_tools", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

    const sandboxMCPServerId = autoInternalMCPServerNameToSId({
      name: "sandbox",
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
      features: ["sandbox_tools"],
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
      features: ["sandbox_tools"],
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
});
