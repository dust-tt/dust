import { getAgentsCreators } from "@app/lib/api/assistant/configuration/creators";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("getAgentsCreators", () => {
  let testContext: Awaited<ReturnType<typeof createResourceTest>>;

  beforeEach(async () => {
    testContext = await createResourceTest({ role: "admin" });
  });

  it("returns the sId of the user who created the agent (version 0 author)", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );

    const creatorIds = await getAgentsCreators(testContext.authenticator, [
      agent,
    ]);

    expect(creatorIds.get(agent.sId)).toBe(testContext.user.sId);
  });

  it("returns the original creator after the agent has been updated by another user", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "Original Agent" }
    );

    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, otherUser, {
      role: "admin",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      testContext.workspace.sId
    );

    const updated = await AgentConfigurationFactory.updateTestAgent(
      otherAuth,
      agent.sId,
      { name: "Updated Agent" }
    );

    const creatorIds = await getAgentsCreators(testContext.authenticator, [
      updated,
    ]);

    expect(creatorIds.get(updated.sId)).toBe(testContext.user.sId);
  });

  it("returns null for global agents", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );

    const globalAgent = {
      ...agent,
      scope: "global" as const,
    };

    const creatorIds = await getAgentsCreators(testContext.authenticator, [
      globalAgent,
    ]);

    expect(creatorIds.get(globalAgent.sId)).toBeNull();
  });

  it("handles a mix of global and custom agents", async () => {
    const customAgent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "Custom Agent" }
    );

    const globalAgent = {
      ...customAgent,
      sId: "global-fake-sid",
      scope: "global" as const,
    };

    const creatorIds = await getAgentsCreators(testContext.authenticator, [
      globalAgent,
      customAgent,
    ]);

    expect(creatorIds.get(globalAgent.sId)).toBeNull();
    expect(creatorIds.get(customAgent.sId)).toBe(testContext.user.sId);
  });

  it("returns all nulls when the list is empty", async () => {
    const creatorIds = await getAgentsCreators(testContext.authenticator, []);

    expect(creatorIds.size).toBe(0);
  });
});
