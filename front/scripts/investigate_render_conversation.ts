import { buildToolSpecification } from "@app/lib/actions/mcp";
import { tryListMCPTools } from "@app/lib/actions/mcp_actions";
import { createClientSideMCPServerConfigurations } from "@app/lib/api/actions/mcp_client_side";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { getSkillServers } from "@app/lib/api/assistant/skill_actions";
import { renderEquippedSkillsUserMessage } from "@app/lib/api/assistant/skills_rendering";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { constructProjectContext } from "@app/lib/resources/skill/code_defined/projects";
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

    const model = getSupportedModelConfig(agentConfiguration.model);
    if (!model) {
      logger.error(
        { modelId: agentConfiguration.model.modelId },
        "Unsupported model"
      );
      return;
    }

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
    const { servers: jitServers } = await getJITServers(auth, {
      agentConfiguration,
      conversation,
      attachments,
    });

    const { enabledSkills, systemSkills, equippedSkills } =
      await SkillResource.listForAgentLoop(auth, {
        agentConfiguration,
        conversation,
      });

    const skillServers = await getSkillServers(auth, {
      agentConfiguration,
      skills: [...systemSkills, ...enabledSkills],
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
    };

    const { serverToolsAndInstructions, error: mcpToolsListingError } =
      await tryListMCPTools(
        auth,
        {
          agentConfiguration,
          conversation,
          agentMessage: placeholderAgentMessage,
          clientSideActionConfigurations: clientSideMCPActionConfigurations,
        },
        { jitServers, skillServers }
      );

    const availableActions = serverToolsAndInstructions.flatMap((s) => s.tools);

    let fallbackPrompt = "You are a conversational agent";
    if (agentConfiguration.actions.length || availableActions.length > 0) {
      fallbackPrompt += " with access to tool use.";
    } else {
      fallbackPrompt += ".";
    }

    const agentsList = agentConfiguration.instructions?.includes(
      "{ASSISTANTS_LIST}"
    )
      ? await getAgentConfigurationsForView({
          auth,
          agentsGetView: auth.user() ? "list" : "all",
          variant: "light",
        })
      : null;

    const projectContext = await constructProjectContext(auth, {
      conversation,
    });

    const isNewFileExplorer = conversation.metadata?.useFileSystem === true;

    const promptSections = constructPromptMultiActions(auth, {
      userMessage,
      agentConfiguration,
      fallbackPrompt,
      model,
      hasAvailableActions: availableActions.length > 0,
      errorContext: mcpToolsListingError,
      agentsList,
      conversation,
      serverToolsAndInstructions,
      enabledSkills,
      systemSkills,
      equippedSkills,
      renderSkillsAsUserMessages: true,
      projectContext,
      isNewFileExplorer,
    });
    const prompt = systemPromptToText(promptSections);
    const leadingMessages = removeNulls([
      renderEquippedSkillsUserMessage(equippedSkills),
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
      renderSkillsAsUserMessages: true,
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
