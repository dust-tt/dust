import { initializeOpenTelemetryInstrumentation } from "@app/lib/api/instrumentation/init";

initializeOpenTelemetryInstrumentation({ serviceName: "dust-front" });
