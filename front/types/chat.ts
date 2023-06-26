export type ChatRetrievedDocumentType = {
  dataSourceId: string;
  sourceUrl: string;
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

export type MessageFeedbackStatus = "positive" | "negative" | undefined;

export type ChatMessageType = {
  role: "user" | "retrieval" | "assistant" | "error";
  message?: string; // for `user`, `assistant` and `error` messages
  retrievals?: ChatRetrievedDocumentType[]; // for `retrieval` messages
  query?: string; // for `retrieval` messages (not persisted)
  feedback?: MessageFeedbackStatus;
};

export type ChatSessionType = {
  id: number;
  userId: number;
  created: number;
  sId: string;
  title?: string;
  messages: ChatMessageType[];
};
