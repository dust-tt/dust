import { TimeRangeId } from "@app/components/use/ChatTimeRangePicker";

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

export type ChatQueryType = {
  text: string;
  timeRangeId: TimeRangeId;
};

export type ChatMessageType = {
  role: "user" | "retrieval" | "assistant" | "error";
  message?: string; // for `user`, `assistant` and `error` messages
  retrievals?: ChatRetrievedDocumentType[]; // for `retrieval` messages
  query?: ChatQueryType; // for `retrieval` messages (not persisted)
};

export type ChatSessionType = {
  id: number;
  userId: number;
  created: number;
  sId: string;
  title?: string;
  messages: ChatMessageType[];
};
