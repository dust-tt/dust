import type { Authenticator } from "@app/lib/auth";
import { getWebhookRequestsBucket } from "@app/lib/file_storage";
import { matchPayload, parseMatcherExpression } from "@app/lib/matcher";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import type { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";

export async function computeWebhookTriggerEstimation(
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
  const workspace = auth.getNonNullableWorkspace();

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

  // Fetch recent webhook requests (last 24 hours, max 100).
  const webhookRequests =
    await WebhookRequestResource.fetchRecentByWebhookSourceId(auth, {
      webhookSourceId: webhookSource.id,
      hoursAgo: 24,
      limit: 100,
    });

  const totalCount = webhookRequests.length;
  let matchingCount = 0;

  // Fetch payloads from GCS and match against filter and event.
  const bucket = getWebhookRequestsBucket();

  // O(n) acceptable: capped at 100 requests.
  await Promise.all(
    webhookRequests.map(async (webhookRequest) => {
      const gcsPath = WebhookRequestResource.getGcsPath({
        workspaceId: workspace.sId,
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
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to fetch webhook request payload from GCS"
        );
        // Continue without counting this request if GCS fetch fails.
        return;
      }

      if (!content) {
        return;
      }

      const payload = JSON.parse(content.toString()) as {
        headers?: Record<string, string | string[]>;
        body?: unknown;
      };

      // Check event if specified.
      if (event && webhookSource.provider) {
        const preset = WEBHOOK_PRESETS[webhookSource.provider];
        const { type, field } = preset.eventCheck;

        let receivedEventValue: string | undefined;
        switch (type) {
          case "headers":
            const headerValue = payload.headers?.[field.toLowerCase()];
            receivedEventValue = Array.isArray(headerValue)
              ? headerValue[0]
              : headerValue;
            break;
          case "body":
            if (
              payload.body &&
              typeof payload.body === "object" &&
              field in payload.body
            ) {
              receivedEventValue = String(
                (payload.body as Record<string, unknown>)[field]
              );
            }
            break;
        }

        // If event doesn't match, skip this request.
        if (receivedEventValue !== event) {
          return;
        }
      }

      // Check filter if specified.
      if (parsedFilter && payload.body) {
        const bodyMatches = matchPayload(
          payload.body as Record<string, unknown>,
          parsedFilter
        );

        if (!bodyMatches) {
          return;
        }
      }

      // If we get here, the request matches all criteria.
      matchingCount++;
    })
  );

  return new Ok({ matchingCount, totalCount });
}
