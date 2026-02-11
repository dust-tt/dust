/**
 * Message and event types for the local agent loop.
 * Uses Dust internal message format (matches front/types/assistant/generation.ts).
 */

// Content types for user messages.
export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image_url";
  image_url: { url: string };
}

export type Content = TextContent | ImageContent;

// Function call (used in assistant messages).
export interface FunctionCallType {
  id: string;
  name: string;
  arguments: string;
}

// Agent content items (used in assistant message `contents` array).
export interface AgentTextContent {
  type: "text_content";
  value: string;
}

export interface AgentFunctionCallContent {
  type: "function_call";
  value: FunctionCallType;
}

export type AgentContentItem = AgentTextContent | AgentFunctionCallContent;

// Message types (one interface per role).
export interface UserMessage {
  role: "user";
  name: string;
  content: Content[];
}

export interface AssistantFunctionCallMessage {
  role: "assistant";
  function_calls: FunctionCallType[];
  contents: AgentContentItem[];
}

export interface AssistantContentMessage {
  role: "assistant";
  name: string;
  contents: AgentContentItem[];
}

export interface FunctionMessage {
  role: "function";
  name: string;
  function_call_id: string;
  content: string;
}

export type DustMessage =
  | UserMessage
  | AssistantFunctionCallMessage
  | AssistantContentMessage
  | FunctionMessage;

// Tool call info from SSE events (parsed, not wire format).
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// Tool definition sent to the proxy.
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// Events yielded by the agent loop to the UI.

export interface TextDeltaAgentEvent {
  type: "text_delta";
  text: string;
}

export interface ThinkingDeltaAgentEvent {
  type: "thinking_delta";
  text: string;
}

export interface ToolUseAgentEvent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolExecutingAgentEvent {
  type: "tool_executing";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultAgentEvent {
  type: "tool_result";
  id: string;
  name: string;
  result: string;
}

export interface AwaitInputAgentEvent {
  type: "await_input";
}

export interface DoneAgentEvent {
  type: "done";
  stopReason: string;
}

export interface ErrorAgentEvent {
  type: "error";
  message: string;
  retryable?: boolean;
}

export interface UsageAgentEvent {
  type: "usage";
  inputTokens: number;
  outputTokens: number;
}

export type AgentEvent =
  | TextDeltaAgentEvent
  | ThinkingDeltaAgentEvent
  | ToolUseAgentEvent
  | ToolExecutingAgentEvent
  | ToolResultAgentEvent
  | AwaitInputAgentEvent
  | DoneAgentEvent
  | ErrorAgentEvent
  | UsageAgentEvent;
