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
    expect(enableResult.value.value).toContain("created 2 views");

    await expect(
      MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        sandboxMCPServerId
      )
    ).resolves.not.toBeNull();
    await expect(
      MCPServerViewResource.getMCPServerViewForGlobalSpace(
        auth,
        sandboxMCPServerId
      )
    ).resolves.not.toBeNull();

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
    expect(reenableResult.value.value).toContain("created 0 views");
  });
});
