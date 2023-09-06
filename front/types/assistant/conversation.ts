import { ModelId } from "@app/lib/databases";
import { UserType } from "@app/types/user";

import { RetrievalActionType } from "./actions/retrieval";
import { AgentConfigurationType } from "./agent";

/**
 * Mentions
 */

export type AssistantAgentMention = {
  configurationId: string;
};

export type AssistantUserMention = {
  provider: string;
  providerId: string;
};

export type AssistantMention = AssistantAgentMention | AssistantUserMention;

export type AssistantMessageVisibility = "visible" | "deleted";

export function isAssistantAgentMention(
  arg: AssistantMention
): arg is AssistantAgentMention {
  return (arg as AssistantAgentMention).configurationId !== undefined;
}

export function isAssistantUserMention(
  arg: AssistantMention
): arg is AssistantUserMention {
  const maybeUserMention = arg as AssistantUserMention;
  return (
    maybeUserMention.provider !== undefined &&
    maybeUserMention.providerId !== undefined
  );
}

/**
 * User messages
 */

export type UserMessageContext = {
  username: string;
  timezone: string;
  fullName: string | null;
  email: string | null;
  profilePictureUrl: string | null;
};

export type UserMessageType = {
  id: ModelId;
  type: "user_message";
  sId: string;
  visibility: AssistantMessageVisibility;
  version: number;
  user: UserType | null;
  mentions: AssistantMention[];
  message: string;
  context: UserMessageContext;
};

export function isUserMessageType(
  arg: UserMessageType | AssistantAgentMessageType
): arg is UserMessageType {
  return arg.type === "user_message";
}

/**
 * Agent messages
 */

export type AssistantUserFeedbackType = {
  user: UserType;
  value: "positive" | "negative" | null;
  comment: string | null;
};

export type AssistantAgentActionType = RetrievalActionType;

export type AssistantAgentMessageStatus =
  | "created"
  | "action_running"
  | "writing"
  | "succeeded"
  | "failed";

/**
 * Both `action` and `message` are optional (we could have a no-op agent basically).
 *
 * Since `action` and `message` are bundled together, it means that we will only be able to retry
 * them together in case of error of either. We store an error only here whether it's an error
 * coming from the action or from the message generation.
 */
export type AssistantAgentMessageType = {
  id: ModelId;
  type: "agent_message";
  sId: string;
  visibility: AssistantMessageVisibility;
  version: number;
  parentMessageId: string | null;

  configuration: AgentConfigurationType;
  status: AssistantAgentMessageStatus;
  action: AssistantAgentActionType | null;
  message: string | null;
  feedbacks: AssistantUserFeedbackType[];
  error: {
    code: string;
    message: string;
  } | null;
};

export function isAgentMessageType(
  arg: UserMessageType | AssistantAgentMessageType
): arg is AssistantAgentMessageType {
  return arg.type === "agent_message";
}

/**
 * Conversations
 */

export type ConversationVisibility = "private" | "workspace";

/**
 * content [][] structure is intended to allow retries (of agent messages) or edits (of user
 * messages).
 */
export type ConversationType = {
  id: ModelId;
  created: number;
  sId: string;
  title: string | null;
  content: (UserMessageType[] | AssistantAgentMessageType[])[];
  visibility: ConversationVisibility;
};
