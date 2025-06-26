export const CONFIG = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 8080,
  REQUEST_SIZE_LIMIT: "1mb",
  FETCH_TIMEOUT_MS: 10000,
  SHUTDOWN_TIMEOUT_MS: 30000,

  // Project IDs.
  GCP_GLOBAL_PROJECT_ID: process.env.GCP_GLOBAL_PROJECT_ID,
  GCP_US_PROJECT_ID: process.env.GCP_US_PROJECT_ID,
  GCP_EU_PROJECT_ID: process.env.GCP_EU_PROJECT_ID,

  // Environment secrets.
  DUST_CONNECTORS_WEBHOOKS_SECRET: process.env.DUST_CONNECTORS_WEBHOOKS_SECRET,

  // Endpoints.
  US_CONNECTOR_URL: "https://connectors.dust.tt",
  EU_CONNECTOR_URL: "https://eu.connectors.dust.tt",

  // Secret names.
  SECRET_NAME: "connectors-DUST_CONNECTORS_WEBHOOKS_SECRET",
} as const;
