/** @ignoreswagger */
import apiConfig from "@app/lib/api/config";
import {
  calculateFreeCreditAmountMicroUsd,
  countEligibleUsersForFreeCredits,
  YEARLY_MULTIPLIER,
} from "@app/lib/credits/free";
import {
  getMetronomeClient,
  getMetronomeContractById,
  updateMetronomeCreditSegmentAmount,
} from "@app/lib/metronome/client";
import {
  getCreditTypeProgrammaticUsdId,
  getProductFreeMonthlyCreditId,
} from "@app/lib/metronome/constants";
import { invalidateContractCache } from "@app/lib/metronome/plan_type";
import {
  getCustomerIdFromEvent,
  MetronomeWebhookEventSchema,
} from "@app/lib/metronome/webhook_events";
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

      let rawEvent: unknown;
      try {
        const client = getMetronomeClient();
        rawEvent = client.webhooks.unwrap(
          bodyString,
          req.headers,
          webhookSecret
        );
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

      const parsedEvent = MetronomeWebhookEventSchema.safeParse(rawEvent);
      if (!parsedEvent.success) {
        // Metronome may add new event types or backward-compatible fields
        // without notice. Log and ack so we don't retry-storm.
        const rawType = z.object({ type: z.string() }).safeParse(rawEvent);
        logger.warn(
          {
            eventType: rawType.success ? rawType.data.type : "unknown",
            rawEvent,
            error: parsedEvent.error.message,
          },
          "[Metronome Webhook] Unknown or malformed event"
        );
        return res.status(200).json({ success: true });
      }

      const event = parsedEvent.data;

      logger.info({ event, rawEvent }, "[Metronome Webhook] Event received");

      // Resolve the workspace once for any event that carries a customer_id
      // (every type except `integration.issue`). If the customer can't be
      // mapped to a workspace, ack and stop — Metronome would otherwise
      // retry-storm a payload we have nothing to do with.
      const customerId = getCustomerIdFromEvent(event);
      const workspace = customerId
        ? await WorkspaceResource.fetchByMetronomeCustomerId(customerId)
        : null;

      if (!workspace) {
        logger.info(
          { customerId, eventType: event.type },
          "[Metronome Webhook] Workspace not found for customer, skipping"
        );
        return res.status(200).json({ success: true });
      }

      switch (event.type) {
        case "alerts.invoice_total_reached":
        case "alerts.low_remaining_commit_balance_reached":
        case "alerts.low_remaining_credit_balance_reached":
        case "alerts.low_remaining_seat_balance_reached":
        case "alerts.spend_threshold_reached":
        case "alerts.usage_threshold_reached":
        case "commit.archive":
        case "commit.create":
        case "commit.edit":
        case "commit.segment.end":
        case "commit.segment.start":
        case "contract.archive":
        case "contract.create":
        case "contract.edit":
        case "contract.start":
        case "credit.archive":
        case "credit.create":
        case "credit.edit":
        case "credit.segment.end":
        case "invoice.billing_provider_error":
        case "invoice.finalized":
          break;

        case "credit.segment.start": {
          const {
            customer_id: customerId,
            contract_id: contractId,
            credit_id: creditId,
            segment_id: segmentId,
          } = event;

          // Customer-level credits with no parent contract can't be the
          // managed free monthly credit (which is provisioned on a contract).
          if (!contractId) {
            logger.info(
              { customerId, creditId, workspaceId: workspace.sId },
              "[Metronome Webhook] credit.segment.start: no contract_id on credit, ignoring"
            );
            break;
          }

          // The webhook payload does not include the credit's product or
          // credit type, so fetch the contract to identify whether this
          // segment belongs to the free monthly credit we manage.
          const contractResult = await getMetronomeContractById({
            metronomeCustomerId: customerId,
            metronomeContractId: contractId,
          });
          if (contractResult.isErr()) {
            logger.error(
              {
                customerId,
                contractId,
                creditId,
                error: contractResult.error,
              },
              "[Metronome Webhook] credit.segment.start: failed to fetch contract"
            );
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: `Error fetching contract: ${contractResult.error.message}`,
              },
            });
          }

          const credit = contractResult.value.credits?.find(
            (c) => c.id === creditId
          );
          if (!credit) {
            logger.info(
              { customerId, contractId, creditId },
              "[Metronome Webhook] credit.segment.start: credit not found on contract, ignoring"
            );
            break;
          }

          if (
            credit.product.id !== getProductFreeMonthlyCreditId() ||
            credit.access_schedule?.credit_type?.id !==
              getCreditTypeProgrammaticUsdId()
          ) {
            logger.info(
              {
                customerId,
                creditId,
                productId: credit.product.id,
                creditTypeId: credit.access_schedule?.credit_type?.id,
              },
              "[Metronome Webhook] credit.segment.start: ignoring non-free-credit segment"
            );
            break;
          }

          // Detect whether this credit comes from an annual recurring credit
          // (annual contracts) so we grant a yearly amount instead of monthly.
          const recurringCredit = credit.recurring_credit_id
            ? contractResult.value.recurring_credits?.find(
                (rc) => rc.id === credit.recurring_credit_id
              )
            : undefined;
          const isAnnual = recurringCredit?.recurrence_frequency === "ANNUAL";

          const userCount = await countEligibleUsersForFreeCredits(workspace);
          const monthlyAmountMicroUsd =
            calculateFreeCreditAmountMicroUsd(userCount);
          const amountMicroUsd = isAnnual
            ? monthlyAmountMicroUsd * YEARLY_MULTIPLIER
            : monthlyAmountMicroUsd;
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
              isAnnual,
              workspaceId: workspace.sId,
            },
            "[Metronome Webhook] credit.segment.start: free credit amount updated"
          );
          break;
        }

        case "contract.end": {
          const { contract_id: contractId, customer_id: customerId } = event;

          // Workspace is guaranteed by the pre-switch check (customerId is
          // present for contract.* events).
          if (!workspace) {
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
