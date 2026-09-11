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

describe("Dust Unplugged", () => {
  it("requires its feature flag for listing and direct fetches", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const listedBefore = await getGlobalAgents(
      authenticator,
      undefined,
      "light"
    );
    const fetchedBefore = await getGlobalAgents(authenticator, [
      GLOBAL_AGENTS_SID.DUST_UNPLUGGED,
    ]);
    expect(listedBefore.map((agent) => agent.sId)).not.toContain(
      GLOBAL_AGENTS_SID.DUST_UNPLUGGED
    );
    expect(fetchedBefore).toEqual([]);

    await FeatureFlagFactory.basic(authenticator, "dust_unplugged_agent");
    const listedAfter = await getGlobalAgents(
      authenticator,
      undefined,
      "light"
    );
    const fetchedAfter = await getGlobalAgents(authenticator, [
      GLOBAL_AGENTS_SID.DUST_UNPLUGGED,
    ]);
    expect(listedAfter.map((agent) => agent.sId)).toContain(
      GLOBAL_AGENTS_SID.DUST_UNPLUGGED
    );
    expect(fetchedAfter).toHaveLength(1);
  });

  it.each([
    "light",
    "full",
  ] as const)("uses Dust's model with no configured capabilities (%s)", async (variant) => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    await FeatureFlagFactory.basic(authenticator, "dust_unplugged_agent");
    const [dust, unplugged] = await getGlobalAgents(
      authenticator,
      [GLOBAL_AGENTS_SID.DUST, GLOBAL_AGENTS_SID.DUST_UNPLUGGED],
      variant
    );
    expect(unplugged.model).toEqual(dust.model);
    expect(unplugged).toMatchObject({
      sId: GLOBAL_AGENTS_SID.DUST_UNPLUGGED,
      name: "dust-unplugged",
      status: "active",
      actions: [],
      codeDefinedSkillIds: [],
      requestedSpaceIds: [],
      requestedGroupIds: [],
    });

    await upsertGlobalAgentSettings(authenticator, {
      agentId: GLOBAL_AGENTS_SID.DUST_UNPLUGGED,
      status: "disabled_by_admin",
    });
    const [disabled] = await getGlobalAgents(
      authenticator,
      [GLOBAL_AGENTS_SID.DUST_UNPLUGGED],
      variant
    );
    expect(disabled.status).toBe("disabled_by_admin");
    expect(disabled.actions).toEqual([]);
    expect(disabled.codeDefinedSkillIds).toEqual([]);
  });

  it("starts empty and allows explicitly added conversation tools and skills", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(authenticator, "dust_unplugged_agent");
    await FeatureFlagFactory.basic(authenticator, "user_memory");
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(authenticator);
    const [unplugged] = await getGlobalAgents(authenticator, [
      GLOBAL_AGENTS_SID.DUST_UNPLUGGED,
    ]);

    const autoViews =
      await MCPServerViewResource.getMCPServerViewsForAutoInternalToolsAsMap(
        authenticator,
        ["common_utilities"]
      );
    const view = autoViews.get("common_utilities");
    if (!view) {
      throw new Error("Expected common utilities server view.");
    }
    const pod = await SpaceFactory.project(workspace, user.id);
    const skill = await SkillFactory.create(authenticator, {
      name: "Pod skill",
      mcpServerViews: [view],
    });
    const metadata = await ProjectMetadataResource.makeNew(authenticator, pod, {
      description: "Private Pod context",
    });
    await metadata.setDefaultSkills([skill]);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: unplugged.sId,
      messagesCreatedAt: [],
      spaceId: pod.id,
    });
    const initialSkills = await SkillResource.listForAgentLoop(authenticator, {
      agentConfiguration: unplugged,
      conversation,
    });
    expect(initialSkills).toEqual({
      effectiveSpaceIds: [],
      hasSelectedSpacesOutsideAgentScope: false,
      enabledSkills: [],
      systemSkills: [],
      equippedSkills: [],
      favoriteSkills: [],
    });
    const initialJitServers = await getJITServers(authenticator, {
      agentConfiguration: unplugged,
      conversation,
      attachments: [],
    });
    expect(initialJitServers).toEqual([]);

    const enabled = await skill.upsertToConversation(authenticator, {
      conversationId: conversation.id,
      enabled: true,
    });
    expect(enabled.isOk()).toBe(true);

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
      agentConfiguration: unplugged,
      conversation,
    });
    expect(skills.enabledSkills.map((s) => s.sId)).toEqual([skill.sId]);
    expect(skills.systemSkills).toEqual([]);
    expect(skills.equippedSkills).toEqual([]);
    expect(skills.favoriteSkills).toEqual([]);
    const { skillServers, systemSkillServers } = await resolveSkillMCPServers(
      authenticator,
      { agentConfiguration: unplugged, conversation }
    );
    expect(skillServers).toEqual([
      expect.objectContaining({ mcpServerViewId: view.sId }),
    ]);
    expect(systemSkillServers).toEqual([]);
    const jitServers = await getJITServers(authenticator, {
      agentConfiguration: unplugged,
      conversation,
      attachments: [],
    });
    expect(jitServers).toEqual([
      expect.objectContaining({ mcpServerViewId: view.sId }),
    ]);

    const { agentMessage } = await ConversationFactory.createAgentMessage(
      authenticator,
      { workspace, conversation, agentConfig: unplugged }
    );
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth: authenticator,
      workspace,
      conversation,
      content: "Hello",
      rank: 1,
    });
    const tools = await tryListMCPTools(
      authenticator,
      {
        agentConfiguration: unplugged,
        conversation,
        agentMessage,
        userMessage,
        clientSideActionConfigurations: [],
      },
      {
        jitServers,
        skillServers,
        systemSkillServers,
      }
    );
    expect(tools.flatMap((s) => s.tools)).not.toHaveLength(0);

    const prompt = constructPromptMultiActions(authenticator, {
      agentConfiguration: unplugged,
      userMessage,
      modelInfo: {
        endpoint: getTestStreamEndpoint("gpt-5"),
        temperature: unplugged.model.temperature,
      },
      conversation,
      hasAvailableActions: false,
      systemSkills: skills.systemSkills,
      projectContext: "Private Pod context",
      isNewFileExplorer: true,
      hasSandboxTools: true,
    });
    const promptText = systemPromptToText(prompt);
    expect(promptText).toContain("You start without tools");
    expect(promptText).not.toContain("Private Pod context");
    expect(promptText).not.toContain("# TOOLS");
    expect(promptText).not.toContain("# FILES");
    expect(promptText).not.toContain("enable_skill");

    const promptWithTools = constructPromptMultiActions(authenticator, {
      agentConfiguration: unplugged,
      userMessage,
      modelInfo: {
        endpoint: getTestStreamEndpoint("gpt-5"),
        temperature: unplugged.model.temperature,
      },
      conversation,
      hasAvailableActions: true,
      serverToolsAndInstructions: tools,
      systemSkills: skills.systemSkills,
    });
    const promptWithToolsText = systemPromptToText(promptWithTools);
    expect(promptWithToolsText).toContain("# TOOLS");
    expect(promptWithToolsText).toContain(
      "Use only the capabilities explicitly provided in this conversation"
    );
  });
});
