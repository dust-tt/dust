import { defineString } from "firebase-functions/params";

// Define environment parameters.
const gcpGlobalProjectId = defineString("GCP_GLOBAL_PROJECT_ID");
const gcpUsProjectId = defineString("GCP_US_PROJECT_ID");
const gcpEuProjectId = defineString("GCP_EU_PROJECT_ID");

export const CONFIG = {
  FETCH_TIMEOUT_MS: 10000,

  // Environment secrets.
  DUST_CONNECTORS_WEBHOOKS_SECRET: process.env.DUST_CONNECTORS_WEBHOOKS_SECRET,
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,

  // Endpoints.
  US_CONNECTOR_URL: "https://connectors.dust.tt",
  EU_CONNECTOR_URL: "https://eu.connectors.dust.tt",

  // Secret names.
  SECRET_NAME: "connectors-DUST_CONNECTORS_WEBHOOKS_SECRET",
  SLACK_SIGNING_SECRET_NAME: "SLACK_SIGNING_SECRET",
} as const;

// Runtime getters for Firebase params.
export const getProjectIds = () => ({
  GCP_GLOBAL_PROJECT_ID: gcpGlobalProjectId.value(),
  GCP_US_PROJECT_ID: gcpUsProjectId.value(),
  GCP_EU_PROJECT_ID: gcpEuProjectId.value(),
});
