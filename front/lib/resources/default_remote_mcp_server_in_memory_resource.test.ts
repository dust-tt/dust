import { DEFAULT_REMOTE_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import { Authenticator } from "@app/lib/auth";
import { DUST_COMPANY_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { DefaultRemoteMCPServerInMemoryResource } from "@app/lib/resources/default_remote_mcp_server_in_memory_resource";
import { PlanFactory } from "@app/tests/utils/PlanFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

const creditBasedOnlyNames = DEFAULT_REMOTE_MCP_SERVERS.filter(
  (config) => config.creditBasedPlansOnly && !config.featureFlag
).map((config) => config.name);

async function listAvailableNames(workspace: WorkspaceType): Promise<string[]> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const resources =
    await DefaultRemoteMCPServerInMemoryResource.listAvailableDefaultRemoteMCPServers(
      auth
    );
  return resources.map((resource) => resource.toJSON().name);
}

describe("DefaultRemoteMCPServerInMemoryResource.listAvailableDefaultRemoteMCPServers", () => {
  it("offers credit-based-only presets to credit-priced workspaces", async () => {
    const names = await listAvailableNames(
      await WorkspaceFactory.creditPriced()
    );

    expect(names).toEqual(expect.arrayContaining(creditBasedOnlyNames));
  });

  it("offers credit-based-only presets to the Dust company workspace", async () => {
    const plan = await PlanFactory.enterprise(DUST_COMPANY_PLAN_CODE);
    const names = await listAvailableNames(
      await WorkspaceFactory.fromPlan(plan)
    );

    expect(names).toEqual(expect.arrayContaining(creditBasedOnlyNames));
  });

  it("hides credit-based-only presets from other plans", async () => {
    const names = await listAvailableNames(await WorkspaceFactory.basic());

    expect(creditBasedOnlyNames.length).toBeGreaterThan(0);
    for (const name of creditBasedOnlyNames) {
      expect(names).not.toContain(name);
    }
  });
});
