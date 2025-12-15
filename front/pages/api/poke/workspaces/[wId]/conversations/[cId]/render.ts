import type { NextApiRequest, NextApiResponse } from "next";

import { fetchSkillMCPServerConfigurations } from "@app/lib/actions/configuration/mcp";
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
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { getSupportedModelConfig } from "@app/lib/assistant";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { apiError } from "@app/logger/withlogging";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
  WithAPIErrorResponse,
} from "@app/types";
import { isString, isUserMessageType } from "@app/types";

export type PostRenderConversationRequestBody = {
  agentId: string;
  contextSizeOverride?: number | null;
  excludeActions?: boolean;
  excludeImages?: boolean;
  onMissingAction?: "inject-placeholder" | "skip";
};

export type PostRenderConversationResponseBody = {
  tokensUsed: number;
  modelConversation: unknown;
  modelContextSizeUsed: number;
  promptTokenCountApprox: number;
  toolsTokenCountApprox: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostRenderConversationResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const { wId, cId } = req.query;
  if (!isString(wId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid workspace id.",
      },
    });
  }
  if (!isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid conversation id.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const {
        agentId,
        contextSizeOverride,
        excludeActions,
        excludeImages,
        onMissingAction,
      } = req.body as PostRenderConversationRequestBody;

      if (!isString(agentId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects { agentId: string }.",
          },
        });
      }

      const conversationRes = await getConversation(auth, cId, true);
      if (conversationRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: conversationRes.error.message,
          },
        });
      }
      const conversation: ConversationType = conversationRes.value;

      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId,
        variant: "full",
      });
      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: `Agent configuration not found for sId ${agentId}.`,
          },
        });
      }

      const model = getSupportedModelConfig(agentConfiguration.model);
      if (!model) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Model ${agentConfiguration.model.modelId} is not supported for rendering.`,
          },
        });
      }

      // Grab the last user message for prompt construction.
      const lastUserMessage = conversation.content
        .map((tuple) => tuple[0])
        .filter((m): m is UserMessageType => isUserMessageType(m))
        .at(-1);
      if (!lastUserMessage) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "No user message found in conversation content.",
          },
        });
      }
      const userMessage: UserMessageType = lastUserMessage;

      // Build tools list and prompt similar to the agent loop.
      const attachments = listAttachments(conversation);
      const jitServers = await getJITServers(auth, {
        agentConfiguration,
        conversation,
        attachments,
      });

      const { enabledSkills, equippedSkills } =
        await SkillResource.listForConversation(auth, {
          agentConfiguration,
          conversation,
        });

      // Fetch MCP server configurations from enabled skills.
      const skillServers = await fetchSkillMCPServerConfigurations(
        auth,
        enabledSkills
      );

      const clientSideMCPActionConfigurations =
        await createClientSideMCPServerConfigurations(
          auth,
          userMessage.context.clientSideMCPServerIds
        );

      // Create a placeholder agent message id to satisfy the listing context.
      const placeholderAgentMessage: AgentMessageType = {
        // BaseAgentMessageType
        type: "agent_message",
        sId: generateRandomModelSId("msg"),
        version: 0,
        rank: 0,
        created: Date.now(),
        completedTs: null,
        parentMessageId: userMessage.sId,
        parentAgentMessageId: null,
        status: "created",
        content: null,
        chainOfThought: null,
        error: null,
        // AgentMessageType specifics
        id: -1,
        agentMessageId: -1,
        visibility: "visible",
        configuration: agentConfiguration,
        skipToolsValidation: false,
        actions: [],
        rawContents: [],
        contents: [],
        parsedContents: {},
        modelInteractionDurationMs: null,
        richMentions: [],
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
          {
            jitServers,
            skillServers,
          }
        );

      const availableActions = serverToolsAndInstructions.flatMap(
        (s) => s.tools
      );

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

      const featureFlags = await getFeatureFlags(
        auth.getNonNullableWorkspace()
      );

      const prompt = constructPromptMultiActions(auth, {
        userMessage,
        agentConfiguration,
        fallbackPrompt,
        model,
        hasAvailableActions: availableActions.length > 0,
        errorContext: mcpToolsListingError,
        agentsList,
        conversationId: conversation.sId,
        serverToolsAndInstructions,
        enabledSkills,
        equippedSkills,
        featureFlags,
      });

      // Build tool specifications to estimate tokens for tool definitions (names + schemas only).
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

      // Compute the allowed token count. Respect override if provided.
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
      });

      if (convoRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: convoRes.error.message,
          },
        });
      }

      const { modelConversation, tokensUsed } = convoRes.value;

      // Compute approximate prompt and tools token counts.
      let promptTokenCountApprox = 0;
      let toolsTokenCountApprox = 0;
      const tokenCountsRes = await tokenCountForTexts([prompt, tools], model);
      if (tokenCountsRes.isOk()) {
        [promptTokenCountApprox, toolsTokenCountApprox] = tokenCountsRes.value;
      }

      return res.status(200).json({
        tokensUsed,
        modelConversation,
        modelContextSizeUsed: contextSize,
        promptTokenCountApprox,
        toolsTokenCountApprox,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
