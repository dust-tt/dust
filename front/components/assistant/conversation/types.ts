import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import type { InputBarContainerProps } from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import type { AgentLoopToolNotificationEvent } from "@app/lib/actions/mcp";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { DustError } from "@app/lib/error";
import type { AgentMCPActionType } from "@app/types/actions";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  CompactionMessageType,
  ConversationWithoutContentType,
  InlineActivityStep,
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
  LightMessageType,
  UserMessageOrigin,
  UserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import {
  isCompactionMessageType,
  isHiddenMessageOrigin,
  isLightAgentMessageType,
  isLightAgentMessageWithActionsType,
  isTerminalAgentMessageStatus,
  isUserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";

import type { RichMention } from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import type { MutableRefObject } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

export type AgentStateClassification =
  | "placeholder"
  | "thinking"
  | "acting"
  | "writing"
  | "done";

export type UiView = "standard" | "compact";

export type ActionProgressState = Map<
  ModelId,
  {
    action: AgentMCPActionType;
    progress?: ProgressNotificationContentType;
  }
>;

export type PendingToolCall = {
  toolName: string;
  toolCallId?: string;
  toolCallIndex?: number;
};

export function getPendingToolCallKey(
  pendingToolCall: PendingToolCall,
  index: number
): string {
  if (pendingToolCall.toolCallId) {
    return `id-${pendingToolCall.toolCallId}`;
  }

  if (pendingToolCall.toolCallIndex !== undefined) {
    return `index-${pendingToolCall.toolCallIndex}`;
  }

  return `name-${pendingToolCall.toolName}-${index}`;
}

export type AgentMessageWithStreaming = LightAgentMessageWithActionsType & {
  streaming: {
    agentState: AgentStateClassification;
    isRetrying: boolean;
    lastUpdated: Date;
    actionProgress: ActionProgressState;
    pendingToolCalls: PendingToolCall[];
    inlineActivitySteps: InlineActivityStep[];
  };
};

export type ConversationForkNotice = {
  type: "conversation_fork_notice";
  sId: string;
  created: number;
  rank: number;
  visibility: "visible";
  sourceMessageId: string;
  childConversationId: string;
  childConversationTitle: string | null;
  user: UserType;
};

export type AgentMessageStateEvent = (
  | AgentMessageEvents
  | AgentLoopToolNotificationEvent
) & { step: number };

export type AgentMessageStateWithControlEvent =
  | AgentMessageStateEvent
  | { type: "end-of-stream" };

export type VirtuosoMessage =
  | AgentMessageWithStreaming
  | UserMessageTypeWithContentFragments
  | CompactionMessageType
  | ConversationForkNotice;

export type VirtuosoMessageListContext = {
  owner: LightWorkspaceType;
  user: UserType;
  isOnboardingConversation: boolean;
  handleSubmit: (
    input: string,
    mentions: RichMention[],
    contentFragments: ContentFragmentsType
  ) => Promise<Result<undefined, DustError>>;
  draftKey: string;
  conversation?: ConversationWithoutContentType;
  // Whether the conversation should render its compact UI variant (currently:
  // conversations that live in the user's activation pod).
  uiView: UiView;
  agentBuilderContext?: {
    draftAgent?: LightAgentConfigurationType;
    isSubmitting: boolean;
    actionsToShow: InputBarContainerProps["actions"];
    // Locks the conversation to its current agent: no `@` agent suggestions
    // and no agent switch on paste (used by the sidekick).
    disableAgentMentions?: boolean;
    disableReactions?: boolean;
    resetConversation: () => void;
    clientSideMCPServerIds?: string[];
    skipToolsValidation?: boolean;
  };
  feedbacksByMessageId: Record<string, AgentMessageFeedbackType>;
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
  // Project membership fields (undefined for non-project conversations)
  isProjectMember?: boolean;
  isProjectRestricted?: boolean;
  isProjectArchived?: boolean;
  projectId?: string;
  projectSpaceName?: string;
  enableAutoScroll: () => void;
  isAutoScrollEnabledRef: MutableRefObject<boolean>;
  lastUserScrollAtRef: MutableRefObject<number | null>;
  isNoSeat?: boolean;
  setLimitReachedCode?: (code: WorkspaceLimit) => void;
};

export const areSameRank = (
  a: VirtuosoMessage,
  b: VirtuosoMessage
): boolean => {
  return a.rank === b.rank;
};

export const getPredicateForRank = (
  m: VirtuosoMessage
): ((m: VirtuosoMessage) => boolean) => {
  return (m2: VirtuosoMessage) => areSameRank(m, m2);
};

export const isTriggeredOrigin = (origin?: UserMessageOrigin | null) => {
  return (
    origin && (origin === "triggered" || origin === "triggered_programmatic")
  );
};

// Central helper to control which user message should be hidden in the UI.
// Extend this list as we introduce more bootstrap/system user messages.
export const isHiddenMessage = (message: VirtuosoMessage): boolean => {
  return (
    (isUserMessage(message) &&
      (isHiddenMessageOrigin(message.context.origin) ||
        isSidekickBootstrapMessage(message))) ||
    isHandoverUserMessage(message)
  );
};

// Messages that MessageItem renders as `null`, i.e. zero-height rows in the
// Virtuoso list. Wakeup messages are in HIDDEN_MESSAGE_ORIGINS but do render
// (as WakeUpMessage), so they are excluded.
//
// Zero-height rows must never be used as the list's initial scroll target:
// VirtuosoMessageList bootstraps its size measurement by rendering the target
// item alone with a seeded size of 0, and only proceeds once the measured size
// differs from the seed. A zero-height target therefore deadlocks the list in
// its loading placeholder.
export const isZeroHeightMessage = (message: VirtuosoMessage): boolean => {
  return (
    isHiddenMessage(message) &&
    !(isUserMessage(message) && message.context.origin === "wakeup")
  );
};

export const isCompactionMessage = (
  msg: VirtuosoMessage
): msg is CompactionMessageType => msg.type === "compaction_message";

export const isConversationForkNotice = (
  msg: VirtuosoMessage
): msg is ConversationForkNotice => msg.type === "conversation_fork_notice";

export const isUserMessage = (
  msg: VirtuosoMessage
): msg is UserMessageTypeWithContentFragments =>
  "type" in msg && msg.type === "user_message" && "contentFragments" in msg;

export const isHandoverUserMessage = (msg: VirtuosoMessage): boolean =>
  isUserMessage(msg) && msg.agenticMessageData?.type === "agent_handover";

/**
 * Optimistic rows created in ConversationViewer before the backend responds.
 * Identified by the sId prefixes from createPlaceholderUserMessage /
 * createPlaceholderAgentMessage.
 */
export const isPlaceholderMessage = (msg: VirtuosoMessage): boolean =>
  msg.sId.startsWith("placeholder-user-message-") ||
  msg.sId.startsWith("placeholder-agent-message-");

export const isAgentMessageWithStreaming = (
  msg: VirtuosoMessage
): msg is AgentMessageWithStreaming =>
  "streaming" in msg && msg.type === "agent_message";

export const getMessageDate = (msg: VirtuosoMessage): Date =>
  new Date(msg.created);

export const makeInitialMessageStreamState = (
  message: LightAgentMessageType | LightAgentMessageWithActionsType
): AgentMessageWithStreaming => {
  return {
    ...message,
    actions: isLightAgentMessageWithActionsType(message) ? message.actions : [],
    streaming: {
      actionProgress: new Map(),
      agentState: message.status === "created" ? "thinking" : "done",
      // Live messages rebuild inline steps from the SSE replay on mount.
      inlineActivitySteps:
        message.status === "created" ? [] : (message.activitySteps ?? []),
      isRetrying: false,
      lastUpdated: new Date(),
      pendingToolCalls: [],
    },
  };
};

// Returns true when the message still matches the output of makeInitialMessageStreamState —
// i.e. no SSE event has moved it beyond the initial "thinking" state yet.
// The rest-spread exhaustiveness check below ensures that adding a new field to
// AgentMessageWithStreaming["streaming"] without handling it here is a compile error.
export const isAtInitialStreamState = (
  msg: AgentMessageWithStreaming
): boolean => {
  const {
    agentState,
    isRetrying,
    pendingToolCalls,
    inlineActivitySteps,
    actionProgress,
    lastUpdated: _lastUpdated, // always "now" at creation; not comparable
    ...rest
  } = msg.streaming;

  // Fails to compile if a new streaming field is added without an explicit
  // decision about whether to check it here.
  void (rest satisfies Record<PropertyKey, never>);

  return (
    !isTerminalAgentMessageStatus(msg.status) &&
    msg.content === null &&
    msg.chainOfThought === null &&
    agentState === "thinking" &&
    !isRetrying &&
    pendingToolCalls.length === 0 &&
    inlineActivitySteps.length === 0 &&
    actionProgress.size === 0
  );
};

const isSidekickBootstrapMessage = (
  message: UserMessageTypeWithContentFragments
): boolean => {
  return message.context.origin === "agent_sidekick" && message.rank === 0;
};

export const convertLightMessageTypeToVirtuosoMessages = (
  messages: LightMessageType[]
): VirtuosoMessage[] =>
  messages.map((message) => {
    if (isCompactionMessageType(message)) {
      return message;
    } else if (isUserMessageTypeWithContentFragments(message)) {
      return message;
    } else if (isLightAgentMessageWithActionsType(message)) {
      return makeInitialMessageStreamState(message);
    } else if (isLightAgentMessageType(message)) {
      return makeInitialMessageStreamState(message);
    } else {
      assertNeverAndIgnore(message);
      return message; // Non reachable
    }
  });
