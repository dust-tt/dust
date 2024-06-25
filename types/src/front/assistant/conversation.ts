import { DustAppRunActionType } from "../../front/assistant/actions/dust_app_run";
import { ProcessActionType } from "../../front/assistant/actions/process";
import { RetrievalActionType } from "../../front/assistant/actions/retrieval";
import { TablesQueryActionType } from "../../front/assistant/actions/tables_query";
import { LightAgentConfigurationType } from "../../front/assistant/agent";
import { UserType, WorkspaceType } from "../../front/user";
import { ModelId } from "../../shared/model_id";
import { BrowseActionType } from "./actions/browse";
import { WebsearchActionType } from "./actions/websearch";

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

export type WithRank<T> = T & {
  rank: number;
};
export type MessageWithRankType = WithRank<MessageType>;

/**
 * User messages
 */

export type UserMessageOrigin = "slack" | "web" | "api";

export type UserMessageContext = {
  username: string;
  timezone: string;
  fullName: string | null;
  email: string | null;
  profilePictureUrl: string | null;
  origin: UserMessageOrigin | null;
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

export type AgentActionType =
  | RetrievalActionType
  | DustAppRunActionType
  | TablesQueryActionType
  | ProcessActionType
  | WebsearchActionType
  | BrowseActionType;

export type AgentMessageStatus =
  | "created"
  | "succeeded"
  | "failed"
  | "cancelled";

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
  chainOfThoughts: string[];
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
 * Content Fragments
 */
export type ContentFragmentContextType = {
  username: string | null;
  fullName: string | null;
  email: string | null;
  profilePictureUrl: string | null;
};

export const supportedTextFormat = [
  "text/plain",
  "text/csv",
  "text/markdown",
  "text/tsv",
  "text/comma-separated-values",
  "text/tab-separated-values",
  "application/pdf",
] as const

export type SupportedTextFormatType = typeof supportedTextFormat[number];

export const supportedImageFormat = [
  "image/png",
  "image/jpeg",
  "image/jpg"
] as const;

export type SupportedImageFormatType = typeof supportedImageFormat[number];

export const supportedContentFragment = [
  ...supportedImageFormat,
  ...supportedTextFormat,
  "dust-application/slack"
] as const;

export type ContentFragmentContentType = typeof supportedContentFragment[number];

export type ContentFragmentType = {
  id: ModelId;
  sId: string;
  created: number;
  type: "content_fragment";
  visibility: MessageVisibility;
  version: number;
  sourceUrl: string | null;
  textUrl: string;
  textBytes: number | null;
  title: string;
  contentType: ContentFragmentContentType;
  context: ContentFragmentContextType;
};

export function isContentFragmentType(
  arg: MessageType
): arg is ContentFragmentType {
  return arg.type === "content_fragment";
}

export function isSupportedContentFormat(format: unknown): format is ContentFragmentContentType {
  return typeof format === 'string' &&
    supportedContentFragment.includes(format as ContentFragmentContentType);
}

export function isSupportedImageContentFormat(format: unknown): format is SupportedImageFormatType {
  return typeof format === 'string' &&
    supportedImageFormat.includes(format as SupportedImageFormatType)
}

export function isSupportedTextContentFormat(format: unknown): format is SupportedTextFormatType {
  return typeof format === 'string' &&
    supportedTextFormat.includes(format as SupportedTextFormatType)
}
/**
 * Conversations
 */

/**
 * Visibility of a conversation. Test visibility is for conversations happening
 * when a user 'tests' an assistant not in their list using the "test" button:
 * those conversations do not show in users' histories.
 */
export type ConversationVisibility =
  | "unlisted"
  | "workspace"
  | "deleted"
  | "test";

/**
 * content [][] structure is intended to allow retries (of agent messages) or edits (of user
 * messages).
 */
export type ConversationType = {
  id: ModelId;
  created: number;
  sId: string;
  owner: WorkspaceType;
  title: string | null;
  visibility: ConversationVisibility;
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

/**
 * A lighter version of Conversation without the content (for menu display).
 */
export type ConversationWithoutContentType = {
  created: number;
  id: ModelId;
  owner: WorkspaceType;
  sId: string;
  title: string | null;
  visibility: ConversationVisibility;
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
