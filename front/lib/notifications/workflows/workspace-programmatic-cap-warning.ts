import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNovuClient } from "@app/lib/notifications/novu-client";
import logger from "@app/logger/logger";
import {
  WORKSPACE_PROGRAMMATIC_CAP_WARNING_TAG,
  WORKSPACE_PROGRAMMATIC_CAP_WARNING_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { workflow } from "@novu/framework";
import z from "zod";

const WorkspaceProgrammaticCapWarningPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  monthlyCapCredits: z.number(),
  // Enterprise workspaces can't self-serve credits, so we point them to their
  // Dust representative instead of the usage page.
  isEnterprise: z.boolean(),
});

type WorkspaceProgrammaticCapWarningPayloadType = z.infer<
  typeof WorkspaceProgrammaticCapWarningPayloadSchema
>;

function formatCredits(credits: number): string {
  return credits.toLocaleString("en-US");
}

export const workspaceProgrammaticCapWarningWorkflow = workflow(
  WORKSPACE_PROGRAMMATIC_CAP_WARNING_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.inApp("workspace-programmatic-cap-warning-in-app", async () => {
      const subject = `Your workspace's programmatic API usage has reached 80% of its monthly cap`;
      const body =
        `The workspace "${payload.workspaceName}" has used 80% of its ${formatCredits(payload.monthlyCapCredits)}-credit programmatic API monthly cap. ` +
        (payload.isEnterprise
          ? `Please reach out to your Dust representative to increase the cap.`
          : `Visit the usage page to increase the cap before API calls are blocked.`);
      return {
        subject,
        body,
        data: {
          workspaceId: payload.workspaceId,
          monthlyCapCredits: payload.monthlyCapCredits,
        },
      };
    });

    await step.email("workspace-programmatic-cap-warning-email", async () => {
      const subject = `[Dust] Your programmatic API usage has reached 80% in ${payload.workspaceName}`;
      const purchaseLine = payload.isEnterprise
        ? `To avoid having programmatic API calls blocked, please reach out to your Dust representative.`
        : `To avoid having programmatic API calls blocked, you can increase the cap from your workspace usage page.`;
      const content =
        `Your workspace "${payload.workspaceName}" has used 80% of its programmatic API monthly cap.\n` +
        `Monthly cap: ${formatCredits(payload.monthlyCapCredits)} credits\n` +
        purchaseLine;

      const body = await renderEmail({
        name: subscriber.firstName ?? "there",
        workspace: {
          id: payload.workspaceId,
          name: payload.workspaceName,
        },
        content,
        action: {
          label: payload.isEnterprise ? "Manage credits" : "See usage details",
          url: `${config.getAppUrl()}/w/${payload.workspaceId}/usage`,
        },
      });
      return { subject, body };
    });
  },
  {
    payloadSchema: WorkspaceProgrammaticCapWarningPayloadSchema,
    tags: [WORKSPACE_PROGRAMMATIC_CAP_WARNING_TAG],
  }
);

/**
 * Notify workspace admins that the programmatic API monthly cap has crossed
 * the 80% early-warning threshold. One Novu event per admin, deduped via a
 * `transactionId` keyed on the Metronome event so redeliveries don't re-send.
 * Fire-and-forget — errors are logged but don't block the caller.
 */
export function notifyAdminsProgrammaticCapWarning({
  admins,
  workspaceId,
  workspaceName,
  monthlyCapCredits,
  isEnterprise,
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
  monthlyCapCredits: number;
  isEnterprise: boolean;
  eventId: string;
}): void {
  if (admins.length === 0) {
    return;
  }

  const payload: WorkspaceProgrammaticCapWarningPayloadType = {
    workspaceId,
    workspaceName,
    monthlyCapCredits,
    isEnterprise,
  };

  void getNovuClient()
    .then((novuClient) =>
      novuClient.triggerBulk({
        events: admins.map((admin) => ({
          workflowId: WORKSPACE_PROGRAMMATIC_CAP_WARNING_TRIGGER_ID,
          to: {
            subscriberId: admin.sId,
            email: admin.email,
            firstName: admin.firstName ?? undefined,
            lastName: admin.lastName ?? undefined,
          },
          payload,
          transactionId: `${WORKSPACE_PROGRAMMATIC_CAP_WARNING_TRIGGER_ID}-${eventId}-${admin.sId}`,
        })),
      })
    )
    .then((r) => {
      if (r.result.some((res) => !!res.error?.length)) {
        logger.error(
          { workspaceId, monthlyCapCredits },
          "Failed to trigger programmatic cap warning notification"
        );
      }
    })
    .catch((err) => {
      logger.error(
        { err, workspaceId, monthlyCapCredits },
        "Failed to trigger programmatic cap warning notification"
      );
    });
}
