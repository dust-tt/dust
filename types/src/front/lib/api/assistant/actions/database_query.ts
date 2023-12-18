import { DatabaseQueryActionType } from "front/assistant/actions/database_query";

export type DatabaseQueryErrorEvent = {
  type: "database_query_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type DatabaseQuerySuccessEvent = {
  type: "database_query_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: DatabaseQueryActionType;
};

export type DatabaseQueryParamsEvent = {
  type: "database_query_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: DatabaseQueryActionType;
};
