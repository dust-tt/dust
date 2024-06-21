import { BrowseActionType } from "../../../../assistant/actions/browse";

// Event sent before the execution with the finalized params to be used.
export type BrowseParamsEvent = {
  type: "browse_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: BrowseActionType;
};

export type BrowseErrorEvent = {
  type: "browse_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type BrowseSuccessEvent = {
  type: "browse_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: BrowseActionType;
};
