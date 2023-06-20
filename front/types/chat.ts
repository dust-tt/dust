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
  role: "user" | "retrieval" | "assistant" | "error" | "function";
  name?: string; // for `function` messages
  function_call?: string; // for `function` messages
  content?: any; // for `function` responses
  message?: string; // for `user`, `assistant` and `error` messages
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
