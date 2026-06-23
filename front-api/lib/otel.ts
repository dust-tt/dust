import { initializeOpenTelemetryInstrumentation } from "@app/lib/api/instrumentation/init";

// Register the OpenTelemetry TracerProvider + AsyncLocalStorageContextManager
// for front-api. This must run before any request is served so the per-request
// span created by the `otel` middleware propagates into Sequelize queries,
// where `SequelizeWithComments` reads the route/method to tag SQL for Cloud SQL
// Query Insights. Imported for its side effect (see server.ts).
initializeOpenTelemetryInstrumentation({ serviceName: "dust-front-api" });
