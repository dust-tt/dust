import { ModelId } from "@app/lib/models";
import { UserProviderType, UserType } from "@app/types/user";

/**
 * Mentions
 */

export type AssistantAgentMention = {
  assistantId: string;
};

export type AssistantUserMention = {
  provider: UserProviderType;
  providerId: string;
};

export type AssistantMention = AssistantAgentMention | AssistantUserMention;

/**
 * User messages
 */

export type AssistantUserMessageType = {
  id: ModelId;
  sId: string;
  status: "visible" | "deleted";
  parentMessageId: string;
  user?: UserType;
  mentions: AssistantMention[];
  message: string;
  context: {
    username: string;
    timezone: string;
    fullName?: string;
    email?: string;
    profilePictureUrl?: string;
  };
};

/**
 * Retrieval action
 */

export type RetrievalDocumentType = {
  id: ModelId;
  dataSourceId: string;
  sourceUrl?: string;
  documentId: string;
  timestamp: number;
  tags: string[];
  score: number;
  chunks: {
    text: string;
    offset: number;
    score: number;
  }[];
};

export type RetrievalActionType = {
  id: ModelId;
  params: {
    query: string;
  };
  documents: RetrievalDocumentType[];
};

/**
 * Agent messages
 */

export type AssistantUserFeedbackType = {
  user: UserType;
  value: "positive" | "negative" | null;
  comment?: string;
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
  status: "visible" | "deleted";
  parentMessageId: string;
  action?: AssistantAgentActionType;
  message?: string;
  feedbacks: AssistantUserFeedbackType[];
  error?: {
    code: string;
    message: string;
  };
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
  title?: string;
  participants: UserType[];
  content: (AssistantUserMessageType[] | AssistantAgentMessageType[])[];
  visibility: AssistantConversationVisibility;
};
