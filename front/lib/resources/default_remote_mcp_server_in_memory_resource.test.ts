import { Authenticator } from "@app/lib/auth";
import { DUST_COMPANY_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { DefaultRemoteMCPServerInMemoryResource } from "@app/lib/resources/default_remote_mcp_server_in_memory_resource";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { PlanFactory } from "@app/tests/utils/PlanFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

async function listAvailableNames(workspace: WorkspaceType): Promise<string[]> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const resources =
    await DefaultRemoteMCPServerInMemoryResource.listAvailableDefaultRemoteMCPServers(
      auth
    );
  return resources.map((resource) => resource.toJSON().name);
}

// Figma is offered to credit-based plans, or to any workspace with the `figma_mcp` flag.
describe("DefaultRemoteMCPServerInMemoryResource.listAvailableDefaultRemoteMCPServers", () => {
  it("offers Figma to credit-priced workspaces", async () => {
    const names = await listAvailableNames(
      await WorkspaceFactory.creditPriced()
    );

    expect(names).toContain("Figma");
  });

  it("offers Figma to the Dust company workspace", async () => {
    const plan = await PlanFactory.enterprise(DUST_COMPANY_PLAN_CODE);
    const names = await listAvailableNames(
      await WorkspaceFactory.fromPlan(plan)
    );

    expect(names).toContain("Figma");
  });

  it("hides Figma from other plans", async () => {
    const names = await listAvailableNames(await WorkspaceFactory.basic());

    expect(names).not.toContain("Figma");
  });

  it("offers Figma to other plans with the figma_mcp flag", async () => {
    const workspace = await WorkspaceFactory.basic();
    await FeatureFlagResource.enable(workspace, "figma_mcp");

    const names = await listAvailableNames(workspace);

    expect(names).toContain("Figma");
  });
});
