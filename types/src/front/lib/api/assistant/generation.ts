/**
 * Model rendering of conversations.
 */

export interface ModelMessageType {
  role: "action" | "agent" | "user" | "content_fragment";
  name: string;
  content: string;
}

export interface ModelConversationType {
  messages: ModelMessageType[];
}

export interface ImageContent {
  type: "image_url";
  image_url: {
    url: string;
  };
}

interface TextContent {
  type: "text";
  text: string;
}

type Content = TextContent | ImageContent;

export function isTextContent(content: Content): content is TextContent {
  return content.type === "text";
}

export interface ContentFragmentMessageTypeModel {
  role: "content_fragment";
  name: string;
  content: Content[];
}

export interface UserMessageTypeModel {
  role: "user";
  name: string;
  content: Content[];
}

export interface FunctionCallType {
  id: string;
  name: string;
  arguments: string;
}

export interface AssistantFunctionCallMessageTypeModel {
  role: "assistant";
  content?: string;
  function_calls: FunctionCallType[];
}

export interface AssistantContentMessageTypeModel {
  role: "assistant";
  name: string;
  content: string;
}

export interface FunctionMessageTypeModel {
  role: "function";
  name: string;
  function_call_id: string;
  content: string;
}

export type ModelMessageTypeMultiActions =
  | ContentFragmentMessageTypeModel
  | UserMessageTypeModel
  | AssistantFunctionCallMessageTypeModel
  | AssistantContentMessageTypeModel
  | FunctionMessageTypeModel;

export function isContentFragmentMessageTypeModel(
  contentFragment: ModelMessageTypeMultiActions
): contentFragment is ContentFragmentMessageTypeModel {
  return contentFragment.role === "content_fragment";
}

export type ModelConversationTypeMultiActions = {
  messages: ModelMessageTypeMultiActions[];
};

/**
 * Generation execution.
 */

// Event sent when tokens are streamed as the the agent is generating a message.
type TokensClassification = "tokens" | "chain_of_thought" | "visualization";
export type GenerationTokensEvent = {
  type: "generation_tokens";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
} & (
  | {
      classification: TokensClassification;
    }
  | {
      classification: "opening_delimiter" | "closing_delimiter";
      delimiterClassification: TokensClassification;
    }
);

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
  chainOfThought: string;
  runId: string;
};

export type GenerationCancelEvent = {
  type: "generation_cancel";
  created: number;
  configurationId: string;
  messageId: string;
};
