import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { isSidekickConversation } from "@app/lib/api/actions/servers/helpers";
import { fetchPrecedingContentFragments } from "@app/lib/api/assistant/content_fragments";
import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { addSelectedConversationSpaces } from "@app/lib/api/assistant/conversation/selected_spaces";
import { fetchConversationMessages } from "@app/lib/api/assistant/messages";
import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import { getPaginationParams } from "@app/lib/api/pagination";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { extractUniqueSkillIds } from "@app/lib/skills/format";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getStatsDClient } from "@app/lib/utils/statsd";
import { InternalPostMessagesRequestBodySchema } from "@app/types/api/assistant";
import type { PostMessagesResponseBody } from "@app/types/api/assistant/messages";
import type {
  LegacyLightMessageType,
  LightMessageType,
} from "@app/types/assistant/conversation";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { apiErrorForSelectedSpaces } from "../selected_spaces_errors";
import message from "./[mId]";

const ParamsSchema = z.object({
  cId: z.string(),
});

// TODO remove after monday 2025-12-01 (once everyone has likely reloaded their browser)
interface LegacyFetchConversationMessagesResponse {
  hasMore: boolean;
  lastValue: number | null;
  messages: LegacyLightMessageType[];
}

export interface FetchConversationMessagesResponse {
  hasMore: boolean;
  lastValue: number | null;
  messages: LightMessageType[];
}

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/messages:
 *   get:
 *     summary: List messages in a conversation
 *     description: Retrieve a paginated list of messages for a specific conversation.
 *     tags:
 *       - Private Messages
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     oneOf:
 *                       - $ref: '#/components/schemas/PrivateUserMessage'
 *                       - $ref: '#/components/schemas/PrivateLightAgentMessage'
 *                       - $ref: '#/components/schemas/PrivateContentFragment'
 *                 hasMore:
 *                   type: boolean
 *                 lastValue:
 *                   type: integer
 *                   nullable: true
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Post a message to a conversation
 *     description: Post a new user message to an existing conversation, triggering agent responses.
 *     tags:
 *       - Private Messages
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *               - context
 *               - mentions
 *             properties:
 *               content:
 *                 type: string
 *               mentions:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/PrivateMention'
 *               context:
 *                 type: object
 *                 properties:
 *                   timezone:
 *                     type: string
 *                   profilePictureUrl:
 *                     type: string
 *                     nullable: true
 *                   origin:
 *                     type: string
 *                     nullable: true
 *                   clientSideMCPServerIds:
 *                     type: array
 *                     items:
 *                       type: string
 *                   selectedMCPServerViewIds:
 *                     type: array
 *                     items:
 *                       type: string
 *                   selectedSpaceIds:
 *                     type: array
 *                     items:
 *                       type: string
 *               skipToolsValidation:
 *                 type: boolean
 *               modelSelection:
 *                 type: object
 *                 description: Optional per-message model override from the input-bar model picker (an explicit model pick).
 *                 required: [providerId, modelId]
 *                 properties:
 *                   providerId:
 *                     type: string
 *                   modelId:
 *                     type: string
 *                   reasoningEffort:
 *                     type: string
 *     responses:
 *       200:
 *         description: Successfully posted message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   $ref: '#/components/schemas/PrivateUserMessage'
 *                 contentFragments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PrivateContentFragment'
 *                 agentMessages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PrivateAgentMessage'
 *       401:
 *         description: Unauthorized
 */

app.get(
  "/",
  validate("param", ParamsSchema),
  async (
    ctx
  ): HandlerResult<
    LegacyFetchConversationMessagesResponse | FetchConversationMessagesResponse
  > => {
    const auth = ctx.get("auth");
    const { cId: conversationId } = ctx.req.valid("param");

    const messageStartTime = performance.now();

    // getPaginationParams expects a Next-style query object; flatten Hono's
    // query map (single-valued strings are fine here).
    const queryObj = ctx.req.query();
    const paginationRes = getPaginationParams(queryObj, {
      defaultLimit: 10,
      defaultOrderColumn: "rank",
      defaultOrderDirection: "desc",
      supportedOrderColumn: ["rank"],
    });
    if (paginationRes.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 400,
          api_error: {
            type: "invalid_pagination_parameters",
            message: "Invalid pagination parameters",
          },
        },
        paginationRes.error
      );
    }

    const useNewResponseFormat = ctx.req.query("newResponseFormat") === "1";

    // Note that we don't use the order column and order direction here because
    // we enforce sorting by rank in descending order.
    const messagesRes = await fetchConversationMessages(auth, {
      conversationId,
      limit: paginationRes.value.limit,
      lastRank: paginationRes.value.lastValue,
      viewType: useNewResponseFormat ? "light" : "legacy-light",
    });

    if (messagesRes.isErr()) {
      return apiErrorForConversation(ctx, messagesRes.error);
    }

    const messageLatency = performance.now() - messageStartTime;

    getStatsDClient().distribution(
      "assistant.messages.fetch.latency",
      messageLatency
    );
    const rawSize = Buffer.byteLength(
      JSON.stringify(messagesRes.value),
      "utf8"
    );
    getStatsDClient().distribution(
      "assistant.messages.fetch.raw_size",
      rawSize
    );

    return ctx.json(messagesRes.value);
  }
);

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", InternalPostMessagesRequestBodySchema),
  async (ctx): HandlerResult<PostMessagesResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const { cId: conversationId } = ctx.req.valid("param");

    const { content, context, mentions, skipToolsValidation, modelSelection } =
      ctx.req.valid("json");

    if (context.clientSideMCPServerIds) {
      const hasServerAccess = await concurrentExecutor(
        context.clientSideMCPServerIds,
        async (serverId) => validateMCPServerAccess(auth, { serverId }),
        { concurrency: 10 }
      );

      if (hasServerAccess.some((r) => r === false)) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "invalid_request_error",
            message:
              "User does not have access to the client-side MCP servers.",
          },
        });
      }
    }

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    if (!conversationResource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found",
        },
      });
    }

    const conversation = conversationResource.toJSON();

    if (content.length === 0 && mentions.length === 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Message content cannot be empty unless at least one mention is provided.",
        },
      });
    }

    if (context.selectedSpaceIds?.length) {
      const selectedSpacesResult = await addSelectedConversationSpaces(auth, {
        conversation,
        spaceIds: context.selectedSpaceIds,
        origin: "input_bar",
        auditContext: getAuditLogContext(auth),
        // Widening the scope of an existing conversation is irreversible and can lock the other
        // participants out, so only its creator may do it.
        enforceCreatorOnly: true,
      });
      if (selectedSpacesResult.isErr()) {
        return apiErrorForSelectedSpaces(ctx, selectedSpacesResult.error);
      }
    }

    if (context.selectedMCPServerViewIds?.length) {
      const mcpServerViews = await MCPServerViewResource.fetchByIds(
        auth,
        context.selectedMCPServerViewIds,
        { isRestrictedToSkills: false }
      );

      const upsertRes = await ConversationResource.upsertMCPServerViews(auth, {
        conversation,
        mcpServerViews,
        enabled: true,
        source: "conversation",
        agentConfigurationId: null,
      });
      if (upsertRes.isErr()) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to add MCP server views to conversation",
          },
        });
      }
    }

    const selectedSkillIds = extractUniqueSkillIds(content);
    if (selectedSkillIds.length > 0) {
      const skills = await SkillResource.fetchByIds(auth, selectedSkillIds);

      const r = await SkillResource.upsertConversationSkills(auth, {
        conversation,
        skills,
        enabled: true,
      });

      if (r.isErr()) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to add skills to conversation",
          },
        });
      }
    }

    // Sidekick conversations always use "agent_sidekick" origin regardless of
    // what the client sends (follow-up messages default to "web" because
    // useClientType() doesn't know about sidekick context).
    const origin = isSidekickConversation(conversation.metadata)
      ? "agent_sidekick"
      : (context.origin ?? "web");

    const messageRes = await postUserMessage(auth, {
      conversationResource,
      content,
      mentions,
      context: {
        timezone: context.timezone,
        username: user.username,
        fullName: user.fullName(),
        email: user.email,
        profilePictureUrl: context.profilePictureUrl ?? user.imageUrl,
        origin,
        clientSideMCPServerIds: context.clientSideMCPServerIds ?? [],
        selectedSpaceIds: context.selectedSpaceIds ?? [],
      },
      skipToolsValidation: skipToolsValidation ?? false,
      modelSelection,
    });

    if (messageRes.isErr()) {
      return apiError(ctx, messageRes.error);
    }

    const contentFragments = await fetchPrecedingContentFragments(auth, {
      conversationResource,
      targetRank: messageRes.value.userMessage.rank,
    });

    return ctx.json({
      message: messageRes.value.userMessage,
      contentFragments,
      agentMessages: messageRes.value.agentMessages,
    });
  }
);

app.route("/:mId", message);

export default app;
