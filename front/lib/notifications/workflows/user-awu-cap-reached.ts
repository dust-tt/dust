import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNovuClient } from "@app/lib/notifications/novu-client";
import logger from "@app/logger/logger";
import {
  USER_AWU_CAP_REACHED_TAG,
  USER_AWU_CAP_REACHED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { workflow } from "@novu/framework";
import z from "zod";

const UserAwuCapReachedPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  capAwuCredits: z.number(),
  // true → user has hit 100% and is now blocked; false → 80% warning.
  isBlocked: z.boolean(),
});

type UserAwuCapReachedPayloadType = z.infer<
  typeof UserAwuCapReachedPayloadSchema
>;

export const userAwuCapReachedWorkflow = workflow(
  USER_AWU_CAP_REACHED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.inApp("user-awu-cap-reached-in-app", async () => {
      const subject = payload.isBlocked
        ? "You've reached your usage limit"
        : "You've used 80% of your usage limit";
      const body = payload.isBlocked
        ? `You have reached your ${payload.capAwuCredits} credits limit in workspace "${payload.workspaceName}" and can no longer run agents. Contact your admin to increase your limit.`
        : `You have used 80% of your ${payload.capAwuCredits} credits limit in workspace "${payload.workspaceName}". Contact your admin to increase your limit before you are blocked.`;
      return {
        subject,
        body,
        data: {
          workspaceId: payload.workspaceId,
          capAwuCredits: payload.capAwuCredits,
          isBlocked: payload.isBlocked,
        },
      };
    });

    await step.email("user-awu-cap-reached-email", async () => {
      const subject = payload.isBlocked
        ? `[Dust] You've reached your usage limit in ${payload.workspaceName}`
        : `[Dust] You've used 80% of your usage limit in ${payload.workspaceName}`;
      const content = payload.isBlocked
        ? `You have reached your ${payload.capAwuCredits} credits usage limit in the Dust workspace ${payload.workspaceName} and can no longer run agents.\nPlease contact your workspace admin to increase your limit.`
        : `You have used 80% of your ${payload.capAwuCredits} credits usage limit in the Dust workspace ${payload.workspaceName}.\nOnce you reach 100%, you won't be able to run agents until your limit is increased. Please contact your workspace admin.`;
      const body = await renderEmail({
        name: subscriber.firstName ?? "there",
        workspace: {
          id: payload.workspaceId,
          name: payload.workspaceName,
        },
        content,
        action: {
          label: "Go to workspace",
          url: `${config.getAppUrl()}/w/${payload.workspaceId}`,
        },
      });
      return { subject, body };
    });
  },
  {
    payloadSchema: UserAwuCapReachedPayloadSchema,
    tags: [USER_AWU_CAP_REACHED_TAG],
  }
);

/**
 * Send an in-app Novu notification about AWU usage.
 * isBlocked=true → user hit 100% and is now blocked.
 * isBlocked=false → 80% warning.
 * Fire-and-forget — errors are logged but don't block the caller.
 */
export function notifyUserAwuCapReached({
  userSId,
  userEmail,
  userFirstName,
  userLastName,
  workspaceId,
  workspaceName,
  capAwuCredits,
  isBlocked,
}: {
  userSId: string;
  userEmail: string;
  userFirstName: string | null;
  userLastName: string | null;
  workspaceId: string;
  workspaceName: string;
  capAwuCredits: number;
  isBlocked: boolean;
}): void {
  const payload: UserAwuCapReachedPayloadType = {
    workspaceId,
    workspaceName,
    capAwuCredits,
    isBlocked,
  };

  void getNovuClient()
    .then((novuClient) =>
      novuClient.triggerBulk({
        events: [
          {
            workflowId: USER_AWU_CAP_REACHED_TRIGGER_ID,
            to: {
              subscriberId: userSId,
              email: userEmail,
              firstName: userFirstName ?? undefined,
              lastName: userLastName ?? undefined,
            },
            payload,
          },
        ],
      })
    )
    .then((r) => {
      if (r.result.some((res) => !!res.error?.length)) {
        logger.error(
          { workspaceId, userSId, capAwuCredits },
          "Failed to trigger user AWU cap reached notification"
        );
      }
    })
    .catch((err) => {
      logger.error(
        { err, workspaceId, userSId, capAwuCredits },
        "Failed to trigger user AWU cap reached notification"
      );
    });
}
