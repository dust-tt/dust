import type { BrowseActionType } from "@app/lib/actions/browse";
import type { ConversationIncludeFileActionType } from "@app/lib/actions/conversation/include_file";
import type { ConversationListFilesActionType } from "@app/lib/actions/conversation/list_files";
import type { DustAppRunActionType } from "@app/lib/actions/dust_app_run";
import type { MCPActionType } from "@app/lib/actions/mcp";
import type { ProcessActionType } from "@app/lib/actions/process";
import type { ReasoningActionType } from "@app/lib/actions/reasoning";
import type { RetrievalActionType } from "@app/lib/actions/retrieval";
import type { SearchLabelsActionType } from "@app/lib/actions/search_labels";
import type { TablesQueryActionType } from "@app/lib/actions/tables_query";
import type { WebsearchActionType } from "@app/lib/actions/websearch";

import type { ContentFragmentType } from "../content_fragment";
import type { ModelId } from "../shared/model_id";
import type { UserType, WorkspaceType } from "../user";
import type { LightAgentConfigurationType } from "./agent";

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

export type MessageWithContentFragmentsType =
  | AgentMessageType
  | (UserMessageType & {
      contenFragments?: ContentFragmentType[];
    });

export type WithRank<T> = T & {
  rank: number;
};
export type MessageWithRankType = WithRank<MessageType>;

/**
 * User messages
 */

export type UserMessageOrigin =
  | "slack"
  | "web"
  | "api"
  | "email"
  | "gsheet"
  | "zapier"
  | "n8n"
  | "make"
  | "zendesk"
  | "raycast"
  | "github-copilot-chat"
  | "extension"
  | "email";

export type UserMessageContext = {
  username: string;
  timezone: string;
  fullName: string | null;
  email: string | null;
  profilePictureUrl: string | null;
  origin?: UserMessageOrigin | null;
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

export function isUserMessageType(arg: MessageType): arg is UserMessageType {
  return arg.type === "user_message";
}

/**
 * Agent messages
 */
export type ConfigurableAgentActionType =
  | RetrievalActionType
  | DustAppRunActionType
  | TablesQueryActionType
  | ProcessActionType
  | WebsearchActionType
  | BrowseActionType
  | ReasoningActionType
  | MCPActionType;

export type ConversationAgentActionType =
  | ConversationListFilesActionType
  | ConversationIncludeFileActionType;

export type AgentActionType =
  | ConfigurableAgentActionType
  | ConversationAgentActionType
  | SearchLabelsActionType;

export type AgentMessageStatus =
  | "created"
  | "succeeded"
  | "failed"
  | "cancelled";

export const ACTION_RUNNING_LABELS: Record<AgentActionType["type"], string> = {
  browse_action: "Browsing page",
  conversation_include_file_action: "Reading file",
  conversation_list_files_action: "Listing files",
  dust_app_run_action: "Running App",
  process_action: "Extracting data",
  reasoning_action: "Reasoning",
  retrieval_action: "Searching data",
  search_labels_action: "Searching labels",
  tables_query_action: "Querying tables",
  websearch_action: "Searching the web",
  tool_action: "Calling an external tool",
};

/**
 * Both `action` and `message` are optional (we could have a no-op agent basically).
 *
 * Since `action` and `message` are bundled together, it means that we will only be able to retry
 * them together in case of error of either. We store an error only here whether it's an error
 * coming from the action or from the message generation.
 */
export type AgentMessageType = {
  id: ModelId;
  agentMessageId: ModelId;
  created: number;
  type: "agent_message";
  sId: string;
  visibility: MessageVisibility;
  version: number;
  parentMessageId: string | null;
  configuration: LightAgentConfigurationType;
  status: AgentMessageStatus;
  actions: AgentActionType[];
  content: string | null;
  chainOfThought: string | null;
  rawContents: Array<{
    step: number;
    content: string;
  }>;
  error: {
    code: string;
    message: string;
  } | null;
};

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
export type ConversationVisibility =
  | "unlisted"
  | "workspace"
  | "deleted"
  | "test";

/**
 * A lighter version of Conversation without the content (for menu display).
 */
export type ConversationWithoutContentType = {
  id: ModelId;
  created: number;
  updated?: number;
  owner: WorkspaceType;
  sId: string;
  title: string | null;
  visibility: ConversationVisibility;
  requestedGroupIds: string[][];
};

/**
 * content [][] structure is intended to allow retries (of agent messages) or edits (of user
 * messages).
 */
export type ConversationType = ConversationWithoutContentType & {
  content: (UserMessageType[] | AgentMessageType[] | ContentFragmentType[])[];
};

export type UserParticipant = {
  username: string;
  fullName: string | null;
  pictureUrl: string | null;
};
export type AgentParticipant = {
  configurationId: string;
  name: string;
  pictureUrl: string | null;
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
  fullName: string | null;
  pictureUrl: string | null;
  username: string;
}

export interface ConversationParticipantsType {
  agents: AgentParticipant[];
  users: UserParticipant[];
}

export const CONVERSATION_ERROR_TYPES = [
  "conversation_not_found",
  "conversation_access_restricted",
  "conversation_with_unavailable_agent",
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
  messages: MessageWithRankType[];
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
