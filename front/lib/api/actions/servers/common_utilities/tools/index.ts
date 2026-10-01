import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import {
  COMMON_UTILITIES_TOOLS_METADATA,
  MARK_CONVERSATION_READ_TOOL_NAME,
  SET_CONVERSATION_TITLE_TOOL_NAME,
} from "@app/lib/api/actions/servers/common_utilities/metadata";
import { clearActionRequiredIfNoBlockedActions } from "@app/lib/api/assistant/conversation/blocked_actions";
import { updateConversationTitle } from "@app/lib/api/assistant/conversation/title";
import { formatDateTime } from "@app/lib/i18n/format";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { compile } from "mathjs";

const RANDOM_INTEGER_DEFAULT_MAX = 1_000_000;

const handlers: ToolHandlers<typeof COMMON_UTILITIES_TOOLS_METADATA> = {
  generate_random_number: async ({ max }, _extra) => {
    const upperBound = max ?? RANDOM_INTEGER_DEFAULT_MAX;
    const value = Math.floor(Math.random() * upperBound) + 1;

    return new Ok([
      {
        type: "text",
        text: `Random number (1-${upperBound}): ${value}`,
      },
    ]);
  },

  generate_random_float: async (_params, _extra) => {
    const value = Math.random();

    return new Ok([
      {
        type: "text",
        text: `Random float: ${value}`,
      },
    ]);
  },

  wait: async ({ duration_ms }, _extra) => {
    await setTimeoutAsync(duration_ms);

    return new Ok([
      {
        type: "text",
        text: `Waited for ${duration_ms} milliseconds.`,
      },
    ]);
  },

  get_current_time: async ({ include_formats }, _extra) => {
    const now = new Date();
    const formats = new Set(
      include_formats ?? ["iso", "utc", "timestamp", "locale"]
    );

    const parts: string[] = [];
    if (formats.has("iso")) {
      parts.push(`ISO: ${now.toISOString()}`);
    }
    if (formats.has("utc")) {
      parts.push(`UTC: ${now.toUTCString()}`);
    }
    if (formats.has("timestamp")) {
      parts.push(`UNIX (ms): ${now.getTime()}`);
    }
    if (formats.has("locale")) {
      const dayOfWeek = now.toLocaleDateString("en-US", {
        weekday: "long",
      });
      parts.push(`Locale: ${formatDateTime(now)} (${dayOfWeek})`);
    }

    return new Ok([
      {
        type: "text",
        text: parts.join("\n"),
      },
    ]);
  },

  math_operation: async ({ expression }, _extra) => {
    const evalFunction = compile(expression);
    try {
      const result = evalFunction.evaluate();
      return new Ok([
        {
          type: "text",
          text: result.toString(),
        },
      ]);
    } catch (e) {
      const cause = normalizeError(e);
      return new Err(
        new MCPError(`Error evaluating math expression: ${cause.message}`, {
          cause,
        })
      );
    }
  },

  [SET_CONVERSATION_TITLE_TOOL_NAME]: async (
    { title },
    { auth, runContext }
  ) => {
    const conversation = isAgentLoopRunContext(runContext)
      ? runContext.conversation
      : null;

    if (!conversation) {
      return new Err(
        new MCPError(
          "No conversation context available. This tool can only be used within a conversation."
        )
      );
    }

    const result = await updateConversationTitle(auth, {
      conversationId: conversation.sId,
      title,
    });

    if (result.isErr()) {
      return new Err(
        new MCPError(
          `Failed to update conversation title: ${result.error.message}`
        )
      );
    }

    return new Ok([
      {
        type: "text",
        text: `Conversation title updated to "${title}".`,
      },
    ]);
  },

  [MARK_CONVERSATION_READ_TOOL_NAME]: async (
    { read, conversationId: conversationIdParam },
    { auth, runContext }
  ) => {
    const currentConversationId = isAgentLoopRunContext(runContext)
      ? runContext.conversation.sId
      : null;
    const conversationId = conversationIdParam ?? currentConversationId;

    if (!conversationId) {
      return new Err(
        new MCPError(
          "No conversationId provided and no conversation in agent context; pass conversationId explicitly.",
          { tracked: false }
        )
      );
    }

    const conversationRes =
      // biome-ignore lint/plugin/noExpensiveConversationFetch: need unread + actionRequired
      await ConversationResource.fetchConversationWithParticipantState(
        auth,
        conversationId
      );
    if (conversationRes.isErr()) {
      return new Err(
        new MCPError(`Conversation not found: ${conversationId}`, {
          tracked: false,
        })
      );
    }

    const conversation = conversationRes.value;

    if (read) {
      // Mirror the PATCH conversation API: skip the write when already read
      // so future-dated lastReadAt stamps are preserved.
      if (conversation.unread) {
        const markRes = await ConversationResource.markAsReadForAuthUser(auth, {
          conversation,
          lastReadAt:
            // 1 minute from now for now as the agent is currently acting in the conversation
            currentConversationId === conversationId
              ? new Date(Date.now() + 60 * 1000)
              : undefined,
        });
        if (markRes.isErr()) {
          return new Err(
            new MCPError(markRes.error.message, { tracked: false })
          );
        }
      }

      if (conversation.actionRequired) {
        await clearActionRequiredIfNoBlockedActions(auth, {
          conversationId: conversation.sId,
        });
      }
    } else {
      const markRes = await ConversationResource.markAsUnreadForAuthUser(auth, {
        conversation,
      });
      if (markRes.isErr()) {
        return new Err(new MCPError(markRes.error.message, { tracked: false }));
      }
    }

    return new Ok([
      {
        type: "text",
        text: read
          ? `Conversation ${conversation.sId} marked as read.`
          : `Conversation ${conversation.sId} marked as unread.`,
      },
    ]);
  },
};

export const TOOLS = buildTools(COMMON_UTILITIES_TOOLS_METADATA, handlers);
