import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { tryListMCPTools } from "@app/lib/actions/mcp_actions";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { resolveSkillMCPServers } from "@app/lib/api/assistant/skill_actions";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SKILL_COMPANY_DATA_SERVER_NAME } from "@app/lib/resources/skill/code_defined/shared";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("resolveSkillMCPServers", () => {
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

    const skillServers = await resolveSkillMCPServers(authenticator, {
      agentConfiguration,
      conversation,
    });

    const serverToolsAndInstructions = await tryListMCPTools(
      authenticator,
      {
        agentConfiguration,
        agentMessage,
        clientSideActionConfigurations: [],
        conversation,
      },
      {
        jitServers: [],
        skillServers,
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
