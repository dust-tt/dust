import { RequestUserDataActionType } from "../../../../assistant/actions/request_user_data";

// Event sent before the execution with the finalized params to be used.
export type RequestUserDataParamsEvent = {
  type: "request_user_data_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: RequestUserDataActionType;
};

export type RequestUserDataErrorEvent = {
  type: "request_user_data_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type RequestUserDataSuccessEvent = {
  type: "request_user_data_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: RequestUserDataActionType;
};
