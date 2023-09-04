import { ModelId } from "@app/lib/databases";
import { UserType } from "@app/types/user";

import { RetrievalActionType } from "./actions/retrieval";

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

export type AssistantMessageStatus = "visible" | "deleted";

/**
 * User messages
 */

export type AssistantUserMessageContext = {
  username: string;
  timezone: string;
  fullName: string | null;
  email: string | null;
  profilePictureUrl: string | null;
};

export type AssistantUserMessageType = {
  id: ModelId;
  sId: string;
  status: AssistantMessageStatus;
  version: number;
  parentMessageId: string;
  user?: UserType;
  mentions: AssistantMention[];
  message: string;
  context: AssistantUserMessageContext;
};

/**
 * Agent messages
 */

export type AssistantUserFeedbackType = {
  user: UserType;
  value: "positive" | "negative" | null;
  comment: string | null;
};

export type AssistantAgentActionType = RetrievalActionType;

/**
 * Both `action` and `message` are optional (we could have a no-op agent basically).
 *
 * Since `action` and `message` are bundled together, it means that we will only be able to retry
 * them together in case of error of either. We store an error only here whether it's an error
 * coming from the action or from the message generation.
 */
export type AssistantAgentMessageType = {
  id: ModelId;
  sId: string;
  status: AssistantMessageStatus;
  version: number;
  parentMessageId: string | null;
  action: AssistantAgentActionType | null;
  message: string | null;
  feedbacks: AssistantUserFeedbackType[];
  error: {
    code: string;
    message: string;
  } | null;
};

/**
 * Conversations
 */

export type AssistantConversationVisibility = "private" | "workspace";

/**
 * content [][] structure is intended to allow retries (of agent messages) or edits (of user
 * messages).
 */
export type AssistantConversationType = {
  id: ModelId;
  created: number;
  sId: string;
  title: string | null;
  participants: UserType[];
  content: (AssistantUserMessageType[] | AssistantAgentMessageType[])[];
  visibility: AssistantConversationVisibility;
};
