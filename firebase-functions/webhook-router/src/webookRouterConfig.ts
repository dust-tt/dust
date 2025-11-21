import type { Database } from "firebase-admin/database";

export const ALL_REGIONS = ["US", "EU"] as const;
export type Region = (typeof ALL_REGIONS)[number];

type ProviderWithSigningSecret = "slack" | "notion";

type WebhookRouterConfigEntry = {
  signingSecret: string;
  regions: Region[];
};

export class WebhookRouterConfigManager {
  constructor(private client: Database) {}

  async getEntry(provider: ProviderWithSigningSecret, appId: string): Promise<WebhookRouterConfigEntry> {
    const configSnapshot = await this.client.ref(`${provider}/${appId}`).get();
    if (!configSnapshot.exists()) {
      throw new Error(`No ${provider} webhook router configuration found in database for appId ${appId}`);
    }

    const configEntry = configSnapshot.val();
    if (
      !(
        configEntry &&
        typeof configEntry.signingSecret === "string" &&
        Array.isArray(configEntry.regions) &&
        configEntry.regions.every((region: Region) => ALL_REGIONS.includes(region))
      )
    ) {
      throw new Error(`Invalid ${provider} webhook router configuration found for appId ${appId}`);
    }

    return {
      signingSecret: configEntry.signingSecret,
      regions: configEntry.regions,
    };
  }
}
