import { DEFAULT_REMOTE_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import { Authenticator } from "@app/lib/auth";
import { DefaultRemoteMCPServerInMemoryResource } from "@app/lib/resources/default_remote_mcp_server_in_memory_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

const creditPricedOnlyNames = DEFAULT_REMOTE_MCP_SERVERS.filter(
  (config) => config.creditPricedPlansOnly && !config.featureFlag
).map((config) => config.name);

describe("DefaultRemoteMCPServerInMemoryResource.listAvailableDefaultRemoteMCPServers", () => {
  it("offers credit-priced-only presets to credit-priced workspaces", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const names = (
      await DefaultRemoteMCPServerInMemoryResource.listAvailableDefaultRemoteMCPServers(
        auth
      )
    ).map((resource) => resource.toJSON().name);

    expect(names).toEqual(expect.arrayContaining(creditPricedOnlyNames));
  });

  it("hides credit-priced-only presets from other plans", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const names = (
      await DefaultRemoteMCPServerInMemoryResource.listAvailableDefaultRemoteMCPServers(
        auth
      )
    ).map((resource) => resource.toJSON().name);

    expect(creditPricedOnlyNames.length).toBeGreaterThan(0);
    for (const name of creditPricedOnlyNames) {
      expect(names).not.toContain(name);
    }
  });
});
