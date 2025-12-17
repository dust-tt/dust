// Next.js instrumentation hook that sets up OpenTelemetry for observability and tracing.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}
