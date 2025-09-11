import { z } from "zod";

// Minimal ConnectorProvider type needed for internal_mime_types
export const CONNECTOR_PROVIDERS = [
  "confluence",
  "github", 
  "google_drive",
  "intercom",
  "notion",
  "slack",
  "microsoft",
  "webcrawler",
  "snowflake",
  "zendesk",
  "salesforce",
  "gong",
  "bigquery",
] as const;

export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export const ConnectorProvidersSchema = z.enum(CONNECTOR_PROVIDERS);

export const isConnectorProvider = (
  provider: string
): provider is ConnectorProvider =>
  ConnectorProvidersSchema.safeParse(provider).success;