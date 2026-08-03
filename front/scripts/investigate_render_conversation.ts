import { buildToolSpecification } from "@app/lib/actions/mcp";
import { tryListMCPTools } from "@app/lib/actions/mcp_actions";
import { createClientSideMCPServerConfigurations } from "@app/lib/api/actions/mcp_client_side";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { getSkillServers } from "@app/lib/api/assistant/skill_actions";
import {
  renderEquippedSkillsUserMessage,
  renderFavoriteSkillsUserMessage,
} from "@app/lib/api/assistant/skills_rendering";
import { legacyModelIdToModel } from "@app/lib/api/llm";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import { Authenticator } from "@app/lib/auth";
import { getStreamEndpoints } from "@app/lib/llms/stream";
import { constructProjectContext } from "@app/lib/resources/skill/code_defined/global/projects";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { makeScript } from "@app/scripts/helpers";
import type {
  AgentMessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { isUserMessageType } from "@app/types/assistant/conversation";
import { removeNulls } from "@app/types/shared/utils/general";

makeScript(
  {
    workspaceId: {
      type: "string",
      alias: "w",
      description: "Workspace sId",
      required: true,
    },
    conversationId: {
      type: "string",
      alias: "c",
      description: "Conversation sId",
      required: true,
    },
    agentId: {
      type: "string",
      alias: "a",
      description: "Agent sId used to build prompt/tools/skills",
      required: true,
    },
    allowedTokenCount: {
      type: "number",
      alias: "t",
      description: "Allowed token count override",
      required: false,
    },
  },
  async (
    { workspaceId, conversationId, agentId, allowedTokenCount },
    logger
  ) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    const [conversationRes, agentConfiguration] = await Promise.all([
      // biome-ignore lint/plugin/noExpensiveConversationFetch: intentional full conversation load
      getConversation(auth, conversationId, true),
      getAgentConfiguration(auth, { agentId, variant: "full" }),
    ]);

    if (conversationRes.isErr()) {
      logger.error(
        { error: conversationRes.error.message },
        "Failed to fetch conversation"
      );
      return;
    }
    const conversation = conversationRes.value;

    if (!agentConfiguration) {
      logger.error({ agentId }, "Agent configuration not found");
      return;
    }

    // Script-only: no workspace routing needed, so pass permissive filters and
    // just select any endpoint for the agent's model.
    const routerModel = legacyModelIdToModel(agentConfiguration.model.modelId);
    const endpoint = routerModel
      ? getStreamEndpoints(
          { featureFlags: [], isEnterprise: true, isCreditPriced: false },
          { model: { eq: routerModel } }
        )[0]
      : undefined;
    if (!endpoint) {
      logger.error(
        { modelId: agentConfiguration.model.modelId },
        "Unsupported model"
      );
      return;
    }
    const model = endpoint.modelConfig;

    const lastUserMessage = conversation.content
      .map((tuple) => tuple[0])
      .filter((m): m is UserMessageType => isUserMessageType(m))
      .at(-1);
    if (!lastUserMessage) {
      logger.error("No user message found in conversation");
      return;
    }
    const userMessage: UserMessageType = lastUserMessage;

    const attachments = await listAttachments(auth, { conversation });
    const jitServers = await getJITServers(auth, {
      agentConfiguration,
      conversation,
      attachments,
    });

    const {
      effectiveSpaceIds,
      enabledSkills,
      systemSkills,
      equippedSkills,
      favoriteSkills,
      hasSelectedSpacesOutsideAgentScope,
    } = await SkillResource.listForAgentLoop(auth, {
      agentConfiguration,
      conversation,
    });

    const { skillServers, systemSkillServers } = await getSkillServers(auth, {
      effectiveSpaceIds,
      enabledSkills,
      systemSkills,
    });

    const clientSideMCPActionConfigurations =
      await createClientSideMCPServerConfigurations(
        auth,
        userMessage.context.clientSideMCPServerIds
      );

    const placeholderAgentMessage: AgentMessageType = {
      type: "agent_message",
      sId: generateRandomModelSId("msg"),
      version: 0,
      rank: 0,
      branchId: null,
      created: Date.now(),
      completedTs: null,
      parentMessageId: userMessage.sId,
      parentAgentMessageId: null,
      status: "created",
      content: null,
      chainOfThought: null,
      error: null,
      id: -1,
      agentMessageId: -1,
      visibility: "visible",
      configuration: agentConfiguration,
      skipToolsValidation: false,
      actions: [],
      contents: [],
      modelInteractionDurationMs: null,
      completionDurationMs: null,
      richMentions: [],
      reactions: [],
      costCredits: null,
      resolvedModel: null,
      modelResolutionMethod: null,
    };

    const serverToolsAndInstructions = await tryListMCPTools(
      auth,
      {
        agentConfiguration,
        conversation,
        agentMessage: placeholderAgentMessage,
        userMessage,
        clientSideActionConfigurations: clientSideMCPActionConfigurations,
      },
      { jitServers, skillServers, systemSkillServers }
    );

    const availableActions = serverToolsAndInstructions.flatMap((s) => s.tools);

    let fallbackPrompt = "You are a conversational agent";
    if (agentConfiguration.actions.length || availableActions.length > 0) {
      fallbackPrompt += " with access to tool use.";
    } else {
      fallbackPrompt += ".";
    }

    const projectContext = await constructProjectContext(auth, {
      conversation,
    });

    const isNewFileExplorer = conversation.metadata?.useFileSystem === true;

    const promptSections = constructPromptMultiActions(auth, {
      userMessage,
      agentConfiguration,
      fallbackPrompt,
      modelInfo: {
        endpoint,
        ...agentConfiguration.model,
      },
      hasAvailableActions: availableActions.length > 0,
      conversation,
      serverToolsAndInstructions,
      systemSkills,
      projectContext,
      isNewFileExplorer,
      hasSelectedSpacesOutsideAgentScope,
    });
    const prompt = systemPromptToText(promptSections);
    const leadingMessages = removeNulls([
      renderEquippedSkillsUserMessage(equippedSkills),
      renderFavoriteSkillsUserMessage(favoriteSkills),
    ]);

    const specifications = availableActions.map((t) =>
      buildToolSpecification(t)
    );
    const tools = JSON.stringify(
      specifications.map((s) => ({
        name: s.name,
        description: s.description,
        inputSchema: s.inputSchema,
      }))
    );

    allowedTokenCount = allowedTokenCount
      ? allowedTokenCount
      : Math.max(0, model.contextSize - model.generationTokensCount);

    const convoRes = await renderConversationForModel(auth, {
      conversation,
      model,
      prompt,
      tools,
      allowedTokenCount,
      agentConfiguration,
      leadingMessages,
      enabledSkills,
    });

    if (convoRes.isErr()) {
      logger.error(
        { error: convoRes.error.message },
        "renderConversationForModel failed"
      );
      return;
    }

    const { modelConversation, tokensUsed, prunedContext } = convoRes.value;

    console.log("----------------------------------------------------------");
    console.log(prompt);
    console.log("----------------------------------------------------------");
    console.log(JSON.stringify(JSON.parse(tools), null, 2));
    console.log("----------------------------------------------------------");
    console.log(JSON.stringify(modelConversation, null, 2));
    console.log("----------------------------------------------------------");
    console.log({
      model: model.modelId,
      allowedTokenCount,
      tokensUsed,
      prunedContext,
    });
  }
);
