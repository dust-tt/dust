/**
 * Model rendering of conversations.
 */

export type ModelMessageType = {
  role: "action" | "agent" | "user" | "content_fragment";
  name: string;
  content: string;
};

export type ModelConversationType = {
  messages: ModelMessageType[];
};

export type ContentFragmentMessageTypeModel = {
  role: "content_fragment";
  name: string;
  content: string;
};

export type UserMessageTypeModel = {
  role: "user";
  name: string;
  content: string;
};

export type FunctionCallType = {
  id: string;
  name: string;
  arguments: string;
};

export type AssistantFunctionCallMessageTypeModel = {
  role: "assistant";
  content?: string;
  function_calls: FunctionCallType[];
};
export type AssistantContentMessageTypeModel = {
  role: "assistant";
  name: string;
  content: string;
};

export type FunctionMessageTypeModel = {
  role: "function";
  function_call_id: string;
  content: string;
};

export type ModelMessageTypeMultiActions =
  | ContentFragmentMessageTypeModel
  | UserMessageTypeModel
  | AssistantFunctionCallMessageTypeModel
  | AssistantContentMessageTypeModel
  | FunctionMessageTypeModel;

export type ModelConversationTypeMultiActions = {
  messages: ModelMessageTypeMultiActions[];
};

/**
 * Generation execution.
 */

// Event sent when tokens are streamed as the the agent is generating a message.
export type GenerationTokensEvent = {
  type: "generation_tokens";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
};

export type GenerationErrorEvent = {
  type: "generation_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type GenerationSuccessEvent = {
  type: "generation_success";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
};

export type GenerationCancelEvent = {
  type: "generation_cancel";
  created: number;
  configurationId: string;
  messageId: string;
};
