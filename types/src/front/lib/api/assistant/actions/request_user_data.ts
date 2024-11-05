import { RequestUserDataActionType } from "../../../../assistant/actions/request_user_data";

// Event sent before the execution with the finalized params to be used.
export type RequestUserDataParamsEvent = {
  type: "request_user_data_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: RequestUserDataActionType;
};

export type RequestUserDataSuccessEvent = {
  type: "request_user_data_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: RequestUserDataActionType;
};
