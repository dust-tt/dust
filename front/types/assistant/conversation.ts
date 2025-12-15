import type { MCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import type {
  AllSupportedWithDustSpecificFileContentType,
  ContentFragmentType,
  MentionType,
  ModelId,
  RichMention,
} from "@app/types";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";

import type { UserType, WorkspaceType } from "../user";
import type {
  AgentConfigurationStatus,
  GenericErrorContent,
  LightAgentConfigurationType,
} from "./agent";
import type { AgentContentItemType } from "./agent_message_content";

export type MessageVisibility = "visible" | "deleted";

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

// This is the old format where content fragments are separated from the user messages.
export type LegacyLightMessageType =
  | LightAgentMessageType
  | UserMessageType
  | ContentFragmentType;

// This is the new format where content fragments are attached to the user messages.
export type LightMessageType =
  | LightAgentMessageType
  | UserMessageTypeWithContentFragments;

/**
 * User messages
 */

/**
 * User message origins indicate which means the user (be it human or program)
 * used to send the message.
 *
 * They should be mutually exclusive and commonly exhaustive, i.e. any new
 * origin here should not overlap with another existing origin and all user
 * messages should have an origin.
 *
 * Avoid adding an origin that:
 * - is not directly linked to how the original user sent the message;
 * - overlaps with existing origins (e.g. "linux" and "mac-os" would be terrible
 *   orgins in that respect, overlapping with almost all origins).
 *
 * Origins are also used for programmatic usage tracking, so ideally a new
 * origin should be easily categorizable as either "programmatic" or "user".
 *
 */
export type UserMessageOrigin =
  // "api" is Custom API usage, while e.g. extension, gsheets and many other origins
  // below are API usages dedicated to standard product features.
  | "api"
  | "cli"
  | "cli_programmatic"
  | "email"
  | "excel"
  | "extension"
  | "github-copilot-chat"
  | "gsheet"
  | "make"
  | "n8n"
  | "powerpoint"
  | "raycast"
  | "slack"
  | "slack_workflow"
  | "teams"
  | "transcript"
  | "triggered_programmatic"
  | "triggered"
  | "web"
  | "zapier"
  | "zendesk"
  | "onboarding_conversation";

export type UserMessageContext = {
  username: string;
  timezone: string;
  fullName: string | null;
  email: string | null;
  profilePictureUrl: string | null;
  origin: UserMessageOrigin;
  lastTriggerRunAt?: number | null;
  clientSideMCPServerIds?: string[];
  selectedMCPServerViewIds?: string[];
};

export type AgenticMessageData = {
  type: "run_agent" | "agent_handover";
  originMessageId: string;
};

export type UserMessageType = {
  id: ModelId;
  created: number;
  type: "user_message";
  sId: string;
  visibility: MessageVisibility;
  version: number;
  rank: number;
  user: UserType | null;
  mentions: MentionType[];
  richMentions: RichMention[];
  content: string;
  context: UserMessageContext;
  agenticMessageData?: AgenticMessageData;
};

export type UserMessageTypeWithContentFragments = UserMessageType & {
  contentFragments: ContentFragmentType[];
};

export function isUserMessageType(
  arg: MessageType | LegacyLightMessageType | LightMessageType
): arg is UserMessageType {
  return arg.type === "user_message";
}

export function isUserMessageTypeWithContentFragments(
  arg: MessageType | LightMessageType
): arg is UserMessageTypeWithContentFragments {
  return arg.type === "user_message" && "contentFragments" in arg;
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
  contentType: AllSupportedWithDustSpecificFileContentType;
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
  rank: number;
  created: number;
  completedTs: number | null;
  parentMessageId: string;
  parentAgentMessageId: string | null; // If handover, this is the agent message that summoned this agent.
  status: AgentMessageStatus;
  content: string | null;
  chainOfThought: string | null;
  error: GenericErrorContent | null;
  visibility: MessageVisibility;
};

export type ParsedContentItem =
  | { kind: "reasoning"; content: string }
  | { kind: "action"; action: AgentMCPActionWithOutputType };

export type AgentMessageType = BaseAgentMessageType & {
  id: ModelId;
  agentMessageId: ModelId;
  created: number;
  visibility: MessageVisibility;
  configuration: LightAgentConfigurationType;
  skipToolsValidation: boolean;
  actions: AgentMCPActionWithOutputType[];
  rawContents: Array<{
    step: number;
    content: string;
  }>;
  contents: Array<{ step: number; content: AgentContentItemType }>;
  parsedContents: Record<number, Array<ParsedContentItem>>;
  modelInteractionDurationMs: number | null;
};

export type LightAgentMessageType = BaseAgentMessageType & {
  configuration: {
    sId: string;
    name: string;
    pictureUrl: string;
    status: AgentConfigurationStatus;
    canRead: boolean;
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
  updated: number;
  unread: boolean;
  actionRequired: boolean;
  hasError: boolean;
  sId: string;
  title: string | null;
  spaceId: string | null;
  depth: number;

  // Ideally, this property should be moved to the ConversationType.
  requestedSpaceIds: string[];
};

/**
 * content [][] structure is intended to allow retries (of agent messages) or edits (of user
 * messages).
 */
export type ConversationType = ConversationWithoutContentType & {
  owner: WorkspaceType;
  visibility: ConversationVisibility;
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
  "message_not_found",
  "message_deletion_not_authorized",
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

/**
 * Conversation events.
 */

// Event sent when the user message is created.
export type UserMessageNewEvent = {
  type: "user_message_new";
  created: number;
  messageId: string;
  message: UserMessageTypeWithContentFragments;
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
  message: AgentMessageType;
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
