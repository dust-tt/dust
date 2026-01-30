import type {
  AgentActionPublicType,
  AgentMentionType,
  AgentMessagePublicType,
  ConversationVisibility,
  MentionType,
  UploadedContentFragmentType,
  UserMessageType,
} from "../types";
import type { LoggerInterface } from "../types";
import type { DustAPIError } from "./errors";
import type { RetryOptions } from "./retry";

export type MessageContext = UserMessageType["context"];

export type AttachmentInput = File | UploadedContentFragmentType;

export interface StreamReconnectOptions {
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
  autoReconnect?: boolean;
}

export interface SendMessageParams {
  agentId: string;
  message: string;
  conversationId?: string;
  context?: Partial<MessageContext>;
  attachments?: AttachmentInput[];
  mentions?: MentionType[] | AgentMentionType[];
  mcpServerIds?: string[];
  visibility?: ConversationVisibility;
  title?: string | null;
  skipToolsValidation?: boolean;
}

export interface SendMessageOptions extends RetryOptions {
  signal?: AbortSignal;
  pollIntervalMs?: number;
  maxWaitForAgentMessageMs?: number;
  streamOptions?: StreamReconnectOptions;
}

export type StreamMessageOptions = SendMessageOptions;

export interface AgentResponse {
  text: string;
  conversationId: string;
  userMessageId: string;
  messageId?: string;
  actions: AgentActionPublicType[];
  chainOfThought?: string;
  message?: AgentMessagePublicType;
}

export type AgentStreamEvent =
  | { type: "text"; delta: string }
  | { type: "chainOfThought"; delta: string }
  | { type: "action"; action: AgentActionPublicType }
  | { type: "error"; error: DustAPIError }
  | { type: "complete"; message: AgentResponse };

export interface DustAPIOptions {
  workspaceId: string;
  apiKey?: string | (() => string | null | Promise<string | null>);
  url?: string;
  urlOverride?: string | null;
  logger?: LoggerInterface;
  extraHeaders?: Record<string, string>;
  maxRetries?: number;
  retryDelay?: RetryOptions["retryDelay"];
}
