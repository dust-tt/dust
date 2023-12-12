import { DatabaseQueryActionType } from "front/assistant/actions/database_query";

export type DatabaseQueryRunErrorEvent = {
  type: "database_query_run_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type DatabaseQueryRunSuccessEvent = {
  type: "database_query_run_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: DatabaseQueryActionType;
};
