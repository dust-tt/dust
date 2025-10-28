import type {
  AgentContent,
  ErrorContent,
} from "@app/types/assistant/agent_message_content";

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
  value: {
    image_url: string;
  };
}

export interface TextContent {
  type: "text_content";
  value: string;
}

export type UserContent = TextContent | ImageContent;

export function isTextContent(content: object): content is TextContent {
  return "text" in content && "type" in content && content.type === "text";
}

export function isImageContent(content: object): content is ImageContent {
  return (
    "image_url" in content && "type" in content && content.type === "image_url"
  );
}

export interface ContentFragmentMessageTypeModel {
  role: "content_fragment";
  name: string;
  content: UserContent[];
}

export interface UserMessageTypeModel {
  role: "user";
  name: string;
  content: UserContent[];
}
export interface FunctionCallType {
  id: string;
  name: string;
  arguments: string; // Empty is not valid, should be at least "{}"
}

// Assistant requiring usage of function(s) call(s)
export interface AssistantMessageTypeModel {
  role: "assistant";
  name: string;
  /** @deprecated, use contents instead. */
  content?: string;
  /** @deprecated, use contents instead. */
  function_calls: FunctionCallType[];
  contents: Exclude<AgentContent, ErrorContent>[];
}

// This is the output of one function call
export interface FunctionMessageTypeModel {
  role: "function";
  name: string;
  function_call_id: string;
  content: string | UserContent[];
}

export type ModelMessageTypeMultiActionsWithoutContentFragment =
  | UserMessageTypeModel
  | AssistantMessageTypeModel
  | FunctionMessageTypeModel;

export type ModelMessageTypeMultiActions =
  | ModelMessageTypeMultiActionsWithoutContentFragment
  | ContentFragmentMessageTypeModel;

export function isContentFragmentMessageTypeModel(
  contentFragment: ModelMessageTypeMultiActions
): contentFragment is ContentFragmentMessageTypeModel {
  return contentFragment.role === "content_fragment";
}

export type ModelConversationTypeMultiActions = {
  messages: ModelMessageTypeMultiActionsWithoutContentFragment[];
};

/**
 * Generation execution.
 */

// Event sent when tokens are streamed as the the agent is generating a message.
export type TokensClassification = "tokens" | "chain_of_thought";
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
