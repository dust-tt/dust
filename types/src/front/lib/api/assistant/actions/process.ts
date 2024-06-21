/**
 * Action execution.
 */

import { ProcessActionType } from "../../../../../front/assistant/actions/process";
import { DataSourceConfiguration } from "../../../../../front/assistant/actions/retrieval";

// Event sent before the execution with the finalized params to be used.
export type ProcessParamsEvent = {
  type: "process_params";
  created: number;
  configurationId: string;
  messageId: string;
  dataSources: DataSourceConfiguration[];
  action: ProcessActionType;
};

export type ProcessErrorEvent = {
  type: "process_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type ProcessSuccessEvent = {
  type: "process_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: ProcessActionType;
};
