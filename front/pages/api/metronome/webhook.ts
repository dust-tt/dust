/** @ignoreswagger */
import apiConfig from "@app/lib/api/config";
import {
  calculateFreeCreditAmountMicroUsd,
  countEligibleUsersForFreeCredits,
} from "@app/lib/credits/free";
import {
  getMetronomeClient,
  updateMetronomeCreditSegmentAmount,
} from "@app/lib/metronome/client";
import {
  getCreditTypeProgrammaticUsdId,
  getProductFreeMonthlyCreditId,
} from "@app/lib/metronome/constants";
import { invalidateContractCache } from "@app/lib/metronome/plan_type";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import { launchScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { NextApiRequest, NextApiResponse } from "next";
import { pipeline, Writable } from "stream";
import { promisify } from "util";
import { z } from "zod";

type ResponseBody = {
  success: boolean;
  message?: string;
};

const ContractEndEventSchema = z.object({
  type: z.literal("contract.end"),
  contract_id: z.string(),
  customer_id: z.string(),
});

const CreditSegmentStartEventSchema = z.object({
  type: z.literal("credit.segment.start"),
  customer_id: z.string(),
  contract_id: z.string(),
  credit_id: z.string(),
  segment_id: z.string(),
  product: z.object({ id: z.string() }),
});

// Disable Next.js body parsing so we can read the raw body for signature verification.
export const config = {
  api: {
    bodyParser: false,
  },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ResponseBody>>
): Promise<void> {
  switch (req.method) {
    case "GET":
      return res.status(200).json({ success: true });

    case "POST": {
      // Collect raw body.
      let rawBody = Buffer.from("");
      const collector = new Writable({
        write(chunk, _encoding, callback) {
          rawBody = Buffer.concat([rawBody, chunk]);
          callback();
        },
      });
      await promisify(pipeline)(req, collector);

      const bodyString = rawBody.toString("utf-8");

      // Verify signature using the Metronome SDK.
      const webhookSecret = apiConfig.getMetronomeWebhookSecret();
      if (!webhookSecret) {
        logger.error(
          "[Metronome Webhook] METRONOME_WEBHOOK_SECRET is not configured"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Webhook secret not configured.",
          },
        });
      }

      let event: { type: string; [key: string]: unknown };
      try {
        const client = getMetronomeClient();
        event = client.webhooks.unwrap(
          bodyString,
          req.headers,
          webhookSecret
        ) as { type: string; [key: string]: unknown };
      } catch (err) {
        logger.error(
          { error: normalizeError(err) },
          "[Metronome Webhook] Signature verification failed"
        );
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "internal_server_error",
            message: "Invalid webhook signature.",
          },
        });
      }

      switch (event.type) {
        case "alerts.low_remaining_credit_balance_reached":
          logger.info({ event }, "[Metronome Webhook] Credits exhausted alert");
          break;

        case "alerts.low_remaining_seat_balance_reached":
          logger.info(
            { event },
            "[Metronome Webhook] Per-seat credits exhausted alert"
          );
          break;

        case "alerts.spend_threshold_reached":
          logger.info({ event }, "[Metronome Webhook] Approaching spend limit");
          break;

        case "commit.segment.start":
          logger.info(
            { event },
            "[Metronome Webhook] New commit segment started (credits available)"
          );
          break;

        case "credit.segment.start": {
          const parsed = CreditSegmentStartEventSchema.safeParse(event);
          if (!parsed.success) {
            logger.error(
              { event, error: parsed.error.message },
              "[Metronome Webhook] Invalid credit.segment.start event"
            );
            break;
          }

          const {
            customer_id: customerId,
            contract_id: contractId,
            credit_id: creditId,
            segment_id: segmentId,
            product,
          } = parsed.data;

          if (
            product.id !== getProductFreeMonthlyCreditId() ||
            creditId !== getCreditTypeProgrammaticUsdId()
          ) {
            logger.info(
              { customerId, creditId, productId: product.id },
              "[Metronome Webhook] credit.segment.start: ignoring non-free-credit segment"
            );
            break;
          }

          const workspace =
            await WorkspaceResource.fetchByMetronomeCustomerId(customerId);
          if (!workspace) {
            logger.warn(
              { customerId },
              "[Metronome Webhook] credit.segment.start: workspace not found"
            );
            break;
          }

          const userCount = await countEligibleUsersForFreeCredits(workspace);
          const amountMicroUsd = calculateFreeCreditAmountMicroUsd(userCount);
          const amount = amountMicroUsd / 1_000_000;

          const updateResult = await updateMetronomeCreditSegmentAmount({
            metronomeCustomerId: customerId,
            contractId,
            creditId,
            segmentId,
            amount,
          });

          if (updateResult.isErr()) {
            logger.error(
              {
                customerId,
                contractId,
                creditId,
                segmentId,
                error: updateResult.error,
                workspaceId: workspace.sId,
              },
              "[Metronome Webhook] credit.segment.start: failed to update free credit amount"
            );
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: `Error updating free credit amount: ${updateResult.error.message}`,
              },
            });
          }

          logger.info(
            {
              customerId,
              contractId,
              creditId,
              segmentId,
              amountMicroUsd,
              userCount,
              workspaceId: workspace.sId,
            },
            "[Metronome Webhook] credit.segment.start: free credit amount updated"
          );
          break;
        }

        case "credit.create":
          logger.info(
            { event },
            "[Metronome Webhook] Credit created (credits available)"
          );
          break;

        case "contract.start":
          logger.info({ event }, "[Metronome Webhook] Contract started");
          break;

        case "contract.end": {
          const parsed = ContractEndEventSchema.safeParse(event);
          if (!parsed.success) {
            logger.error(
              { event, error: parsed.error.message },
              "[Metronome Webhook] Invalid contract.end event"
            );
            break;
          }

          const { contract_id: contractId, customer_id: customerId } =
            parsed.data;

          const workspace =
            await WorkspaceResource.fetchByMetronomeCustomerId(customerId);
          if (!workspace) {
            logger.warn(
              { contractId, customerId },
              "[Metronome Webhook] contract.end: workspace not found"
            );
            break;
          }

          await invalidateContractCache(workspace.sId);

          const subscription =
            await SubscriptionResource.fetchByMetronomeContractId(
              workspace,
              contractId
            );
          if (!subscription) {
            logger.warn(
              { contractId, customerId, workspaceId: workspace.sId },
              "[Metronome Webhook] contract.end: subscription not found"
            );
            break;
          }

          if (subscription.isMetronomeShadowBilled) {
            logger.info(
              { contractId, workspaceId: workspace.sId },
              "[Metronome Webhook] contract.end: shadow contract ended, Stripe handles subscription"
            );
            break;
          }

          switch (subscription.status) {
            case "ended":
              logger.info(
                { contractId, workspaceId: workspace.sId },
                "[Metronome Webhook] contract.end: subscription already ended"
              );
              break;

            case "ended_backend_only":
              logger.info(
                { contractId, workspaceId: workspace.sId },
                "[Metronome Webhook] contract.end: marking as ended (backend-initiated)"
              );
              await subscription.markAsEnded("ended");
              break;

            case "active":
              await subscription.markAsEnded("ended");
              logger.info(
                { contractId, workspaceId: workspace.sId },
                "[Metronome Webhook] contract.end: ending subscription and scrubbing workspace"
              );
              const scrubRes = await launchScheduleWorkspaceScrubWorkflow({
                workspaceId: workspace.sId,
              });
              if (scrubRes.isErr()) {
                logger.error(
                  {
                    workspaceId: workspace.sId,
                    contractId,
                    error: scrubRes.error,
                  },
                  "[Metronome Webhook] Error launching scrub workspace workflow"
                );
                return apiError(req, res, {
                  status_code: 500,
                  api_error: {
                    type: "internal_server_error",
                    message: `Error launching scrub workspace workflow: ${scrubRes.error.message}`,
                  },
                });
              }
              break;

            default:
              assertNever(subscription.status);
          }
          break;
        }

        case "invoice.finalized":
          logger.info({ event }, "[Metronome Webhook] Invoice finalized");
          break;

        case "invoice.billing_provider_error":
          logger.error(
            { event },
            "[Metronome Webhook] Billing provider error on invoice"
          );
          break;

        default:
          logger.info(
            { eventType: event.type },
            "[Metronome Webhook] Unhandled event type"
          );
          break;
      }

      return res.status(200).json({ success: true });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
