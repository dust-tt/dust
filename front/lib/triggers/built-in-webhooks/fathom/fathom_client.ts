import { Fathom } from "fathom-typescript";
import type { Webhook } from "fathom-typescript/sdk/models/shared";

import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export type FathomWebhookConfig = {
  destinationUrl: string;
  triggeredFor: (
    | "my_recordings"
    | "shared_external_recordings"
    | "my_shared_with_team_recordings"
    | "shared_team_recordings"
  )[];
  includeTranscript?: boolean;
  includeSummary?: boolean;
  includeActionItems?: boolean;
  includeCrmMatches?: boolean;
};

export class FathomClient {
  private client: Fathom;

  constructor(apiKey: string) {
    this.client = new Fathom({
      security: {
        apiKeyAuth: apiKey,
      },
    });
  }

  async createWebhook(
    config: FathomWebhookConfig
  ): Promise<Result<Webhook, Error>> {
    try {
      if (config.triggeredFor.length === 0) {
        return new Err(
          new Error(
            "At least one value must be specified in triggeredFor array"
          )
        );
      }

      const hasContent =
        (config.includeTranscript ?? false) ||
        (config.includeSummary ?? false) ||
        (config.includeActionItems ?? false) ||
        (config.includeCrmMatches ?? false);

      if (!hasContent) {
        return new Err(
          new Error(
            "At least one of includeTranscript, includeSummary, includeActionItems, or includeCrmMatches must be true"
          )
        );
      }

      const webhook = await this.client.createWebhook({
        destinationUrl: config.destinationUrl,
        triggeredFor: config.triggeredFor,
        includeTranscript: config.includeTranscript,
        includeSummary: config.includeSummary,
        includeActionItems: config.includeActionItems,
        includeCrmMatches: config.includeCrmMatches,
      });

      if (!webhook) {
        return new Err(new Error("Failed to create webhook: no response"));
      }

      return new Ok(webhook);
    } catch (error) {
      logger.error({ error }, "Error creating Fathom webhook");
      return new Err(normalizeError(error));
    }
  }

  async deleteWebhook(webhookId: string): Promise<Result<void, Error>> {
    try {
      await this.client.deleteWebhook({ id: webhookId });
      return new Ok(undefined);
    } catch (error) {
      logger.error({ error, webhookId }, "Error deleting Fathom webhook");
      return new Err(normalizeError(error));
    }
  }
}
