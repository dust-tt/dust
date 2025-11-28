import { defineString } from "firebase-functions/params";

// Define environment parameters.
const gcpGlobalProjectId = defineString("GCP_GLOBAL_PROJECT_ID");
const gcpUsProjectId = defineString("GCP_US_PROJECT_ID");
const gcpEuProjectId = defineString("GCP_EU_PROJECT_ID");

export const CONFIG = {
  FETCH_TIMEOUT_MS: 10000,

  // Environment secrets.
  DUST_CONNECTORS_WEBHOOKS_SECRET: process.env.DUST_CONNECTORS_WEBHOOKS_SECRET,

  // Slack environment secrets.
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,

  // Microsoft Bot environment secrets.
  MICROSOFT_BOT_ID_SECRET: process.env.MICROSOFT_BOT_ID_SECRET,

  // Notion environment secrets.
  NOTION_SIGNING_SECRET: process.env.NOTION_SIGNING_SECRET,

  // Endpoints.
  US_CONNECTOR_URL:
    process.env.US_CONNECTOR_URL ?? "https://connectors.dust.tt",
  EU_CONNECTOR_URL:
    process.env.EU_CONNECTOR_URL ?? "https://eu.connectors.dust.tt",

  // Secret names.
  SECRET_NAME: "connectors-DUST_CONNECTORS_WEBHOOKS_SECRET",

  // Slack related secrets.
  SLACK_SIGNING_SECRET_NAME: "SLACK_SIGNING_SECRET",

  // Microsoft Bot related secrets.
  MICROSOFT_BOT_ID_SECRET_NAME: "MICROSOFT_BOT_ID_SECRET",

  // Notion related secrets.
  NOTION_SIGNING_SECRET_NAME: "NOTION_SIGNING_SECRET",

  DUST_WEBHOOK_ROUTER_CONFIG_FILE_PATH: "webhook-router-config.json",
} as const;

// Runtime getters for Firebase params.
export const getProjectIds = () => ({
  GCP_GLOBAL_PROJECT_ID: gcpGlobalProjectId.value(),
  GCP_US_PROJECT_ID: gcpUsProjectId.value(),
  GCP_EU_PROJECT_ID: gcpEuProjectId.value(),
});
