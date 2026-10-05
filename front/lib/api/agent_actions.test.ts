import { getToolsUsage } from "@app/lib/api/agent_actions";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { beforeAll, describe, expect, it } from "vitest";

describe("getToolsUsage", () => {
  beforeAll(() => {
    process.env.FRONT_DATABASE_READ_REPLICA_URI =
      process.env.FRONT_DATABASE_URI;
  });

  it("aggregates usage with the caller's visibility", async () => {
    const testContext = await createResourceTest({ role: "admin" });
    const server = await RemoteMCPServerFactory.create(testContext.workspace);
    const firstView = await MCPServerViewFactory.create(
      testContext.workspace,
      server.sId,
      testContext.globalSpace
    );
    const regularSpace = await SpaceFactory.regular(testContext.workspace);
    const secondView = await MCPServerViewFactory.create(
      testContext.workspace,
      server.sId,
      regularSpace
    );
    const visibleAgent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "Visible agent", scope: "visible" }
    );
    const hiddenAgent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "Hidden agent", scope: "hidden" }
    );
    await AgentMCPServerConfigurationFactory.create(
      testContext.authenticator,
      testContext.globalSpace,
      { agent: visibleAgent, mcpServerView: firstView }
    );
    await AgentMCPServerConfigurationFactory.create(
      testContext.authenticator,
      testContext.globalSpace,
      { agent: hiddenAgent, mcpServerView: firstView }
    );
    const publishedSkill = await SkillFactory.create(
      testContext.authenticator,
      {
        name: "Published skill",
        availability: "workspace_users",
        mcpServerViews: [firstView, secondView],
      }
    );
    const unpublishedSkill = await SkillFactory.create(
      testContext.authenticator,
      {
        name: "Unpublished skill",
        availability: "editors",
        mcpServerViews: [firstView],
      }
    );
    await SkillFactory.create(testContext.authenticator, {
      name: "Archived skill",
      status: "archived",
      mcpServerViews: [firstView],
    });

    const adminUsage = await getToolsUsage(testContext.authenticator);

    expect(adminUsage[server.sId]?.count).toBe(4);
    expect(adminUsage[server.sId]?.agents.map((agent) => agent.sId)).toEqual([
      hiddenAgent.sId,
      visibleAgent.sId,
    ]);
    expect(adminUsage[server.sId]?.skills.map((skill) => skill.sId)).toEqual([
      publishedSkill.sId,
      unpublishedSkill.sId,
    ]);

    const user = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, user, {
      role: "user",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      testContext.workspace.sId
    );

    const memberUsage = await getToolsUsage(auth);

    expect(memberUsage[server.sId]?.count).toBe(2);
    expect(memberUsage[server.sId]?.agents.map((agent) => agent.sId)).toEqual([
      visibleAgent.sId,
    ]);
    expect(memberUsage[server.sId]?.skills.map((skill) => skill.sId)).toEqual([
      publishedSkill.sId,
    ]);
  });
});
