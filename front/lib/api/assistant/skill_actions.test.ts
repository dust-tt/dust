import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { tryListMCPTools } from "@app/lib/actions/mcp_actions";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { _getAnalystGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/analyst";
import { resolveSkillMCPServers } from "@app/lib/api/assistant/skill_actions";
import { ConversationSelectedSpaceResource } from "@app/lib/resources/conversation_selected_space_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SKILL_COMPANY_DATA_SERVER_NAME } from "@app/lib/resources/skill/code_defined/shared";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { describe, expect, it } from "vitest";

describe("resolveSkillMCPServers", () => {
  it("includes selected Spaces in Discover Knowledge scope", async () => {
    const { authenticator, globalSpace, user, workspace } =
      await createResourceTest({ role: "admin" });
    await FeatureFlagFactory.basic(
      authenticator,
      "restricted_spaces_in_input_bar"
    );
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(authenticator);

    const selectedSpace = await SpaceFactory.regular(workspace);
    const addMemberResult = await selectedSpace.addMembers(authenticator, {
      userIds: [user.sId],
    });
    expect(addMemberResult.isOk()).toBe(true);
    await authenticator.refresh();

    const selectedDataSourceView = await DataSourceViewFactory.folder(
      workspace,
      selectedSpace,
      user
    );
    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { requestedSpaceIds: [globalSpace.id] }
    );
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    await ConversationSelectedSpaceResource.upsertForConversation(
      authenticator,
      {
        conversation,
        origin: "input_bar",
        spaces: [selectedSpace],
      }
    );

    const [discoverKnowledge] = await SkillResource.fetchByIds(authenticator, [
      "discover_knowledge",
    ]);
    expect(discoverKnowledge).toBeDefined();
    if (!discoverKnowledge) {
      throw new Error("Expected Discover Knowledge skill.");
    }
    await SkillResource.addManyToAgent(authenticator, {
      agentConfiguration,
      skills: [discoverKnowledge],
    });

    const { hasSelectedSpacesOutsideAgentScope } =
      await SkillResource.listForAgentLoop(authenticator, {
        agentConfiguration,
        conversation,
      });
    expect(hasSelectedSpacesOutsideAgentScope).toBe(true);

    const agentWithSelectedSpace =
      await AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "Agent with selected Space in scope",
        requestedSpaceIds: [globalSpace.id, selectedSpace.id],
      });
    const subsetScope = await SkillResource.listForAgentLoop(authenticator, {
      agentConfiguration: agentWithSelectedSpace,
      conversation,
    });
    expect(subsetScope.hasSelectedSpacesOutsideAgentScope).toBe(false);

    const { systemSkillServers } = await resolveSkillMCPServers(authenticator, {
      agentConfiguration,
      conversation,
    });
    const companyDataServer = systemSkillServers
      .filter(isServerSideMCPServerConfiguration)
      .find((server) => server.name === SKILL_COMPANY_DATA_SERVER_NAME);

    expect(companyDataServer?.dataSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dataSourceViewId: selectedDataSourceView.sId,
        }),
      ])
    );
  });

  it("eagerly exposes workspace analytics tools to Analyst", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(authenticator);

    const agentConfiguration = _getAnalystGlobalAgent({
      auth: authenticator,
    });
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      authenticator,
      {
        workspace,
        conversation,
        agentConfig: agentConfiguration,
      }
    );
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth: authenticator,
      workspace,
      conversation,
      content: "Which agents are used most?",
      // The agent message factory sits at rank 0.
      rank: 1,
    });

    const skillBuckets = await SkillResource.listForAgentLoop(authenticator, {
      agentConfiguration,
      conversation,
    });
    expect(
      skillBuckets.systemSkills.some(
        (skill) => skill.sId === "workspace-analytics"
      )
    ).toBe(true);

    const { skillServers, systemSkillServers } = await resolveSkillMCPServers(
      authenticator,
      {
        agentConfiguration,
        conversation,
      }
    );
    const serverToolsAndInstructions = await tryListMCPTools(
      authenticator,
      {
        agentConfiguration,
        agentMessage,
        userMessage,
        clientSideActionConfigurations: [],
        conversation,
      },
      {
        jitServers: [],
        skillServers,
        systemSkillServers,
      }
    );

    const workspaceAnalyticsTools = serverToolsAndInstructions
      .filter(({ serverName }) =>
        ["workspace_analytics", "workspace_management"].includes(serverName)
      )
      .flatMap(({ tools }) => tools);

    expect(workspaceAnalyticsTools.length).toBeGreaterThan(0);
    expect(workspaceAnalyticsTools.every((tool) => tool.eager)).toBe(true);
  });

  it("does not auto-equip workspace analytics on other agents", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });

    const { systemSkills, enabledSkills, equippedSkills } =
      await SkillResource.listForAgentLoop(authenticator, {
        agentConfiguration,
        conversation,
      });
    const isWorkspaceAnalytics = (skill: SkillResource) =>
      skill.sId === "workspace-analytics";

    expect(systemSkills.some(isWorkspaceAnalytics)).toBe(false);
    expect(enabledSkills.some(isWorkspaceAnalytics)).toBe(false);
    expect(equippedSkills.some(isWorkspaceAnalytics)).toBe(false);
  });

  it("exposes one set of company data tools when Discover Knowledge and Go Deep are enabled", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(authenticator);

    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      authenticator,
      {
        workspace,
        conversation,
        agentConfig: agentConfiguration,
      }
    );
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth: authenticator,
      workspace,
      conversation,
      content: "Hello",
      // The agent message factory sits at rank 0.
      rank: 1,
    });

    const skills = await SkillResource.fetchByIds(authenticator, [
      "discover_knowledge",
      "go-deep",
    ]);
    const discoverKnowledge = skills.find(
      (skill) => skill.sId === "discover_knowledge"
    );
    const goDeep = skills.find((skill) => skill.sId === "go-deep");
    expect(discoverKnowledge).toBeDefined();
    expect(goDeep).toBeDefined();
    if (!discoverKnowledge || !goDeep) {
      throw new Error("Expected Discover Knowledge and Go Deep skills.");
    }

    await SkillResource.addManyToAgent(authenticator, {
      agentConfiguration,
      skills: [discoverKnowledge, goDeep],
    });
    await goDeep.enableForAgent(authenticator, {
      agentConfiguration,
      conversation,
    });

    const { skillServers, systemSkillServers } = await resolveSkillMCPServers(
      authenticator,
      {
        agentConfiguration,
        conversation,
      }
    );

    const serverToolsAndInstructions = await tryListMCPTools(
      authenticator,
      {
        agentConfiguration,
        agentMessage,
        userMessage,
        clientSideActionConfigurations: [],
        conversation,
      },
      {
        jitServers: [],
        skillServers,
        systemSkillServers,
      }
    );

    const serverNames = serverToolsAndInstructions.map(
      ({ serverName }) => serverName
    );
    expect(serverNames).toContain(SKILL_COMPANY_DATA_SERVER_NAME);
    expect(serverNames).not.toContain("data_sources_file_system");

    const companyDataTools = serverToolsAndInstructions
      .filter(({ serverName }) => serverName === SKILL_COMPANY_DATA_SERVER_NAME)
      .flatMap(({ tools }) => tools);
    expect(companyDataTools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        `${SKILL_COMPANY_DATA_SERVER_NAME}__cat`,
        `${SKILL_COMPANY_DATA_SERVER_NAME}__semantic_search`,
      ])
    );
    expect(
      companyDataTools.filter(
        (tool) => tool.name === `${SKILL_COMPANY_DATA_SERVER_NAME}__cat`
      )
    ).toHaveLength(1);
    expect(
      companyDataTools.find(
        (tool) =>
          tool.name === `${SKILL_COMPANY_DATA_SERVER_NAME}__semantic_search`
      )?.eager
    ).toBe(true);
    expect(
      serverToolsAndInstructions
        .flatMap(({ tools }) => tools)
        .some((tool) => tool.name.startsWith("data_sources_file_system__"))
    ).toBe(false);
  });

  it("keeps tools from skill servers deferred even when their metadata is eager", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(authenticator);

    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      authenticator,
      {
        workspace,
        conversation,
        agentConfig: agentConfiguration,
      }
    );
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth: authenticator,
      workspace,
      conversation,
      content: "Hello",
      // The agent message factory sits at rank 0.
      rank: 1,
    });

    const autoInternalViews =
      await MCPServerViewResource.getMCPServerViewsForAutoInternalToolsAsMap(
        authenticator,
        [SKILL_MANAGEMENT_SERVER_NAME]
      );
    const skillManagementView = autoInternalViews.get(
      SKILL_MANAGEMENT_SERVER_NAME
    );
    expect(skillManagementView).toBeDefined();
    if (!skillManagementView) {
      throw new Error("Expected skill management MCP server view.");
    }

    const serverToolsAndInstructions = await tryListMCPTools(
      authenticator,
      {
        agentConfiguration,
        agentMessage,
        userMessage,
        clientSideActionConfigurations: [],
        conversation,
      },
      {
        jitServers: [],
        skillServers: [
          buildServerSideMCPServerConfiguration({
            mcpServerView: skillManagementView,
            serverNameOverride: SKILL_MANAGEMENT_SERVER_NAME,
          }),
        ],
        systemSkillServers: [],
      }
    );

    const enableSkillTool = serverToolsAndInstructions
      .flatMap(({ tools }) => tools)
      .find(
        (tool) =>
          tool.name ===
          `${SKILL_MANAGEMENT_SERVER_NAME}__${ENABLE_SKILL_TOOL_NAME}`
      );
    expect(enableSkillTool).toBeDefined();
    expect(enableSkillTool?.eager).toBeUndefined();
  });
});
