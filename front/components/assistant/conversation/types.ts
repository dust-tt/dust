import type { InputBarContainerProps } from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import type { ToolNotificationEvent } from "@app/lib/actions/mcp";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { DustError } from "@app/lib/error";
import type { AgentMCPActionType } from "@app/types/actions";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ConversationWithoutContentType,
  InlineActivityStep,
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
  LightMessageType,
  UserMessageOrigin,
  UserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import {
  isLightAgentMessageWithActionsType,
  isUserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";

import type { RichMention } from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
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
    useFullChainOfThought: boolean;
    inlineActivitySteps: InlineActivityStep[];
  };
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
  | UserMessageTypeWithContentFragments;

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

// Central helper to control which user message should be hidden in the UI.
// Extend this list as we introduce more bootstrap/system user messages.
export const isHiddenMessage = (message: VirtuosoMessage): boolean => {
  return (
    (isUserMessage(message) &&
      (message.context.origin === "onboarding_conversation" ||
        message.context.origin === "project_kickoff" ||
        message.context.origin === "reinforced_agent_notification" ||
        isSidekickBootstrapMessage(message))) ||
    isHandoverUserMessage(message)
  );
};

export const isUserMessage = (
  msg: VirtuosoMessage
): msg is UserMessageTypeWithContentFragments =>
  "type" in msg && msg.type === "user_message" && "contentFragments" in msg;

export const isHandoverUserMessage = (msg: VirtuosoMessage): boolean =>
  isUserMessage(msg) && msg.agenticMessageData?.type === "agent_handover";

export const isAgentMessageWithStreaming = (
  msg: VirtuosoMessage
): msg is AgentMessageWithStreaming => "streaming" in msg;

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
      inlineActivitySteps: message.activitySteps ?? [],
      isRetrying: false,
      lastUpdated: new Date(),
      pendingToolCalls: [],
      useFullChainOfThought: false,
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
) =>
  messages.map((message) =>
    isUserMessageTypeWithContentFragments(message)
      ? message
      : makeInitialMessageStreamState(message)
  );
