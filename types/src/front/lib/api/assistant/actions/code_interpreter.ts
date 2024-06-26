/**
 * Action execution.
 */

import { CodeInterpreterActionType } from "../../../../../front/assistant/actions/code_interpreter";

// Event sent before the execution with the finalized params to be used.
export type CodeInterpreterParamsEvent = {
  type: "code_interpreter_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: CodeInterpreterActionType;
};

export type CodeInterpreterErrorEvent = {
  type: "code_interpreter_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type CodeInterpreterSuccessEvent = {
  type: "code_interpreter_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: CodeInterpreterActionType;
};
