// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DDRum = { addError?: (error: unknown, context?: any) => void };

/**
 * Send an error to Datadog RUM if available (never throws).
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
}
