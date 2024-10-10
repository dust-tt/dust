import { DustAppRunActionType } from "../../front/assistant/actions/dust_app_run";
import { ProcessActionType } from "../../front/assistant/actions/process";
import { RetrievalActionType } from "../../front/assistant/actions/retrieval";
import { TablesQueryActionType } from "../../front/assistant/actions/tables_query";
import { LightAgentConfigurationType } from "../../front/assistant/agent";
import { UserType, WorkspaceType } from "../../front/user";
import { ModelId } from "../../shared/model_id";
import { ContentFragmentType } from "../content_fragment";
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

export type UserMessageOrigin =
  | "slack"
  | "web"
  | "api"
  | "gsheet"
  | "zapier"
  | "make"
  | "zendesk"
  | "raycast";

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

export const ACTION_RUNNING_LABELS: Record<AgentActionType["type"], string> = {
  dust_app_run_action: "Running App",
  process_action: "Extracting data",
  retrieval_action: "Searching data",
  tables_query_action: "Querying tables",
  websearch_action: "Searching the web",
  browse_action: "Browsing page",
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
 * when a user 'tests' an assistant not in their list using the "test" button:
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
  owner: WorkspaceType;
  sId: string;
  title: string | null;
  visibility: ConversationVisibility;
  groupIds: string[];
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
