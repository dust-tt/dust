import type { Database } from "firebase-admin/database";

export const ALL_REGIONS = ["us-central1", "europe-west1"] as const;
export type Region = (typeof ALL_REGIONS)[number];

type ProviderWithSigningSecret = "slack" | "notion";

type WebhookRouterConfigEntry = {
  signingSecret: string;
  regions: {
    [region in Region]: number[];
  };
};

/**
 * Type guard to validate webhook router configuration entries.
 *
 * Example valid object:
 * {
 *   signingSecret: "abc123def456",
 *   regions: {
 *     "us-central1": [123, 456],
 *     "europe-west1": [789]
 *   }
 * }
 */
function isValidWebhookRouterConfigEntry(
  value: unknown
): value is WebhookRouterConfigEntry {
  return (
    value !== null &&
    typeof value === "object" &&
    "signingSecret" in value &&
    typeof value.signingSecret === "string" &&
    "regions" in value &&
    typeof value.regions === "object" &&
    value.regions !== null &&
    Object.keys(value.regions).every(
      (region: unknown) =>
        typeof region === "string" && ALL_REGIONS.includes(region as Region)
    )
  );
}

export class WebhookRouterConfigManager {
  constructor(private client: Database) {}

  async getEntry(
    provider: ProviderWithSigningSecret,
    providerWorkspaceId: string
  ): Promise<WebhookRouterConfigEntry> {
    const configSnapshot = await this.client
      .ref(`${provider}/${providerWorkspaceId}`)
      .get();
    if (!configSnapshot.exists()) {
      throw new Error(
        `No ${provider} webhook router configuration found in database for providerWorkspaceId ${providerWorkspaceId}`
      );
    }

    const configEntry = configSnapshot.val();
    if (!isValidWebhookRouterConfigEntry(configEntry)) {
      throw new Error(
        `Invalid ${provider} webhook router configuration found for providerWorkspaceId ${providerWorkspaceId}`
      );
    }

    return {
      signingSecret: configEntry.signingSecret,
      regions: configEntry.regions,
    };
  }
}
