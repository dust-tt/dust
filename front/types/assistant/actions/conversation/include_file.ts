import type { ModelId } from "../../../shared/model_id";
import type { BaseAction } from "../index";

export type ConversationIncludeFileConfigurationType = {
  id: ModelId;
  sId: string;

  type: "conversation_include_file_configuration";

  name: string;
  description: string | null;
};

export interface ConversationIncludeFileActionType extends BaseAction {
  agentMessageId: ModelId;
  params: {
    fileId: string;
  };
  tokensCount: number | null;
  fileTitle: string | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "conversation_include_file_action";
}

/**
 * ConversationIncludeFile Action Events
 */

// Event sent before running the action with the finalized params to be used.
export type ConversationIncludeFileParamsEvent = {
  type: "conversation_include_file_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: ConversationIncludeFileActionType;
};

export type ConversationIncludeFileSuccessEvent = {
  type: "conversation_include_file_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: ConversationIncludeFileActionType;
};

export type ConversationIncludeFileErrorEvent = {
  type: "conversation_include_file_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};
