import type { InputBarContainerProps } from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import type { ToolNotificationEvent } from "@app/lib/actions/mcp";
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
  isLightAgentMessageType,
  isLightAgentMessageWithActionsType,
  isUserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";

import type { RichMention } from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

export type AgentStateClassification =
  | "placeholder"
  | "thinking"
  | "acting"
  | "writing"
  | "done";

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
  branchId: null;
  visibility: "visible";
  sourceMessageId: string;
  childConversationId: string;
  childConversationTitle: string | null;
  user: UserType;
};

export type AgentMessageStateEvent = (
  | AgentMessageEvents
  | ToolNotificationEvent
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
  onConversationBranched?: () => Promise<void> | void;
  handleSubmit: (
    input: string,
    mentions: RichMention[],
    contentFragments: ContentFragmentsType
  ) => Promise<Result<undefined, DustError>>;
  draftKey: string;
  conversation?: ConversationWithoutContentType;
  agentBuilderContext?: {
    draftAgent?: LightAgentConfigurationType;
    isSubmitting: boolean;
    actionsToShow: InputBarContainerProps["actions"];
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
  branchIdToApprove?: string;
  setBranchIdToApprove?: (branchId: string | null) => void;
};

export const areSameRankAndBranch = (
  a: VirtuosoMessage,
  b: VirtuosoMessage
): boolean => {
  return a.rank === b.rank && a.branchId === b.branchId;
};

export const getPredicateForRankAndBranch = (
  m: VirtuosoMessage
): ((m: VirtuosoMessage) => boolean) => {
  return (m2: VirtuosoMessage) => areSameRankAndBranch(m, m2);
};

export const isTriggeredOrigin = (origin?: UserMessageOrigin | null) => {
  return (
    origin && (origin === "triggered" || origin === "triggered_programmatic")
  );
};

export const isWakeUpOrigin = (origin?: UserMessageOrigin | null) => {
  return origin === "wakeup";
};

// Central helper to control which user message should be hidden in the UI.
// Extend this list as we introduce more bootstrap/system user messages.
export const isHiddenMessage = (message: VirtuosoMessage): boolean => {
  return (
    (isUserMessage(message) &&
      (message.context.origin === "onboarding_conversation" ||
        message.context.origin === "project_kickoff" ||
        message.context.origin === "reinforced_skill_notification" ||
        isWakeUpOrigin(message.context.origin) ||
        isSidekickBootstrapMessage(message))) ||
    isHandoverUserMessage(message)
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

export const isSidekickBootstrapMessage = (
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
