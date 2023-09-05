import { ModelId } from "@app/lib/databases";

export type ChatRetrievedDocumentType = {
  dataSourceId: string;
  sourceUrl: string | null;
  documentId: string;
  timestamp: string;
  tags: string[];
  score: number;
  chunks: {
    text: string;
    offset: number;
    score: number;
  }[];
};

export type MessageFeedbackStatus = "positive" | "negative" | null;

export type MessageRole = "user" | "retrieval" | "assistant" | "error";
export type ChatMessageType = {
  sId: string;
  role: MessageRole;
  message: string | null; // for `user`, `assistant` and `error` messages
  retrievals: ChatRetrievedDocumentType[] | null; // for `retrieval` messages
  params: {
    // for `retrieval` messages (not persisted)
    query: string;
    minTimestamp: number; // timestamp in ms, 0 if
  } | null;
  feedback: MessageFeedbackStatus | null;
};

export type ChatSessionType = {
  id: ModelId;
  userId: ModelId | null;
  created: number;
  sId: string;
  title: string | null;
  messages: ChatMessageType[] | null;
  visibility: ChatSessionVisibility;
};

export type ChatSessionVisibility = "private" | "workspace";
