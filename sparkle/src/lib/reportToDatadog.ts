// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DDRum = { addError?: (error: unknown, context?: any) => void };
type DDLogs = {
  logger?: {
    error?: (message: string, context?: Record<string, unknown>) => void;
  };
};

/**
 * Send an error to Datadog RUM and Datadog Logs if available (never throws).
 *
 * Uses window globals (DD_RUM, DD_LOGS) so sparkle doesn't need to depend
 * on @datadog/browser-rum or @datadog/browser-logs.
 */
export function reportToDatadog(
  error: unknown,
  context: Record<string, unknown>
) {
  try {
    const ddRum = (window as unknown as { DD_RUM?: DDRum }).DD_RUM;
    ddRum?.addError?.(error, context);
  } catch {
    // Fail-safe: Datadog may not be loaded yet.
  }

  try {
    const ddLogs = (window as unknown as { DD_LOGS?: DDLogs }).DD_LOGS;
    const message = error instanceof Error ? error.message : String(error);
    ddLogs?.logger?.error?.(message, context);
  } catch {
    // Fail-safe: Datadog Logs may not be initialized.
  }
}
