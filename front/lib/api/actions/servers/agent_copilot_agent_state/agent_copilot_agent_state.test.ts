import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it, vi } from "vitest";

import { TOOLS } from "./tools";

// Mock the helper that extracts agent configuration ID from context.
vi.mock("@app/lib/api/actions/servers/agent_copilot_helpers", () => ({
  getAgentConfigurationIdFromContext: vi.fn(),
  getAgentConfigurationVersionFromContext: vi.fn(),
}));

function getToolByName(name: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool;
}

// Create a minimal extra object for testing.
function createTestExtra(auth: Authenticator, agentLoopContext?: unknown) {
  return {
    signal: new AbortController().signal,
    auth,
    agentLoopContext,
  } as Parameters<(typeof TOOLS)[0]["handler"]>[1];
}

describe("agent_copilot_agent_state tools", () => {
  describe("get_agent_info", () => {
    it("returns error when agent configuration ID is not available", async () => {
      const workspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(workspace);
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      // Mock the helper to return null (no agent config ID).
      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(null);

      const tool = getToolByName("get_agent_info");
      const result = await tool.handler({}, createTestExtra(auth));

      expect(result.isErr()).toBe(true);
    });

    it("returns error when agent configuration is not found", async () => {
      const workspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(workspace);
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      // Mock the helper to return a non-existent agent config ID.
      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        "non-existent-agent-id"
      );

      const tool = getToolByName("get_agent_info");
      const result = await tool.handler({}, createTestExtra(auth));

      expect(result.isErr()).toBe(true);
    });

    it("returns agent info when agent configuration exists", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceFactory.defaults(adminAuth);
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Create an agent configuration.
      const agent = await AgentConfigurationFactory.createTestAgent(userAuth, {
        name: "Test Agent",
        description: "Test Description",
      });

      // Mock the helper to return the agent config ID.
      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agent.sId
      );

      const tool = getToolByName("get_agent_info");
      const result = await tool.handler({}, createTestExtra(userAuth));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.sId).toBe(agent.sId);
          expect(parsed.name).toBe("Test Agent");
          expect(parsed.description).toBe("Test Description");
          expect(parsed.model).toBeDefined();
          expect(parsed.tools).toBeDefined();
          expect(Array.isArray(parsed.tools)).toBe(true);
          expect(parsed.skills).toBeDefined();
          expect(Array.isArray(parsed.skills)).toBe(true);
        }
      }
    });

    it("returns skills associated with the agent", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceFactory.defaults(adminAuth);
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Create an agent configuration.
      const agent = await AgentConfigurationFactory.createTestAgent(userAuth, {
        name: "Agent with Skills",
      });

      // Create a skill and link it to the agent.
      const skill = await SkillFactory.create(userAuth, {
        name: "Test Skill",
        userFacingDescription: "A test skill for the agent",
      });

      await SkillFactory.linkToAgent(userAuth, {
        skillId: skill.id,
        agentConfigurationId: agent.id,
      });

      // Mock the helper to return the agent config ID.
      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agent.sId
      );

      const tool = getToolByName("get_agent_info");
      const result = await tool.handler({}, createTestExtra(userAuth));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.skills.length).toBe(1);
          expect(parsed.skills[0].sId).toBe(skill.sId);
          expect(parsed.skills[0].name).toBe("Test Skill");
          expect(parsed.skills[0].userFacingDescription).toBe(
            "A test skill for the agent"
          );
        }
      }
    });

    it("returns empty skills array when agent has no skills", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceFactory.defaults(adminAuth);
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Create an agent configuration without skills.
      const agent = await AgentConfigurationFactory.createTestAgent(userAuth, {
        name: "Agent without Skills",
      });

      // Mock the helper to return the agent config ID.
      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agent.sId
      );

      const tool = getToolByName("get_agent_info");
      const result = await tool.handler({}, createTestExtra(userAuth));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.skills).toEqual([]);
        }
      }
    });
  });
});
