import type { APIError } from "@dust-tt/client";

import { normalizeError } from "@app/types";

/**
 * Patterns that indicate transient network errors. These errors are typically caused by
 * infrastructure issues (load balancer timeouts, connection resets, network interruptions) and
 * should not trigger alerts.
 *
 * Examples:
 * - "TypeError: terminated" - TCP connection terminated unexpectedly
 * - "Exceeded maximum reconnection attempts" - Stream reconnection exhausted
 * - "ECONNRESET" - Connection reset by peer
 */
const TRANSIENT_NETWORK_ERROR_PATTERNS = [
  /terminated/i,
  /aborted/i,
  /socket hang up/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /exceeded maximum reconnection attempts/i,
  /not connected/i,
];

/**
 * Checks if an error message matches any known transient network error pattern.
 */
function matchesTransientPattern(message: string): boolean {
  return TRANSIENT_NETWORK_ERROR_PATTERNS.some((pattern) =>
    pattern.test(message)
  );
}

/**
 * Determines if an API error is a transient network error.
 */
export function isTransientNetworkError(error: APIError): boolean {
  const message = error.message || "";
  return matchesTransientPattern(message);
}

/**
 * Determines if a stream error is a transient network error. Used for errors thrown during agent
 * stream processing.
 */
export function isTransientStreamError(error: unknown): boolean {
  const normalized = normalizeError(error);
  const message = normalized.message || "";
  return matchesTransientPattern(message);
}
