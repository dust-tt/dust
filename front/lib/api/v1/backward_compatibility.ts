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
  isUserMessageType,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isContentFragmentType } from "@app/types/content_fragment";
import { isArrayOf } from "@app/types/shared/typescipt_utils";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  AgentMessagePublicType,
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
        return c.map((m) => m);
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
  return {
    ...agentMessage,
    rawContents: getRawContents(agentMessage),
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
