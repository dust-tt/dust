/**
 * High-Level SDK API
 *
 * This module provides a convenience wrapper layer on top of the low-level
 * DustAPI client. It reduces common operations from ~100 lines to ~10 lines
 * while maintaining full backward compatibility.
 */

// API Classes
export { AgentsAPI } from "./agents";
export { ConversationsAPI } from "./conversations";
export { FilesAPI } from "./files";

// Streaming
export { MessageStreamImpl } from "./stream";

// Retry utilities
export {
  withRetry,
  createRetry,
  sleep,
  DEFAULT_RETRY_OPTIONS,
} from "./retry";
export type { RetryOptions, WithRetryOptions } from "./retry";

// Context utilities
export { buildContext } from "./context";
export type { MessageContext, PartialMessageContext } from "./context";

// Types
export type {
  // Client options
  DustAPIOptions,
  // Send message
  SendMessageParams,
  SendMessageOptions,
  AttachmentInput,
  // Responses
  AgentResponse,
  AgentAction,
  RawContent,
  UsageInfo,
  // Streaming
  StreamMessageParams,
  StreamEvent,
  StreamEventHandler,
  MessageStream,
  ToolApproval,
  UploadProgress,
  // Conversations
  CreateConversationParams,
  ConversationInfo,
  // Files
  FileInfo,
} from "./types";

// Type guards
export { isFileIdAttachment, isFilePathAttachment } from "./types";
