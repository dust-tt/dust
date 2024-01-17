import { TablesQueryActionType } from "../../../../../front/assistant/actions/tables_query";

export type TablesQueryErrorEvent = {
  type: "tables_query_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type TablesQuerySuccessEvent = {
  type: "tables_query_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: TablesQueryActionType;
};

export type TablesQueryParamsEvent = {
  type: "tables_query_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: TablesQueryActionType;
};

export type TablesQueryOutputEvent = {
  type: "tables_query_output";
  created: number;
  configurationId: string;
  messageId: string;
  action: TablesQueryActionType;
};
