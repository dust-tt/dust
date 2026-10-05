import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import type { ProgrammaticCapReachedPayloadType } from "@app/lib/notifications/triggers/programmatic-cap-reached";
import { ProgrammaticCapReachedPayloadSchema } from "@app/lib/notifications/triggers/programmatic-cap-reached";
import {
  PROGRAMMATIC_CAP_REACHED_TAG,
  PROGRAMMATIC_CAP_REACHED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workflow } from "@novu/framework";

function formatCredits(credits: number): string {
  return credits.toLocaleString("en-US");
}

export function buildProgrammaticCapReachedEmailCopy({
  workspaceName,
  monthlyCapCredits,
  reason,
}: Pick<
  ProgrammaticCapReachedPayloadType,
  "workspaceName" | "monthlyCapCredits" | "reason"
>): { subject: string; content: string } {
  const capLine =
    monthlyCapCredits !== null
      ? ` of ${formatCredits(monthlyCapCredits)} credits`
      : "";

  switch (reason) {
    case "programmatic_cap_warning":
      return {
        subject: `[Dust] Your workspace has used 80% of its programmatic API credit cap in ${workspaceName}`,
        content: `Your workspace "${workspaceName}" has used 80% of its monthly programmatic API credit cap${capLine}.\nOnce the cap is fully reached, programmatic API calls will be blocked. Consider raising the cap before that happens.`,
      };
    case "programmatic_cap_exhausted":
      return {
        subject: `[Dust] Your workspace has reached its programmatic API credit cap in ${workspaceName}`,
        content: `Your workspace "${workspaceName}" has exhausted its monthly programmatic API credit cap${capLine}.\nProgrammatic API calls are now blocked until the billing cycle resets or the cap is raised.`,
      };
    case "programmatic_cap_disabled":
      return {
        subject: `[Dust] Your programmatic triggers are paused in ${workspaceName}`,
        content: `A programmatic trigger in your Dust workspace "${workspaceName}" could not run because the workspace's monthly programmatic usage limit is set to 0 credits.\nProgrammatic triggers will remain blocked until you set a positive limit in workspace usage settings.`,
      };
    default:
      return assertNever(reason);
  }
}

// Email-only (no in-app): these notifications target workspace admins who
// manage programmatic API usage, not individual end-users.
export const programmaticCapReachedWorkflow = workflow(
  PROGRAMMATIC_CAP_REACHED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("programmatic-cap-reached-email", async () => {
      const { subject, content } =
        buildProgrammaticCapReachedEmailCopy(payload);

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
