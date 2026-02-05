/**
 * Dust SDK Error Types
 *
 * This module exports all typed error classes for the high-level SDK API.
 */

export {
  DustError,
  DustAuthenticationError,
  DustRateLimitError,
  DustValidationError,
  DustAgentError,
  DustNetworkError,
  DustCancelledError,
  DustTimeoutError,
  DustNotFoundError,
  DustPermissionError,
  DustServerError,
  DustContentTooLargeError,
  DustUnknownError,
  apiErrorToDustError,
  isDustError,
  isRetryableError,
} from "./errors";

export type { DustErrorType, DustErrorCode } from "./errors";
