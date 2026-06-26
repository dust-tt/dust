import { isRunAgentQueryProgressOutput } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ActionGeneratedDBFileType } from "@app/lib/actions/types";
import type { MessageStreamEvent } from "@app/lib/api/assistant/pubsub";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getConversationRoute } from "@app/lib/utils/router";
import type { AgentsGetViewType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
  ConversationVisibility,
  ConversationWithoutContentType,
  MessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isCompactionMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isContentFragmentType } from "@app/types/content_fragment";
import {
  isInteractiveContentType,
  isSandboxFunctionContentType,
} from "@app/types/files";
import { isArrayOf } from "@app/types/shared/typescipt_utils";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  AgentMessageEventType,
  AgentMessagePublicType,
  ContentFragmentType as ContentFragmentPublicType,
  ConversationPublicType,
  ConversationWithoutContentPublicType,
  // biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
} from "@dust-tt/client";

/**
 * Normalizes deprecated visibility values to their current equivalents.
 * The "workspace" visibility value is deprecated and should be treated as "unlisted".
 *
 * @param visibility - The visibility value (may be deprecated)
 * @returns The normalized visibility value (defaults to "unlisted" if undefined)
 */
export function normalizeConversationVisibility(
  visibility: ConversationVisibility | "workspace" | undefined
): ConversationVisibility {
  // Temporary translation layer for deprecated "workspace" visibility.
  if (visibility === "workspace") {
    return "unlisted";
  }
  return visibility ?? "unlisted";
}

/**
 * Normalizes deprecated agent view values to their current equivalents.
 * The "workspace" view is deprecated and should be treated as "published".
 *
 * @param view - The agent view value (may be deprecated)
 * @returns The normalized view value
 */
export function normalizeAgentView(
  view: AgentsGetViewType | "workspace"
): AgentsGetViewType {
  // workspace is deprecated, return all visible agents
  if (view === "workspace") {
    return "published";
  }
  return view;
}

/**
 * Adds backward-compatible fields to a conversation without content response.
 * These fields are maintained for API backward compatibility with older SDK versions.
 *
 * @param conversation - The conversation object
 * @param auth - The authenticator to get workspace info
 * @returns The conversation with backward-compatible fields added
 */
export function addBackwardCompatibleConversationWithoutContentFields(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): ConversationWithoutContentPublicType {
  return {
    ...conversation,
    // Remove once all old SDKs users are updated
    requestedGroupIds: [],
    // These properties are excluded from ConversationWithoutContentType used internally
    // but are still returned for the public API to stay backward compatible.
    visibility: "unlisted" as ConversationVisibility, // Hardcoded as "deleted" conversations are not returned by the API
    owner: auth.getNonNullableWorkspace(),
  };
}

export function filterOutInternalFileContentTypes(
  c: ContentFragmentType[]
): ContentFragmentPublicType[] {
  const result: ContentFragmentPublicType[] = [];
  for (const m of c) {
    if (
      isInteractiveContentType(m.contentType) ||
      isSandboxFunctionContentType(m.contentType)
    ) {
      continue;
    }
    result.push({
      ...m,
      contentType: m.contentType,
    });
  }
  return result;
}

export function addBackwardCompatibleConversationFields(
  conversation: ConversationType
): ConversationPublicType {
  return {
    ...conversation,
    requestedGroupIds: [],
    content: conversation.content.map((c) => {
      if (c.length === 0) {
        return [];
      } else if (
        isArrayOf<MessageType, AgentMessageType>(c, isAgentMessageType)
      ) {
        return c.map((m) => addBackwardCompatibleAgentMessageFields(m));
      } else if (
        isArrayOf<MessageType, UserMessageType>(c, isUserMessageType)
      ) {
        return c.map((m) => m);
      } else if (
        isArrayOf<MessageType, ContentFragmentType>(c, isContentFragmentType)
      ) {
        return filterOutInternalFileContentTypes(c);
      } else if (isCompactionMessageType(c[0])) {
        // TODO(compaction): expose compaction messages in the public API.
        return [];
      }
      assertNever(c[0]);
    }),
    url: getConversationRoute(
      conversation.owner.sId,
      conversation.sId,
      undefined,
      config.getAppUrl()
    ),
  };
}

// Legacy method to get the raw contents of an agent message, only for the public API backward compatibility.
function getRawContents(msg: AgentMessageType): Array<{
  step: number;
  content: string;
}> {
  const rawContents: Array<{
    step: number;
    content: string;
  }> = [];
  for (const c of msg.contents) {
    if (c.content.type === "text_content") {
      rawContents.push({
        step: c.step,
        content: c.content.value,
      });
    }
  }
  return rawContents;
}

export function addBackwardCompatibleAgentMessageFields(
  agentMessage: AgentMessageType
): AgentMessagePublicType {
  // File path files have no public file resource. Omit them from each action's generatedFiles.
  const publicActions = agentMessage.actions.map((action) => ({
    ...action,
    generatedFiles: action.generatedFiles.filter(
      (f): f is ActionGeneratedDBFileType => f.fileId !== null
    ),
  }));

  return {
    ...agentMessage,
    actions: publicActions,
    // Map "gracefully_stopped" to "succeeded" and "interrupted" to "cancelled" for the public API.
    status:
      agentMessage.status === "gracefully_stopped"
        ? "succeeded"
        : agentMessage.status === "interrupted"
          ? "cancelled"
          : agentMessage.status,
    rawContents: getRawContents(agentMessage),
  };
}

/**
 * Transforms an internal agent message stream event into the public
 * `AgentMessageEventType` exposed by the v1 SSE endpoint. Filters out
 * file-path generated files (no public file resource) and enriches
 * `run_agent` tool notifications with child conversation URLs.
 */
export function toPublicAgentMessageEvent(
  auth: Authenticator,
  event: MessageStreamEvent
): AgentMessageEventType {
  if (event.data.type === "tool_notification") {
    const { label, output: originalOutput } =
      event.data.notification._meta.data;

    let output;
    if (isRunAgentQueryProgressOutput(originalOutput)) {
      const wId = auth.getNonNullableWorkspace().sId;
      const { conversationId, agentMessageId } = originalOutput;
      const childConversationUrl = `${config.getApiBaseUrl()}/api/v1/w/${wId}/assistant/conversations/${conversationId}`;
      output = {
        ...originalOutput,
        childConversationUrl,
        childConversationEventsUrl: agentMessageId
          ? `${childConversationUrl}/messages/${agentMessageId}/events`
          : null,
      };
    } else {
      output = originalOutput;
    }

    return {
      eventId: event.eventId,
      data: {
        ...event.data,
        action: {
          ...event.data.action,
          generatedFiles: event.data.action.generatedFiles.filter(
            (f): f is ActionGeneratedDBFileType => f.fileId !== null
          ),
        },
        notification: {
          ...event.data.notification,
          // For backward compatibility, we need to move the _meta.data to the root level.
          data: {
            label,
            output,
          },
        },
      },
    };
  }

  if (
    event.data.type === "agent_action_success" ||
    event.data.type === "tool_params"
  ) {
    return {
      eventId: event.eventId,
      data: {
        ...event.data,
        action: {
          ...event.data.action,
          generatedFiles: event.data.action.generatedFiles.filter(
            (f): f is ActionGeneratedDBFileType => f.fileId !== null
          ),
        },
      },
    };
  }

  return {
    eventId: event.eventId,
    data: event.data,
  };
}

/**
 * Adds backward-compatible fields to agent configuration responses.
 * These fields are maintained for API backward compatibility with older SDK versions.
 *
 * @param agentConfiguration - The agent configuration object
 * @returns The agent configuration with backward-compatible fields added
 */
export function addBackwardCompatibleAgentConfigurationFields<
  T extends Record<string, unknown>,
>(
  agentConfiguration: T
): T & {
  requestedGroupIds: never[];
  requestedSpaceIds: never[];
} {
  return {
    ...agentConfiguration,
    requestedGroupIds: [],
    requestedSpaceIds: [],
  };
}
