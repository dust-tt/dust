/**
 * Action execution.
 */

import { WebsearchActionType } from "../../../../assistant/actions/websearch";

// Event sent before the execution with the finalized params to be used.
export type WebsearchParamsEvent = {
  type: "websearch_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: WebsearchActionType;
};

export type WebsearchErrorEvent = {
  type: "websearch_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type WebsearchSuccessEvent = {
  type: "websearch_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: WebsearchActionType;
};
