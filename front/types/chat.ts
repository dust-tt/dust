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

export type ChatMessageType = {
  role: "user" | "retrieval" | "assistant" | "error";
  message?: string; // for `user`, `assistant` and `error` messages, and `retrieval` messages storing a query
  retrievals?: ChatRetrievedDocumentType[]; // for `retrieval` messages
};

export type ChatSessionType = {
  id: number;
  userId: number;
  created: number;
  sId: string;
  title?: string;
  messages: ChatMessageType[];
};
