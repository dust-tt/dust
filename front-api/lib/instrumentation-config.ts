import { initializeOpenTelemetryInstrumentation } from "@app/lib/api/instrumentation/init";

// Initialize OpenTelemetry / Langfuse instrumentation for the front-api process.
// Without this, any `startActiveObservation` created while handling an HTTP
// request has no registered OTEL SDK / span processor, so the root spans are
// dropped and Langfuse traces only "begin" once they reach the agent-loop
// worker (which initializes its own instrumentation).
initializeOpenTelemetryInstrumentation({ serviceName: "dust-front" });
