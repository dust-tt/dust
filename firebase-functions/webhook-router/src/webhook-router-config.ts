import type { Database } from "firebase-admin/database";
import { z } from "zod";

export const ALL_CELLS = ["cell-00000", "cell-00001"] as const;
export type Cell = (typeof ALL_CELLS)[number];

type ProviderWithSigningSecret = "slack" | "notion";

// Unknown keys (e.g. legacy `regions`) are stripped by Zod's default object behavior.
const WebhookRouterEntrySchema = z.object({
  signingSecret: z.string(),
  cells: z.record(z.enum(ALL_CELLS), z.array(z.number())),
});

const WebhookRouterConfigSchema = z.record(
  z.enum(["slack", "notion"]),
  z.record(z.string(), WebhookRouterEntrySchema)
);

export type WebhookRouterConfigEntry = z.infer<typeof WebhookRouterEntrySchema>;
type WebhookRouterConfig = z.infer<typeof WebhookRouterConfigSchema>;

export function normalizeWebhookRouterConfig(
  raw: unknown
): WebhookRouterConfig {
  return WebhookRouterConfigSchema.parse(raw);
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

    const parsedEntry = WebhookRouterEntrySchema.safeParse(
      configSnapshot.val()
    );
    if (!parsedEntry.success) {
      throw new Error(
        `Invalid ${provider} webhook router configuration found for providerWorkspaceId ${providerWorkspaceId}`
      );
    }

    return parsedEntry.data;
  }
}
