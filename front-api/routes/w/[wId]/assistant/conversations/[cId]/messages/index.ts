import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { isSidekickConversation } from "@app/lib/api/actions/servers/helpers";
import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { fetchConversationMessages } from "@app/lib/api/assistant/messages";
import { getPaginationParams } from "@app/lib/api/pagination";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { extractUniqueSkillIds } from "@app/lib/skills/format";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getStatsDClient } from "@app/lib/utils/statsd";
import { InternalPostMessagesRequestBodySchema } from "@app/types/api/internal/assistant";
import type {
  AgentMessageType,
  LegacyLightMessageType,
  LightMessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isContentFragmentType } from "@app/types/content_fragment";
import { removeNulls } from "@app/types/shared/utils/general";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

import message from "./[mId]";

export type PostMessagesResponseBody = {
  message: UserMessageType;
  contentFragments: ContentFragmentType[];
  agentMessages: AgentMessageType[];
};

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
const app = new Hono();

app.get(
  "/",
  async (
    ctx
  ): HandlerResult<
    LegacyFetchConversationMessagesResponse | FetchConversationMessagesResponse
  > => {
    const auth = ctx.get("auth");
    const conversationId = ctx.req.param("cId") ?? "";

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
  validate("json", InternalPostMessagesRequestBodySchema),
  async (ctx): HandlerResult<PostMessagesResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const conversationId = ctx.req.param("cId") ?? "";

    const { content, context, mentions, skipToolsValidation } =
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

    const conversationRes = await getConversation(auth, conversationId);

    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

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

    const conversation = conversationRes.value;

    const selectedSkillIds = extractUniqueSkillIds(content);
    if (selectedSkillIds.length > 0) {
      const skills = await SkillResource.fetchByIds(auth, selectedSkillIds);

      const r = await SkillResource.upsertConversationSkills(auth, {
        conversationId: conversation.id,
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

    // Find all the contentFragments that are above the user message.
    // Messages may have multiple versions, so we need to return only the max
    // version of each message.
    const allMessages = removeNulls(
      [...conversation.content].map((messages) => {
        if (messages.length === 0) {
          return null;
        }
        return messages.toSorted((a, b) => b.version - a.version)[0];
      })
    );

    // Iterate over all messages sorted by rank descending and collect content
    // fragments until we find a user message.
    const contentFragments: ContentFragmentType[] = [];
    for (const message of allMessages.toSorted((a, b) => b.rank - a.rank)) {
      if (isUserMessageType(message)) {
        break;
      }
      if (isContentFragmentType(message)) {
        contentFragments.push(message);
      }
    }

    // Derive origin: use explicitly provided origin, fall back to conversation
    // metadata, then default to "web".
    const origin =
      context.origin ??
      (isSidekickConversation(conversation.metadata)
        ? "agent_sidekick"
        : "web");

    const messageRes = await postUserMessage(auth, {
      conversation,
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
      },
      skipToolsValidation: skipToolsValidation ?? false,
    });

    if (messageRes.isErr()) {
      return apiError(ctx, messageRes.error);
    }

    return ctx.json({
      message: messageRes.value.userMessage,
      contentFragments,
      agentMessages: messageRes.value.agentMessages,
    });
  }
);

app.route("/:mId", message);

export default app;
