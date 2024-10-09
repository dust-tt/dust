import { TablesQueryActionType } from "../../../../../front/assistant/actions/tables_query";

export type TablesQueryErrorEvent = {
  type: "tables_query_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: "tables_query_error" | "too_many_result_rows";
    message: string;
  };
};

export type TablesQueryStartedEvent = {
  type: "tables_query_started";
  created: number;
  configurationId: string;
  messageId: string;
  action: TablesQueryActionType;
};

export type TablesQueryModelOutputEvent = {
  type: "tables_query_model_output";
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
