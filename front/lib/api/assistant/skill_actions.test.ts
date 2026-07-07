import { tryListMCPTools } from "@app/lib/actions/mcp_actions";
import { resolveSkillMCPServers } from "@app/lib/api/assistant/skill_actions";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
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

    const { error, serverToolsAndInstructions } = await tryListMCPTools(
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
    expect(error).toBeUndefined();

    const serverNames = serverToolsAndInstructions.map(
      ({ serverName }) => serverName
    );
    expect(serverNames).toContain("company_data");
    expect(serverNames).not.toContain("data_sources_file_system");

    const companyDataTools = serverToolsAndInstructions
      .filter(({ serverName }) => serverName === "company_data")
      .flatMap(({ tools }) => tools);
    expect(companyDataTools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "company_data__cat",
        "company_data__semantic_search",
      ])
    );
    expect(
      companyDataTools.filter((tool) => tool.name === "company_data__cat")
    ).toHaveLength(1);
    expect(
      serverToolsAndInstructions
        .flatMap(({ tools }) => tools)
        .some((tool) => tool.name.startsWith("data_sources_file_system__"))
    ).toBe(false);
  });
});
