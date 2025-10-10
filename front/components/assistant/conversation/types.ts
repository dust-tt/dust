import type { EditorMention } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import type { InputBarContainerProps } from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import type { ToolNotificationEvent } from "@app/lib/actions/mcp";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { DustError } from "@app/lib/error";
import type {
  ContentFragmentsType,
  ContentFragmentType,
  LightAgentConfigurationType,
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
  LightWorkspaceType,
  ModelId,
  Result,
  UserMessageType,
  UserType,
} from "@app/types";
import { isLightAgentMessageWithActionsType } from "@app/types";
import type { AgentMCPActionType } from "@app/types/actions";

type AgentStateClassification =
  | "placeholder"
  | "thinking"
  | "acting"
  | "writing"
  | "done";

type ActionProgressState = Map<
  ModelId,
  {
    action: AgentMCPActionType;
    progress?: ProgressNotificationContentType;
  }
>;

export interface MessageTemporaryState {
  message: LightAgentMessageWithActionsType;
  agentState: AgentStateClassification;
  isRetrying: boolean;
  lastUpdated: Date;
  actionProgress: ActionProgressState;
  useFullChainOfThought: boolean;
}

export type AgentMessageStateEvent = (
  | AgentMessageEvents
  | ToolNotificationEvent
) & { step: number };

export type AgentMessageStateWithControlEvent =
  | AgentMessageStateEvent
  | { type: "end-of-stream" };

export type VirtuosoMessage =
  | MessageTemporaryState
  | (UserMessageType & {
      contentFragments: ContentFragmentType[];
    });

export type VirtuosoMessageListContext = {
  owner: LightWorkspaceType;
  user: UserType;
  handleSubmit: (
    input: string,
    mentions: EditorMention[],
    contentFragments: ContentFragmentsType
  ) => Promise<Result<undefined, DustError>>;
  conversationId: string;
  agentBuilderContext?: {
    draftAgent?: LightAgentConfigurationType;
    isSavingDraftAgent: boolean;
    actionsToShow: InputBarContainerProps["actions"];
    resetConversation: () => void;
  };
  feedbacksByMessageId: Record<string, AgentMessageFeedbackType>;
};

export const isUserMessage = (
  msg: VirtuosoMessage
): msg is UserMessageType & { contentFragments: ContentFragmentType[] } =>
  "type" in msg && msg.type === "user_message" && "contentFragments" in msg;

export const isHandoverUserMessage = (
  msg: VirtuosoMessage
): msg is UserMessageType & { contentFragments: ContentFragmentType[] } =>
  "type" in msg &&
  msg.type === "user_message" &&
  msg.context.origin === "agent_handover";

export const isMessageTemporayState = (
  msg: VirtuosoMessage
): msg is MessageTemporaryState => "agentState" in msg;

export const getMessageSId = (msg: VirtuosoMessage): string =>
  isMessageTemporayState(msg) ? msg.message.sId : msg.sId;

export const getMessageDate = (msg: VirtuosoMessage): Date =>
  isMessageTemporayState(msg)
    ? new Date(msg.message.created)
    : new Date(msg.created);

export const getMessageRank = (msg: VirtuosoMessage): number =>
  isMessageTemporayState(msg) ? msg.message.rank : msg.rank;

export const makeInitialMessageStreamState = (
  message: LightAgentMessageType | LightAgentMessageWithActionsType
): MessageTemporaryState => {
  return {
    actionProgress: new Map(),
    agentState: message.status === "created" ? "thinking" : "done",
    isRetrying: false,
    lastUpdated: new Date(),
    message: {
      ...message,
      actions: isLightAgentMessageWithActionsType(message)
        ? message.actions
        : [],
    },
    useFullChainOfThought: false,
  };
};

export const areSameRank = (
  messageA: VirtuosoMessage,
  messageB: VirtuosoMessage
) => {
  return getMessageRank(messageA) === getMessageRank(messageB);
};
