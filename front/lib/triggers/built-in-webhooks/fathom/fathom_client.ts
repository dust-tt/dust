import type {
  FathomWebhookType,
} from "@app/lib/triggers/built-in-webhooks/fathom/fathom_api_types";
import {
  FathomWebhookSchema,
  validateFathomApiResponse,
} from "@app/lib/triggers/built-in-webhooks/fathom/fathom_api_types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

const FATHOM_API_BASE_URL = "https://api.fathom.ai/external/v1";

export type FathomWebhookConfig = {
  destination_url: string;
  triggered_for: (
    | "my_recordings"
    | "shared_external_recordings"
    | "my_shared_with_team_recordings"
    | "shared_team_recordings"
  )[];
  include_transcript?: boolean;
  include_summary?: boolean;
  include_action_items?: boolean;
  include_crm_matches?: boolean;
};

export class FathomClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createWebhook(
    config: FathomWebhookConfig
  ): Promise<Result<FathomWebhookType, Error>> {
    try {
      if (config.triggered_for.length === 0) {
        return new Err(
          new Error(
            "At least one value must be specified in triggered_for array"
          )
        );
      }

      const hasContent =
        (config.include_transcript ?? false) ||
        (config.include_summary ?? false) ||
        (config.include_action_items ?? false) ||
        (config.include_crm_matches ?? false);

      if (!hasContent) {
        return new Err(
          new Error(
            "At least one of include_transcript, include_summary, include_action_items, or include_crm_matches must be true"
          )
        );
      }

      const response = await fetch(`${FATHOM_API_BASE_URL}/webhooks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": this.apiKey,
        },
        body: JSON.stringify(config),
      });

      const validationResult = await validateFathomApiResponse(
        response,
        FathomWebhookSchema
      );

      if (validationResult.isErr()) {
        logger.error(
          { error: validationResult.error },
          "Failed to create Fathom webhook"
        );
        return validationResult;
      }

      return validationResult;
    } catch (error) {
      logger.error({ error }, "Error creating Fathom webhook");
      return new Err(
        error instanceof Error ? error : new Error("Unknown error")
      );
    }
  }

  async deleteWebhook(webhookId: string): Promise<Result<void, Error>> {
    try {
      const response = await fetch(
        `${FATHOM_API_BASE_URL}/webhooks/${webhookId}`,
        {
          method: "DELETE",
          headers: {
            "X-Api-Key": this.apiKey,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          {
            status: response.status,
            statusText: response.statusText,
            errorText,
            webhookId,
          },
          "Failed to delete Fathom webhook"
        );
        return new Err(
          new Error(
            `Failed to delete webhook: ${response.status} ${response.statusText}`
          )
        );
      }

      return new Ok(undefined);
    } catch (error) {
      logger.error({ error, webhookId }, "Error deleting Fathom webhook");
      return new Err(
        error instanceof Error ? error : new Error("Unknown error")
      );
    }
  }
}
