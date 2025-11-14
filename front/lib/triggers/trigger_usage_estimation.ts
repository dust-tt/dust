import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { getWebhookRequestsBucket } from "@app/lib/file_storage";
import { matchPayload, parseMatcherExpression } from "@app/lib/matcher";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import type { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";

const NUMBER_HOURS_TO_FETCH = 24;
const MAX_OUTPUT = 100;

export async function computeFilteredWebhookTriggerForecast(
  auth: Authenticator,
  {
    webhookSource,
    filter,
    event,
  }: {
    webhookSource: WebhookSourceResource;
    filter?: string | null;
    event?: string | null;
  }
): Promise<
  Result<
    { matchingCount: number; totalCount: number },
    { code: "invalid_filter_error"; message: string }
  >
> {
  const owner = auth.getNonNullableWorkspace();

  // Parse filter if provided.
  let parsedFilter = null;
  if (filter && filter.trim()) {
    const parseResult = parseMatcherExpression(filter);
    if (parseResult.isErr()) {
      return new Err({
        code: "invalid_filter_error",
        message: `Invalid filter expression: ${parseResult.error.message}`,
      });
    }
    parsedFilter = parseResult.value;
  }

  const dateThreshold = new Date();
  dateThreshold.setHours(dateThreshold.getHours() - NUMBER_HOURS_TO_FETCH);

  // Fetch recent webhook requests (last 24 hours, max 100).
  const webhookRequests =
    await WebhookRequestResource.fetchRecentByWebhookSourceModelId(
      auth,
      {
        webhookSourceId: webhookSource.id,
      },
      {
        where: {
          createdAt: {
            [Op.gte]: dateThreshold,
          },
        },
        limit: MAX_OUTPUT,
        order: [["createdAt", "DESC"]],
      }
    );

  let totalCount = webhookRequests.length;
  let matchingCount = 0;

  const bucket = getWebhookRequestsBucket();
  await concurrentExecutor(
    webhookRequests,
    async (webhookRequest) => {
      const gcsPath = WebhookRequestResource.getGcsPath({
        workspaceId: owner.sId,
        webhookSourceId: webhookSource.id,
        webRequestId: webhookRequest.id,
      });

      const file = bucket.file(gcsPath);
      let content: Buffer;
      try {
        [content] = await file.download();
      } catch (error) {
        logger.warn(
          {
            webhookRequestId: webhookRequest.id,
            error: normalizeError(error),
          },
          "Failed to fetch webhook request payload from GCS"
        );
        // Continue without counting this request in the total if GCS fetch fails.
        totalCount--;
        return;
      }

      if (!content) {
        return;
      }

      const payload = JSON.parse(content.toString());

      if (event && webhookSource.provider) {
        const preset = WEBHOOK_PRESETS[webhookSource.provider];
        if (preset.eventCheck) {
          const { type, field } = preset.eventCheck;

          let receivedEventValue: string | undefined;
          switch (type) {
            case "headers":
              if (!payload.headers) {
                return;
              }
              receivedEventValue = payload.headers[field.toLowerCase()];
              break;
            case "body":
              if (!payload.body) {
                return;
              }
              receivedEventValue = payload.body[field.toLowerCase()];
              break;
          }

          // If event doesn't match, skip this request.
          if (receivedEventValue?.toLowerCase() !== event.toLowerCase()) {
            return;
          }
        }
      }

      if (
        parsedFilter &&
        payload.body &&
        !matchPayload(payload.body, parsedFilter)
      ) {
        return;
      }

      matchingCount++;
    },
    { concurrency: 10 }
  );

  return new Ok({ matchingCount, totalCount });
}
