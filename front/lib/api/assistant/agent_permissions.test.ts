import { shadowUsageConfigIds } from "@app/lib/api/assistant/agent_permissions";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import logger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

describe("shadowUsageConfigIds", () => {
  it.each([
    "active",
    "archived",
    "draft",
  ] as const)("only reports active differences (%s configuration on either side)", async (status) => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({ role: "user" });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const resource = await AgentResource.fetchByAgentConfiguration(auth, agent);
    assert(resource.id !== null);
    await FeatureFlagFactory.basic(auth, "group_permissions_shadow");
    // Keep the editor grant while setting up a historical or draft configuration.
    await AgentConfigurationModel.update(
      { status },
      { where: { id: agent.id, workspaceId: workspace.id } }
    );
    const warn = vi.spyOn(logger, "warn");

    expect(await shadowUsageConfigIds(auth, [], "getToolsUsage")).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(status === "active" ? 1 : 0);
    warn.mockClear();

    const revoked = await GroupPermissionResource.revokeFromUser(auth, {
      user: user.toJSON(),
      grantType: "editor",
      resourceType: "agent",
      resourceId: resource.id,
    });
    expect(revoked.isOk()).toBe(true);
    await auth.refresh();

    expect(
      await shadowUsageConfigIds(auth, [agent.id], "getToolsUsage")
    ).toEqual([agent.id]);
    expect(warn).toHaveBeenCalledTimes(status === "active" ? 1 : 0);
  });
});
