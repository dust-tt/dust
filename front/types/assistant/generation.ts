import type {
  AgentContentItemType,
  AgentErrorContentType,
} from "@app/types/assistant/agent_message_content";
import type { ReasoningEffortDirection } from "@app/types/assistant/models/reasoning";
import type { ReasoningEffort } from "@app/types/assistant/models/types";

/**
 * Model rendering of conversations.
 */

export interface ImageContent {
  type: "image_url";
  image_url: {
    url: string;
  };
}

export interface TextContent {
  type: "text";
  text: string;
}

export type Content = TextContent | ImageContent;

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
  arguments: string; // Empty is not valid, should be at least "{}"
  namespace?: string;
  metadata?: { thoughtSignature?: string };
}

// Assistant requiring usage of function(s) call(s)
export interface AssistantFunctionCallMessageTypeModel {
  role: "assistant";
  /** @deprecated, use contents instead. */
  content?: string;
  /** @deprecated, use contents instead. */
  function_calls: FunctionCallType[];
  contents: Array<Exclude<AgentContentItemType, AgentErrorContentType>>;
}

export interface AssistantContentMessageTypeModel {
  role: "assistant";
  name: string;
  /** @deprecated, use contents instead. */
  content?: string;
  contents: Array<Exclude<AgentContentItemType, AgentErrorContentType>>;
}

// This is the output of one function call
export interface FunctionMessageTypeModel {
  role: "function";
  name: string;
  function_call_id: string;
  content: string | Content[];
}

// Compaction summary rendered as a history boundary for the model.
export interface CompactionMessageTypeModel {
  role: "compaction";
  content: string;
}

// Reasoning effort change the agent requested, rendered after the step that requested it. Applies
// from the next user message on, on models that support per-message effort. Rendered with a null
// `effort`: the agent loop resolves it against the run's effort, and unresolved changes are not
// sent to the model.
export interface EffortChangeMessageTypeModel {
  role: "effort_change";
  direction: ReasoningEffortDirection;
  steps: number;
  effort: ReasoningEffort | null;
}

export type ModelMessageTypeMultiActionsWithoutContentFragment =
  | UserMessageTypeModel
  | AssistantFunctionCallMessageTypeModel
  | AssistantContentMessageTypeModel
  | FunctionMessageTypeModel
  | CompactionMessageTypeModel
  | EffortChangeMessageTypeModel;

export type ModelMessageTypeMultiActions =
  | ModelMessageTypeMultiActionsWithoutContentFragment
  | ContentFragmentMessageTypeModel;

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
  // Identifies the specific LLM call that produced this event. Changes on
  // Temporal activity retries so the client can detect retry boundaries.
  traceId?: string;
} & (
  | {
      classification: TokensClassification;
    }
  | {
      classification: "opening_delimiter" | "closing_delimiter";
      delimiterClassification: TokensClassification;
    }
);
