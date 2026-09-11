import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import { tryListMCPTools } from "@app/lib/actions/mcp_actions";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import {
  getGlobalAgents,
  upsertGlobalAgentSettings,
} from "@app/lib/api/assistant/global_agents/global_agents";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { resolveSkillMCPServers } from "@app/lib/api/assistant/skill_actions";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { describe, expect, it } from "vitest";

describe("Dust Raw", () => {
  it("requires its feature flag for listing and direct fetches", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const listedBefore = await getGlobalAgents(
      authenticator,
      undefined,
      "light"
    );
    const fetchedBefore = await getGlobalAgents(authenticator, [
      GLOBAL_AGENTS_SID.DUST_RAW,
    ]);
    expect(listedBefore.map((agent) => agent.sId)).not.toContain(
      GLOBAL_AGENTS_SID.DUST_RAW
    );
    expect(fetchedBefore).toEqual([]);

    await FeatureFlagFactory.basic(authenticator, "dust_raw_agent");
    const listedAfter = await getGlobalAgents(
      authenticator,
      undefined,
      "light"
    );
    const fetchedAfter = await getGlobalAgents(authenticator, [
      GLOBAL_AGENTS_SID.DUST_RAW,
    ]);
    expect(listedAfter.map((agent) => agent.sId)).toContain(
      GLOBAL_AGENTS_SID.DUST_RAW
    );
    expect(fetchedAfter).toHaveLength(1);
  });

  it.each([
    "light",
    "full",
  ] as const)("uses Dust's model with no configured capabilities (%s)", async (variant) => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    await FeatureFlagFactory.basic(authenticator, "dust_raw_agent");
    const [dust, raw] = await getGlobalAgents(
      authenticator,
      [GLOBAL_AGENTS_SID.DUST, GLOBAL_AGENTS_SID.DUST_RAW],
      variant
    );
    expect(raw.model).toEqual(dust.model);
    expect(raw).toMatchObject({
      sId: GLOBAL_AGENTS_SID.DUST_RAW,
      name: "dust-raw",
      status: "active",
      actions: [],
      codeDefinedSkillIds: [],
      requestedSpaceIds: [],
      requestedGroupIds: [],
    });

    await upsertGlobalAgentSettings(authenticator, {
      agentId: GLOBAL_AGENTS_SID.DUST_RAW,
      status: "disabled_by_admin",
    });
    const [disabled] = await getGlobalAgents(
      authenticator,
      [GLOBAL_AGENTS_SID.DUST_RAW],
      variant
    );
    expect(disabled.status).toBe("disabled_by_admin");
    expect(disabled.actions).toEqual([]);
    expect(disabled.codeDefinedSkillIds).toEqual([]);
  });

  it("does not inherit skills or tools from a Pod, conversation, or client", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(authenticator, "dust_raw_agent");
    await FeatureFlagFactory.basic(authenticator, "user_memory");
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(authenticator);
    const [raw] = await getGlobalAgents(authenticator, [
      GLOBAL_AGENTS_SID.DUST_RAW,
    ]);

    const pod = await SpaceFactory.project(workspace, user.id);
    const skill = await SkillFactory.create(authenticator, {
      name: "Pod skill",
    });
    const metadata = await ProjectMetadataResource.makeNew(authenticator, pod, {
      description: "Private Pod context",
    });
    await metadata.setDefaultSkills([skill]);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: raw.sId,
      messagesCreatedAt: [],
      spaceId: pod.id,
    });
    const enabled = await skill.upsertToConversation(authenticator, {
      conversationId: conversation.id,
      enabled: true,
    });
    expect(enabled.isOk()).toBe(true);

    const autoViews =
      await MCPServerViewResource.getMCPServerViewsForAutoInternalToolsAsMap(
        authenticator,
        ["common_utilities"]
      );
    const view = autoViews.get("common_utilities");
    if (!view) {
      throw new Error("Expected common utilities server view.");
    }
    const attached = await ConversationResource.upsertMCPServerViews(
      authenticator,
      {
        conversation,
        mcpServerViews: [view],
        enabled: true,
        source: "conversation",
        agentConfigurationId: null,
      }
    );
    expect(attached.isOk()).toBe(true);

    const skills = await SkillResource.listForAgentLoop(authenticator, {
      agentConfiguration: raw,
      conversation,
    });
    expect(skills).toEqual({
      effectiveSpaceIds: [],
      hasSelectedSpacesOutsideAgentScope: false,
      enabledSkills: [],
      systemSkills: [],
      equippedSkills: [],
      favoriteSkills: [],
    });
    const skillServers = await resolveSkillMCPServers(authenticator, {
      agentConfiguration: raw,
      conversation,
    });
    expect(skillServers).toEqual({ skillServers: [], systemSkillServers: [] });
    const jitServers = await getJITServers(authenticator, {
      agentConfiguration: raw,
      conversation,
      attachments: [],
    });
    expect(jitServers).toEqual([]);

    const { agentMessage } = await ConversationFactory.createAgentMessage(
      authenticator,
      { workspace, conversation, agentConfig: raw }
    );
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth: authenticator,
      workspace,
      conversation,
      content: "Hello",
      rank: 1,
    });
    const server = buildServerSideMCPServerConfiguration({
      mcpServerView: view,
    });
    const tools = await tryListMCPTools(
      authenticator,
      {
        agentConfiguration: raw,
        conversation,
        agentMessage,
        userMessage,
        clientSideActionConfigurations: [
          {
            id: -1,
            sId: "client-side-server",
            type: "mcp_server_configuration",
            name: "browser",
            description: "Browser tools",
            clientSideMcpServerId: "browser",
          },
        ],
      },
      {
        jitServers: [server],
        skillServers: [server],
        systemSkillServers: [server],
      }
    );
    expect(tools).toEqual([]);

    const prompt = constructPromptMultiActions(authenticator, {
      agentConfiguration: raw,
      userMessage,
      modelInfo: {
        endpoint: getTestStreamEndpoint("gpt-5"),
        temperature: raw.model.temperature,
      },
      conversation,
      hasAvailableActions: false,
      systemSkills: skills.systemSkills,
      projectContext: "Private Pod context",
      isNewFileExplorer: true,
      hasSandboxTools: true,
    });
    const promptText = systemPromptToText(prompt);
    expect(promptText).toContain("You do not have access to tools");
    expect(promptText).not.toContain("Private Pod context");
    expect(promptText).not.toContain("# TOOLS");
    expect(promptText).not.toContain("# FILES");
    expect(promptText).not.toContain("enable_skill");
  });
});
