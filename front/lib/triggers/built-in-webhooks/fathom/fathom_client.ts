import { Fathom } from "fathom-typescript";
import { FathomError } from "fathom-typescript/sdk/models/errors";
import type {
  TriggeredFor,
  Webhook,
} from "fathom-typescript/sdk/models/shared";

import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export type FathomWebhookConfig = {
  destinationUrl: string;
  triggeredFor: TriggeredFor[];
  includeTranscript?: boolean;
  includeSummary?: boolean;
  includeActionItems?: boolean;
  includeCrmMatches?: boolean;
};

export class FathomClient {
  private client: Fathom;

  constructor(accessToken: string) {
    this.client = new Fathom({
      security: {
        bearerAuth: accessToken,
      },
    });
  }

  async createWebhook(
    config: FathomWebhookConfig
  ): Promise<Result<Webhook, FathomError | Error>> {
    let webhook: Webhook | undefined;
    try {
      webhook = await this.client.createWebhook({
        destinationUrl: config.destinationUrl,
        triggeredFor: config.triggeredFor,
        includeTranscript: config.includeTranscript,
        includeSummary: config.includeSummary,
        includeActionItems: config.includeActionItems,
        includeCrmMatches: config.includeCrmMatches,
      });
    } catch (error) {
      if (error instanceof FathomError) {
        return new Err(error);
      }
      throw error;
    }

    if (!webhook) {
      return new Err(new Error("Failed to create webhook: no response"));
    }

    return new Ok(webhook);
  }

  async deleteWebhook(webhookId: string): Promise<Result<void, FathomError>> {
    try {
      await this.client.deleteWebhook({ id: webhookId });
    } catch (error) {
      logger.error({ error, webhookId }, "Error deleting Fathom webhook");
      if (error instanceof FathomError) {
        return new Err(error);
      }
      throw error;
    }

    return new Ok(undefined);
  }

  static verifyWebhook({
    secret,
    headers,
    body,
  }: {
    secret: string;
    headers: Record<string, string>;
    body: string;
  }): Result<void, Error> {
    try {
      Fathom.verifyWebhook(secret, headers, body);
      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }
}
