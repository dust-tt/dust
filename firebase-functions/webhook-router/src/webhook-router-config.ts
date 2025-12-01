import type { Database } from "firebase-admin/database";

export const ALL_REGIONS = ["us-central1", "europe-west1"] as const;
export type Region = (typeof ALL_REGIONS)[number];

type ProviderWithSigningSecret = "slack" | "notion";

type WebhookRouterConfigEntry = {
  signingSecret: string;
  regions: {
    [region: string]: number[];
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
  if (
    value === null ||
    typeof value !== "object" ||
    !("signingSecret" in value) ||
    typeof value.signingSecret !== "string" ||
    !("regions" in value) ||
    typeof value.regions !== "object" ||
    value.regions === null ||
    Array.isArray(value.regions)
  ) {
    return false;
  }

  // Validate each region entry
  for (const [regionKey, connectorIds] of Object.entries(value.regions)) {
    // Check region key is valid
    if (!ALL_REGIONS.includes(regionKey as Region)) {
      return false;
    }
    // Check connectorIds is an array of numbers
    if (
      !Array.isArray(connectorIds) ||
      !connectorIds.every((id) => typeof id === "number")
    ) {
      return false;
    }
  }

  return true;
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
