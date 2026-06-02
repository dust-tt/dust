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
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { hasFeatureFlag } from "@app/lib/auth";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { constructProjectContext } from "@app/lib/resources/skill/code_defined/projects";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { tokenCountForTexts } from "@app/lib/tokenization";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { isUserMessageType } from "@app/types/assistant/conversation";
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
  promptTokenCountApprox: number;
  toolsTokenCountApprox: number;
};

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/render.
const app = pokeApp();

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

    const model = getSupportedModelConfig(agentConfiguration.model);
    if (!model) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Model ${agentConfiguration.model.modelId} is not supported for rendering.`,
        },
      });
    }

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
    const hasNestedSkills = await hasFeatureFlag(auth, "nested_skills");
    const useFramesV2 = await hasFeatureFlag(auth, "frames_skill_v2");

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
      projectContext,
      isNewFileExplorer,
      hasNestedSkills,
      useFramesV2,
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
      useFramesV2,
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
      promptTokenCountApprox,
      toolsTokenCountApprox,
    });
  }
);

export default app;
