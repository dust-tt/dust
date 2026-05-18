const DEFAULT_THROTTLE_RETRY_AFTER_MS = 60_000;

export class MicrosoftThrottlingError extends Error {
  constructor(
    readonly endpoint: string,
    readonly retryAfterMs: number
  ) {
    super(
      `Microsoft Graph API throttled request to ${endpoint}. Retry after ${retryAfterMs}ms.`
    );
    this.name = "MicrosoftThrottlingError";
  }
}

export function getMicrosoftThrottleRetryAfterMs(
  retryAfterHeader: string | null | undefined
): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(seconds)) {
      return seconds * 1000;
    }
  }
  return DEFAULT_THROTTLE_RETRY_AFTER_MS;
}
