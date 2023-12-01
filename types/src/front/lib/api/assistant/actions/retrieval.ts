import {
  DataSourceConfiguration,
  RetrievalActionType,
} from "../../../../../front/assistant/actions/retrieval";

// Event sent during retrieval with the finalized query used to retrieve documents.
export type RetrievalParamsEvent = {
  type: "retrieval_params";
  created: number;
  configurationId: string;
  messageId: string;
  dataSources: "all" | DataSourceConfiguration[];
  action: RetrievalActionType;
};

export type RetrievalErrorEvent = {
  type: "retrieval_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type RetrievalSuccessEvent = {
  type: "retrieval_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: RetrievalActionType;
};
