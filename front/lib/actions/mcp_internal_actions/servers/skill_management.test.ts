import { beforeEach, describe, expect, it } from "vitest";

import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import type { Authenticator } from "@app/lib/auth";
import { ConversationSkillModel } from "@app/lib/models/skill/conversation_skill";
import { AgentLoopContextFactory } from "@app/tests/utils/AgentLoopContextFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPTestUtils } from "@app/tests/utils/MCPTestUtils";
import { SkillFactory } from "@app/tests/utils/SkillFactory";

describe("skill_management MCP server", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
  });

  describe("enable_skill tool", () => {
    it("should enable a skill for the current conversation", async () => {
      // Arrange: Create a skill and agent
      const skill = await SkillFactory.create(auth, {
        name: "TestSkill",
        status: "active",
      });

      // Create agent loop context
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      // Link skill to agent first (prerequisite for enableForAgent)
      await SkillFactory.linkToAgent(auth, {
        skillId: skill.id,
        agentConfigurationId:
          agentLoopContext.runContext!.agentConfiguration.id,
      });

      // Create test client
      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "skill_management",
        agentLoopContext
      );

      try {
        // Act: Call the enable_skill tool
        const result = await client.callTool({
          name: ENABLE_SKILL_TOOL_NAME,
          arguments: { skillName: skill.name },
        });

        // Assert: Tool should succeed
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content).toHaveLength(1);
        expect(content[0].type).toBe("text");
        expect(content[0].text).toContain(
          `Skill "${skill.name}" has been enabled`
        );

        // Verify skill was enabled for the conversation
        const workspace = auth.getNonNullableWorkspace();
        const conversation = agentLoopContext.runContext!.conversation;
        const conversationSkill = await ConversationSkillModel.findOne({
          where: {
            workspaceId: workspace.id,
            conversationId: conversation.id,
            customSkillId: skill.id,
          },
        });
        expect(conversationSkill).not.toBeNull();
      } finally {
        await cleanup();
      }
    });

    it("should return error when skill does not exist", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "skill_management",
        agentLoopContext
      );

      try {
        // Act: Try to enable non-existent skill
        const result = await client.callTool({
          name: ENABLE_SKILL_TOOL_NAME,
          arguments: { skillName: "NonExistentSkill" },
        });

        // Assert: Should return error
        const errorMessage = MCPTestUtils.assertToolError(result);
        expect(errorMessage).toContain('Skill "NonExistentSkill" not found');
      } finally {
        await cleanup();
      }
    });

    it("should return error when no conversation context is available", async () => {
      // Arrange: Create server without agentLoopContext
      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "skill_management"
        // Note: no agentLoopContext provided
      );

      try {
        // Act: Try to enable skill without context
        const result = await client.callTool({
          name: ENABLE_SKILL_TOOL_NAME,
          arguments: { skillName: "TestSkill" },
        });

        // Assert: Should return error about missing context
        const errorMessage = MCPTestUtils.assertToolError(result);
        expect(errorMessage).toContain("No conversation context available");
      } finally {
        await cleanup();
      }
    });

    it("should list available tools correctly", async () => {
      // Arrange
      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "skill_management"
      );

      try {
        // Act: List available tools
        const tools = await MCPTestUtils.listTools(client);

        // Assert: Should include enable_skill tool
        const enableSkillTool = tools.find(
          (t) => t.name === ENABLE_SKILL_TOOL_NAME
        );
        expect(enableSkillTool).toBeDefined();
        expect(enableSkillTool?.description).toContain("Enable a skill");
        expect(enableSkillTool?.inputSchema).toBeDefined();
      } finally {
        await cleanup();
      }
    });

    it("should enable skill that is already active for another agent", async () => {
      // Arrange: Create a skill and link it to one agent
      const skill = await SkillFactory.create(auth, {
        name: "SharedSkill",
        status: "active",
      });

      const firstAgentContext = await AgentLoopContextFactory.createRunContext(
        auth,
        {
          agentConfig: { name: "First Agent" },
        }
      );

      // Link skill to first agent
      await SkillFactory.linkToAgent(auth, {
        skillId: skill.id,
        agentConfigurationId:
          firstAgentContext.runContext!.agentConfiguration.id,
      });

      const { client: firstClient, cleanup: cleanupFirst } =
        await MCPTestUtils.createTestClient(
          auth,
          "skill_management",
          firstAgentContext
        );

      try {
        // Enable skill for first agent
        const firstResult = await firstClient.callTool({
          name: ENABLE_SKILL_TOOL_NAME,
          arguments: { skillName: skill.name },
        });
        MCPTestUtils.assertToolSuccess(firstResult);

        // Create second agent and enable the same skill
        const secondAgentContext =
          await AgentLoopContextFactory.createRunContext(auth, {
            agentConfig: { name: "Second Agent" },
          });

        // Link skill to second agent as well
        await SkillFactory.linkToAgent(auth, {
          skillId: skill.id,
          agentConfigurationId:
            secondAgentContext.runContext!.agentConfiguration.id,
        });

        const { client: secondClient, cleanup: cleanupSecond } =
          await MCPTestUtils.createTestClient(
            auth,
            "skill_management",
            secondAgentContext
          );

        try {
          // Act: Enable same skill for second agent
          const secondResult = await secondClient.callTool({
            name: ENABLE_SKILL_TOOL_NAME,
            arguments: { skillName: skill.name },
          });

          // Assert: Should succeed
          const content = MCPTestUtils.assertToolSuccess(secondResult);
          expect(content[0].text).toContain(
            `Skill "${skill.name}" has been enabled`
          );

          // Verify skill is linked to both agents
          const workspace = auth.getNonNullableWorkspace();
          const firstConversation = firstAgentContext.runContext!.conversation;
          const secondConversation =
            secondAgentContext.runContext!.conversation;

          const firstConversationSkill = await ConversationSkillModel.findOne({
            where: {
              workspaceId: workspace.id,
              conversationId: firstConversation.id,
              customSkillId: skill.id,
            },
          });

          const secondConversationSkill = await ConversationSkillModel.findOne({
            where: {
              workspaceId: workspace.id,
              conversationId: secondConversation.id,
              customSkillId: skill.id,
            },
          });

          expect(firstConversationSkill).not.toBeNull();
          expect(secondConversationSkill).not.toBeNull();
        } finally {
          await cleanupSecond();
        }
      } finally {
        await cleanupFirst();
      }
    });
  });
});
