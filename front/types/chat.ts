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
  runRetrieval?: boolean;
  runAssistant?: boolean;
  message?: string; // for `user`, `assistant` and `error` messages
  retrievals?: ChatRetrievedDocumentType[]; // for `retrieval` messages
};

export type ChatSessionType = {
  id: number;
  uId: string;
  sId: string;
  title?: string;
  messages?: ChatMessageType[];
};
