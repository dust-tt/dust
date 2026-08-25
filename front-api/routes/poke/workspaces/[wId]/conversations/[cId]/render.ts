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
import { getStreamEndpointFromLegacyModelId } from "@app/lib/api/llm/selectPreferredEndpointForWorkspace";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { constructProjectContext } from "@app/lib/resources/skill/code_defined/global/projects";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { tokenCountForTexts } from "@app/lib/tokenization";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import { removeNulls } from "@app/types/shared/utils/general";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const RenderConversationBodySchema = z.object({
  agentId: z.string(),
  contextSizeOverride: z.number().positive().nullable().optional(),
  excludeActions: z.boolean().optional(),
  excludeImages: z.boolean().optional(),
  onMissingAction: z.enum(["inject-placeholder", "skip"]).optional(),
});

const ParamsSchema = z.object({
  cId: z.string(),
});

export type PostRenderConversationResponseBody = {
  tokensUsed: number;
  modelConversation: unknown;
  modelContextSizeUsed: number;
  modelIdUsed: string;
  promptTokenCountApprox: number;
  systemPrompt: string;
  toolsTokenCountApprox: number;
};

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/render.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", RenderConversationBodySchema),
  async (ctx): HandlerResult<PostRenderConversationResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");
    const {
      agentId,
      contextSizeOverride,
      excludeActions,
      excludeImages,
      onMissingAction,
    } = ctx.req.valid("json");

    const [conversationRes, agentConfiguration] = await Promise.all([
      // biome-ignore lint/plugin/noExpensiveConversationFetch: intentional full conversation load
      getConversation(auth, cId, true),
      getAgentConfiguration(auth, { agentId, variant: "full" }),
    ]);

    if (conversationRes.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: conversationRes.error.message,
        },
      });
    }
    const conversation: ConversationType = conversationRes.value;

    if (!agentConfiguration) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: `Agent configuration not found for sId ${agentId}.`,
        },
      });
    }

    // The agent's configured model can be a model stream (`auto`, `auto_fast`,
    // `auto_complex`): a sentinel that never names a concrete model and has no
    // endpoint of its own. The agent's last message in this conversation stores
    // the model it actually ran on, so use that when we have it.
    const lastAgentMessage = conversation.content
      .map((versions) => versions.at(-1))
      .filter((m): m is AgentMessageType => !!m && isAgentMessageType(m))
      .findLast((m) => m.configuration.sId === agentId);
    const modelConfiguration: AgentModelConfigurationType = {
      ...agentConfiguration.model,
      ...lastAgentMessage?.resolvedModel,
    };

    const endpoint = await getStreamEndpointFromLegacyModelId(
      auth,
      modelConfiguration.modelId
    );
    if (!endpoint) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Model ${modelConfiguration.modelId} is not supported for rendering.`,
        },
      });
    }
    const modelInfo = {
      endpoint,
      temperature: modelConfiguration.temperature,
      reasoningEffort: modelConfiguration.reasoningEffort,
      responseFormat: endpoint.modelConfig.supportsResponseFormat
        ? modelConfiguration.responseFormat
        : undefined,
    };
    const model = endpoint.modelConfig;

    const lastUserMessage = conversation.content
      .map((tuple) => tuple[0])
      .filter((m): m is UserMessageType => isUserMessageType(m))
      .at(-1);
    if (!lastUserMessage) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "No user message found in conversation content.",
        },
      });
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
      systemSkills,
      enabledSkills,
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
      modelInfo,
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

    const contextSize =
      typeof contextSizeOverride === "number" && contextSizeOverride > 0
        ? contextSizeOverride
        : model.contextSize;
    const allowedTokenCount = Math.max(
      0,
      contextSize - model.generationTokensCount
    );

    const convoRes = await renderConversationForModel(auth, {
      conversation,
      model,
      prompt,
      tools,
      allowedTokenCount,
      excludeActions,
      excludeImages,
      onMissingAction,
      agentConfiguration,
      leadingMessages,
      enabledSkills,
    });

    if (convoRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: convoRes.error.message,
        },
      });
    }

    const { modelConversation, tokensUsed } = convoRes.value;

    let promptTokenCountApprox = 0;
    let toolsTokenCountApprox = 0;
    const credentials = await getLlmCredentials(auth, {
      skipEmbeddingApiKeyRequirement: true,
    });
    const tokenCountsRes = await tokenCountForTexts(
      [prompt, tools],
      model,
      credentials
    );
    if (tokenCountsRes.isOk()) {
      [promptTokenCountApprox, toolsTokenCountApprox] = tokenCountsRes.value;
    }

    return ctx.json({
      tokensUsed,
      modelConversation,
      modelContextSizeUsed: contextSize,
      modelIdUsed: model.modelId,
      promptTokenCountApprox,
      systemPrompt: prompt,
      toolsTokenCountApprox,
    });
  }
);

export default app;
