import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNovuClient } from "@app/lib/notifications/novu-client";
import logger from "@app/logger/logger";
import {
  PROGRAMMATIC_CAP_REACHED_TAG,
  PROGRAMMATIC_CAP_REACHED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { workflow } from "@novu/framework";
import z from "zod";

const ProgrammaticCapReachedPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  // The monthly programmatic credit cap in AWU credits, if known.
  monthlyCapCredits: z.number().nullable(),
  // true → cap fully depleted and API calls are blocked; false → 80% warning.
  isBlocked: z.boolean(),
});

type ProgrammaticCapReachedPayloadType = z.infer<
  typeof ProgrammaticCapReachedPayloadSchema
>;

function formatCredits(credits: number): string {
  return credits.toLocaleString("en-US");
}

// Email-only (no in-app): these notifications target workspace admins who
// manage programmatic API usage, not individual end-users.
export const programmaticCapReachedWorkflow = workflow(
  PROGRAMMATIC_CAP_REACHED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("programmatic-cap-reached-email", async () => {
      const capLine =
        payload.monthlyCapCredits !== null
          ? ` of ${formatCredits(payload.monthlyCapCredits)} credits`
          : "";

      const subject = payload.isBlocked
        ? `[Dust] Your workspace has reached its programmatic API credit cap in ${payload.workspaceName}`
        : `[Dust] Your workspace has used 80% of its programmatic API credit cap in ${payload.workspaceName}`;

      const content = payload.isBlocked
        ? `Your workspace "${payload.workspaceName}" has exhausted its monthly programmatic API credit cap${capLine}.\nProgrammatic API calls are now blocked until the billing cycle resets or the cap is raised.`
        : `Your workspace "${payload.workspaceName}" has used 80% of its monthly programmatic API credit cap${capLine}.\nOnce the cap is fully reached, programmatic API calls will be blocked. Consider raising the cap before that happens.`;

      const body = await renderEmail({
        name: subscriber.firstName ?? "there",
        workspace: {
          id: payload.workspaceId,
          name: payload.workspaceName,
        },
        content,
        action: {
          label: "Manage workspace usage",
          url: `${config.getAppUrl()}/w/${payload.workspaceId}/usage`,
        },
      });
      return { subject, body };
    });
  },
  {
    payloadSchema: ProgrammaticCapReachedPayloadSchema,
    tags: [PROGRAMMATIC_CAP_REACHED_TAG],
  }
);

/**
 * Email workspace admins about programmatic API credit cap status.
 * isBlocked=true → cap depleted, API calls blocked.
 * isBlocked=false → 80% warning.
 * Fire-and-forget — errors are logged but don't block the caller.
 */
export function notifyAdminsProgrammaticCapReached({
  admins,
  workspaceId,
  workspaceName,
  monthlyCapCredits,
  isBlocked,
  eventId,
}: {
  admins: Array<{
    sId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }>;
  workspaceId: string;
  workspaceName: string;
  monthlyCapCredits: number | null;
  isBlocked: boolean;
  eventId: string;
}): void {
  if (admins.length === 0) {
    return;
  }

  const payload: ProgrammaticCapReachedPayloadType = {
    workspaceId,
    workspaceName,
    monthlyCapCredits,
    isBlocked,
  };

  void getNovuClient()
    .then((novuClient) =>
      novuClient.triggerBulk({
        events: admins.map((admin) => ({
          workflowId: PROGRAMMATIC_CAP_REACHED_TRIGGER_ID,
          to: {
            subscriberId: admin.sId,
            email: admin.email,
            firstName: admin.firstName ?? undefined,
            lastName: admin.lastName ?? undefined,
          },
          payload,
          transactionId: `${PROGRAMMATIC_CAP_REACHED_TRIGGER_ID}-${eventId}-${admin.sId}-${isBlocked ? "blocked" : "warned"}`,
        })),
      })
    )
    .then((r) => {
      if (r.result.some((res) => !!res.error?.length)) {
        logger.error(
          { workspaceId, isBlocked },
          "Failed to trigger programmatic cap reached notification"
        );
      }
    })
    .catch((err) => {
      logger.error(
        { err, workspaceId, isBlocked },
        "Failed to trigger programmatic cap reached notification"
      );
    });
}
