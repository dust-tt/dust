import type { DustError } from "../errors";
import type { LoggerInterface } from "../types";
import type { PartialMessageContext } from "./context";
import type { RetryOptions } from "./retry";

export interface DustAPIOptions {
  workspaceId: string;
  apiKey: string | (() => string | null | Promise<string | null>);
  baseUrl?: string;
  logger?: LoggerInterface;
  retry?: Partial<RetryOptions>;
  timeout?: number;
  extraHeaders?: Record<string, string>;
  autoApproveTools?: boolean;
}

export interface SendMessageParams {
  agentId: string;
  message: string;
  conversationId?: string;
  attachments?: AttachmentInput[];
  context?: PartialMessageContext;
  mcpServerIds?: string[];
  signal?: AbortSignal;
  skipToolsValidation?: boolean;
}

export interface SendMessageOptions {
  maxRetries?: number;
}

export type AttachmentInput =
  | File
  | Blob
  | { fileId: string }
  | { path: string; name?: string };

export function isFileIdAttachment(
  attachment: AttachmentInput
): attachment is { fileId: string } {
  return "fileId" in attachment;
}

export function isFilePathAttachment(
  attachment: AttachmentInput
): attachment is { path: string; name?: string } {
  return "path" in attachment;
}

export interface AgentResponse {
  text: string;
  conversationId: string;
  messageId: string;
  agentMessageId: string;
  actions: AgentAction[];
  chainOfThought?: string;
  rawContents?: RawContent[];
  usage?: UsageInfo;
}

export interface AgentAction {
  id: string;
  type: string;
  toolName: string;
  input: unknown;
  output: unknown;
  status: "success" | "error" | "blocked";
  error?: string;
}

export interface RawContent {
  type: string;
  content: unknown;
}

export interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export type StreamMessageParams = SendMessageParams;

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "chainOfThought"; delta: string }
  | { type: "action"; action: AgentAction }
  | { type: "toolApprovalRequired"; approval: ToolApproval }
  | { type: "uploadProgress"; progress: UploadProgress }
  | { type: "error"; error: DustError }
  | { type: "done"; response: AgentResponse };

interface StreamEventHandlerMap {
  text: (delta: string) => void;
  chainOfThought: (delta: string) => void;
  action: (action: AgentAction) => void;
  toolApprovalRequired: (approval: ToolApproval) => Promise<boolean> | boolean;
  uploadProgress: (progress: UploadProgress) => void;
  error: (error: DustError) => void;
  done: (response: AgentResponse) => void;
}

export type StreamEventHandler<E extends StreamEvent["type"]> =
  StreamEventHandlerMap[E];

export interface ToolApproval {
  messageId: string;
  actionId: string;
  toolName: string;
  serverName: string;
  input: unknown;
  description: string;
  approve(): Promise<void>;
  reject(): Promise<void>;
}

export interface UploadProgress {
  fileName: string;
  uploaded: number;
  total: number;
  fileIndex: number;
  totalFiles: number;
}

export interface MessageStream extends AsyncIterable<StreamEvent> {
  on<E extends StreamEvent["type"]>(
    event: E,
    handler: StreamEventHandler<E>
  ): this;
  finalMessage(): Promise<AgentResponse>;
  abort(): void;
  readonly text: string;
  readonly chainOfThought: string;
  readonly actions: AgentAction[];
  readonly conversationId: string | null;
  readonly messageId: string | null;
}

export interface CreateConversationParams {
  title?: string | null;
  visibility?: "unlisted" | "workspace";
  agentId?: string;
}

export interface ConversationInfo {
  id: string;
  title: string | null;
  visibility: string;
  created: number;
  updated: number;
}

export interface FileInfo {
  id: string;
  name: string;
  contentType: string;
  size: number;
  uploadedAt: number;
}
