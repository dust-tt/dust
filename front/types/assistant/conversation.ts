import type {
  MCPActionType,
  MCPApproveExecutionEvent,
} from "@app/lib/actions/mcp";
import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";

import type { ContentFragmentType } from "../content_fragment";
import type { ModelId } from "../shared/model_id";
import type { UserType, WorkspaceType } from "../user";
import type {
  AgentConfigurationStatus,
  GenericErrorContent,
  LightAgentConfigurationType,
} from "./agent";
import type { AgentContentItemType } from "./agent_message_content";

/**
 * Mentions
 */

export type AgentMention = {
  configurationId: string;
};

export type MentionType = AgentMention;

export type MessageVisibility = "visible" | "deleted";

export function isAgentMention(arg: MentionType): arg is AgentMention {
  return (arg as AgentMention).configurationId !== undefined;
}

export type ConversationMessageReactions = {
  messageId: string;
  reactions: MessageReactionType[];
}[];

export type MessageReactionType = {
  emoji: string;
  users: {
    userId: ModelId | null;
    username: string;
    fullName: string | null;
  }[];
};

export type MessageType =
  | AgentMessageType
  | UserMessageType
  | ContentFragmentType;

export type LightMessageType =
  | LightAgentMessageType
  | UserMessageType
  | ContentFragmentType;

export type MessageWithContentFragmentsType =
  | LightAgentMessageType
  | (UserMessageType & {
      contentFragments?: ContentFragmentType[];
    });

export type WithRank<T> = T & {
  rank: number;
};
export type MessageWithRankType = WithRank<MessageType>;

export type LightMessageWithRankType = WithRank<LightMessageType>;

/**
 * User messages
 */

export type UserMessageOrigin =
  | "api"
  | "email"
  | "extension"
  | "github-copilot-chat"
  | "gsheet"
  | "make"
  | "n8n"
  | "raycast"
  | "slack"
  | "triggered"
  | "web"
  | "zapier"
  | "zendesk"
  | "excel"
  | "powerpoint"
  | "run_agent"
  | "agent_handover";

export type UserMessageContext = {
  username: string;
  timezone: string;
  fullName: string | null;
  email: string | null;
  profilePictureUrl: string | null;
  origin?: UserMessageOrigin | null;
  lastTriggerRunAt?: Date | null;
  clientSideMCPServerIds?: string[];
  selectedMCPServerViewIds?: string[];
};

export type UserMessageType = {
  id: ModelId;
  created: number;
  type: "user_message";
  sId: string;
  visibility: MessageVisibility;
  version: number;
  user: UserType | null;
  mentions: MentionType[];
  content: string;
  context: UserMessageContext;
};
export type UserMessageWithRankType = WithRank<UserMessageType>;

export function isUserMessageType(
  arg: MessageType | LightMessageType
): arg is UserMessageType {
  return arg.type === "user_message";
}

/**
 * Agent messages
 */
export type AgentMessageStatus =
  | "created"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface CitationType {
  description?: string;
  href?: string;
  title: string;
  provider: string;
}

/**
 * Both `action` and `message` are optional (we could have a no-op agent basically).
 *
 * Since `action` and `message` are bundled together, it means that we will only be able to retry
 * them together in case of error of either. We store an error only here whether it's an error
 * coming from the action or from the message generation.
 */
export type BaseAgentMessageType = {
  type: "agent_message";
  sId: string;
  version: number;
  created: number;
  parentMessageId: string | null;
  status: AgentMessageStatus;
  content: string | null;
  chainOfThought: string | null;
  error: GenericErrorContent | null;
};

export type ParsedContentItem =
  | { kind: "reasoning"; content: string }
  | { kind: "action"; action: MCPActionType };

export type AgentMessageType = BaseAgentMessageType & {
  id: ModelId;
  agentMessageId: ModelId;
  created: number;
  visibility: MessageVisibility;
  configuration: LightAgentConfigurationType;
  skipToolsValidation: boolean;
  actions: MCPActionType[];
  rawContents: Array<{
    step: number;
    content: string;
  }>;
  contents: Array<{ step: number; content: AgentContentItemType }>;
  parsedContents: Record<number, Array<ParsedContentItem>>;
};

export type LightAgentMessageType = BaseAgentMessageType & {
  configuration: {
    sId: string;
    name: string;
    pictureUrl: string;
    status: AgentConfigurationStatus;
    canRead: boolean;
    requestedGroupIds: string[][];
  };
  citations: Record<string, CitationType>;
  generatedFiles: Omit<ActionGeneratedFileType, "snippet">[];
};

// This type represents the agent message we can reconstruct by accumulating streaming events
// in a conversation.
export type LightAgentMessageWithActionsType = LightAgentMessageType & {
  actions: AgentMCPActionWithOutputType[];
};

export function isLightAgentMessageWithActionsType(
  message: LightAgentMessageType | LightAgentMessageWithActionsType
): message is LightAgentMessageWithActionsType {
  // This check relies on the fact that `message` is already either a LightAgentMessageType or a
  // LightAgentMessageWithActionsType; message.actions can therefore only be a AgentMCPActionType[].
  return "actions" in message;
}

export type AgentMessageWithRankType = WithRank<AgentMessageType>;

export function isAgentMessageType(arg: MessageType): arg is AgentMessageType {
  return arg.type === "agent_message";
}

/**
 * Conversations
 */

/**
 * Visibility of a conversation. Test visibility is for conversations happening
 * when a user 'tests' an agent not in their list using the "test" button:
 * those conversations do not show in users' histories.
 */
export type ConversationVisibility = "unlisted" | "deleted" | "test";

/**
 * A lighter version of Conversation without the content (for menu display).
 */
export type ConversationWithoutContentType = {
  id: ModelId;
  created: number;
  updated?: number;
  unread: boolean;
  actionRequired: boolean;
  owner: WorkspaceType;
  sId: string;
  title: string | null;
  visibility: ConversationVisibility;
  depth: number;
  triggerId: string | null;
  requestedGroupIds: string[][];
};

/**
 * content [][] structure is intended to allow retries (of agent messages) or edits (of user
 * messages).
 */
export type ConversationType = ConversationWithoutContentType & {
  content: (UserMessageType[] | AgentMessageType[] | ContentFragmentType[])[];
};

export type ParticipantActionType = "posted" | "reacted" | "subscribed";

/**
 * Conversation participants.
 */

export interface AgentParticipantType {
  configurationId: string;
  name: string;
  pictureUrl: string;
}

export interface UserParticipantType {
  sId: string;
  fullName: string | null;
  pictureUrl: string | null;
  username: string;
  action: ParticipantActionType;
}

export interface ConversationParticipantsType {
  agents: AgentParticipantType[];
  users: UserParticipantType[];
}

export const CONVERSATION_ERROR_TYPES = [
  "conversation_not_found",
  "conversation_access_restricted",
  "conversation_with_unavailable_agent",
  "user_already_participant",
] as const;

export type ConversationErrorType = (typeof CONVERSATION_ERROR_TYPES)[number];

export class ConversationError extends Error {
  readonly type: ConversationErrorType;

  constructor(type: ConversationErrorType) {
    super(`Cannot access conversation: ${type}`);
    this.type = type;
  }
}

export type SubmitMessageError = {
  type:
    | "user_not_found"
    | "attachment_upload_error"
    | "message_send_error"
    | "plan_limit_reached_error"
    | "content_too_large";
  title: string;
  message: string;
};

export interface FetchConversationMessagesResponse {
  hasMore: boolean;
  lastValue: number | null;
  messages: LightMessageWithRankType[];
}

/**
 * Conversation events.
 */

// Event sent when the user message is created.
export type UserMessageNewEvent = {
  type: "user_message_new";
  created: number;
  messageId: string;
  message: UserMessageWithRankType;
};

// Event sent when the user message is created.
export type UserMessageErrorEvent = {
  type: "user_message_error";
  created: number;
  error: {
    code: string;
    message: string;
  };
};

// Event sent when a new message is created (empty) and the agent is about to be executed.
export type AgentMessageNewEvent = {
  type: "agent_message_new";
  created: number;
  configurationId: string;
  messageId: string;
  message: AgentMessageWithRankType;
};

// Event sent when the conversation title is updated.
export type ConversationTitleEvent = {
  type: "conversation_title";
  created: number;
  title: string;
};

export type ConversationMCPServerViewType = {
  id: ModelId;
  workspaceId: ModelId;
  conversationId: ModelId;
  mcpServerViewId: ModelId;
  userId: ModelId;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type MCPActionValidationRequest = Omit<
  MCPApproveExecutionEvent,
  "type" | "created" | "configurationId"
>;
