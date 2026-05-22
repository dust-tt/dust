import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import {
  createConversation,
  postNewContentFragment,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getPaginationParams } from "@app/lib/api/pagination";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { extractUniqueSkillIds } from "@app/lib/skills/format";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { InternalPostConversationsRequestBodySchema } from "@app/types/api/internal/assistant";
import type {
  ConversationListItemType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { ConversationError } from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";

import conversation from "./[cId]";
import bulkActions from "./bulk-actions";
import search from "./search";
import semanticSearch from "./semantic_search";
import sendOnboarding from "./send-onboarding";
import spaces from "./spaces";

export type GetConversationsResponseBody = {
  conversations: ConversationListItemType[];
  hasMore: boolean;
  lastValue: string | null;
};

export type PostConversationsResponseBody = {
  conversation: ConversationType;
  message?: UserMessageType;
  contentFragments: ContentFragmentType[];
};

// Normalize spaceId: undefined -> null for backward compatibility (users who
// haven't refreshed their browser may send undefined). Applied via preprocess
// so the schema can stay `.nullable()` rather than `.nullish()`.
const PostConversationsBodySchema = z.preprocess((val) => {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    if (obj.spaceId === undefined) {
      return { ...obj, spaceId: null };
    }
  }
  return val;
}, InternalPostConversationsRequestBodySchema);

function isConversationNotFoundError(err: unknown): err is ConversationError {
  return (
    err instanceof ConversationError && err.type === "conversation_not_found"
  );
}

// Mounted under /api/w/:wId/assistant/conversations.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetConversationsResponseBody> => {
  const auth = ctx.get("auth");

  // getPaginationParams expects a Next-style query object; flatten Hono's
  // query map (single-valued strings are fine here).
  const paginationRes = getPaginationParams(ctx.req.query(), {
    defaultLimit: 100,
    defaultOrderColumn: "updatedAt",
    defaultOrderDirection: "desc",
    supportedOrderColumn: ["updatedAt"],
  });

  if (paginationRes.isErr()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: paginationRes.error.reason,
      },
    });
  }

  const pagination = paginationRes.value;

  const result =
    await ConversationResource.listPrivateConversationsForUserPaginatedFromES(
      auth,
      {
        limit: pagination.limit,
        lastValue: pagination.lastValue,
        orderDirection: pagination.orderDirection,
      }
    );

  return ctx.json({
    conversations: result.conversations,
    hasMore: result.hasMore,
    lastValue: result.lastValue,
  });
});

app.post(
  "/",
  validate("json", PostConversationsBodySchema),
  async (ctx): HandlerResult<PostConversationsResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();

    const {
      title,
      visibility,
      spaceId,
      message,
      contentFragments,
      metadata,
      skipToolsValidation,
    } = ctx.req.valid("json");

    if (message?.context.clientSideMCPServerIds) {
      const hasServerAccess = await concurrentExecutor(
        message.context.clientSideMCPServerIds,
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

    // Validate spaceId if provided and convert to model ID
    let spaceModelId: number | null = null;
    if (spaceId) {
      const space = await SpaceResource.fetchById(auth, spaceId);
      if (!space || !space.canReadOrAdministrate(auth)) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "space_not_found",
            message: "Space not found or access denied",
          },
        });
      }
      spaceModelId = space.id;
    }

    let newConversation = await createConversation(auth, {
      title,
      visibility,
      spaceId: spaceModelId,
      metadata,
    });

    if (newConversation.depth === 0) {
      await ConversationResource.upsertParticipation(auth, {
        conversation: newConversation,
        action: "subscribed",
        user: user.toJSON(),
      });
    }

    const newContentFragments: ContentFragmentType[] = [];
    let newMessage: UserMessageType | null = null;

    const baseContext = {
      username: user.username,
      fullName: user.fullName(),
      email: user.email,
    };

    if (contentFragments.length > 0) {
      const newContentFragmentsRes = await concurrentExecutor(
        contentFragments,
        async (contentFragment) =>
          postNewContentFragment(auth, newConversation, contentFragment, {
            ...baseContext,
            profilePictureUrl: contentFragment.context.profilePictureUrl,
          }),
        { concurrency: 4 }
      );

      for (const r of newContentFragmentsRes) {
        if (r.isErr()) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: r.error.message,
            },
          });
        }

        newContentFragments.push(r.value);
      }

      newConversation = {
        ...newConversation,
        content: [
          ...newConversation.content,
          ...newContentFragments.map((contentFragment) => [contentFragment]),
        ],
      };
    }

    if (message) {
      // If tools are enabled, we need to add the MCP server views to the
      // conversation before posting the message.
      if (message.context.selectedMCPServerViewIds) {
        const mcpServerViews = await MCPServerViewResource.fetchByIds(
          auth,
          message.context.selectedMCPServerViewIds
        );

        const r = await ConversationResource.upsertMCPServerViews(auth, {
          conversation: newConversation,
          mcpServerViews,
          enabled: true,
          source: "conversation",
          agentConfigurationId: null,
        });
        if (r.isErr()) {
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to add MCP server views to conversation",
            },
          });
        }
      }

      const inlineSelectedSkillIds = extractUniqueSkillIds(message.content);
      // TODO(2026-05-04 aubin): Remove this fallback once all clients submit
      // inline <skill ... /> tags instead of the legacy selectedSkillIds field.
      const selectedSkillIds =
        inlineSelectedSkillIds.length > 0
          ? inlineSelectedSkillIds
          : (message.context.selectedSkillIds ?? []);
      if (selectedSkillIds.length > 0) {
        const skills = await SkillResource.fetchByIds(auth, selectedSkillIds);

        const r = await SkillResource.upsertConversationSkills(auth, {
          conversationId: newConversation.id,
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

      if (message.content.length === 0 && message.mentions.length === 0) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Message content cannot be empty unless at least one mention is provided.",
          },
        });
      }

      // If a message was provided we do await for the message to be created
      // before returning the conversation along with the message.
      const messageRes = await postUserMessage(auth, {
        conversation: newConversation,
        content: message.content,
        mentions: message.mentions,
        context: {
          timezone: message.context.timezone,
          username: user.username,
          fullName: user.fullName(),
          email: user.email,
          profilePictureUrl: message.context.profilePictureUrl,
          origin: message.context.origin ?? "web",
          clientSideMCPServerIds: message.context.clientSideMCPServerIds ?? [],
        },
        skipToolsValidation: skipToolsValidation ?? false,
      });
      if (messageRes.isErr()) {
        return apiError(ctx, messageRes.error);
      }

      newMessage = messageRes.value.userMessage;
    }

    if (newContentFragments.length > 0 || newMessage) {
      // If we created a user message or a content fragment (or both) we
      // retrieve the conversation. If a user message was posted, we know that
      // the agent messages have been created as well, so pulling the
      // conversation again will allow to have an up to date view of the
      // conversation with agent messages included so that the user of the API
      // can start streaming events from these agent messages directly.
      const updatedRes = await getConversation(auth, newConversation.sId);

      if (updatedRes.isOk()) {
        newConversation = updatedRes.value;
      } else if (!isConversationNotFoundError(updatedRes.error)) {
        return apiErrorForConversation(ctx, updatedRes.error);
      }
    }

    return ctx.json({
      conversation: newConversation,
      message: newMessage ?? undefined,
      contentFragments: newContentFragments,
    });
  }
);

// Register static paths BEFORE `/:cId` so the param route does not swallow
// these names as conversation ids.
app.route("/bulk-actions", bulkActions);
app.route("/search", search);
app.route("/semantic_search", semanticSearch);
app.route("/send-onboarding", sendOnboarding);
app.route("/spaces", spaces);
app.route("/:cId", conversation);

export default app;
