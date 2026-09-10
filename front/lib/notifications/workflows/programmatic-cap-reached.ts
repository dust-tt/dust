import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNovuClient } from "@app/lib/notifications/novu-client";
import {
  PROGRAMMATIC_CAP_REACHED_TAG,
  PROGRAMMATIC_CAP_REACHED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workflow } from "@novu/framework";
import z from "zod";

// Why admins are being told about the programmatic cap:
// - `programmatic_cap_warning`: 80% of a positive cap consumed.
// - `programmatic_cap_exhausted`: a positive cap fully consumed, calls blocked.
// - `programmatic_cap_disabled`: the cap is set to 0, so programmatic runs are
//   blocked without any credits having been consumed.
export const PROGRAMMATIC_CAP_NOTIFICATION_REASONS = [
  "programmatic_cap_warning",
  "programmatic_cap_exhausted",
  "programmatic_cap_disabled",
] as const;

export type ProgrammaticCapNotificationReason =
  (typeof PROGRAMMATIC_CAP_NOTIFICATION_REASONS)[number];

const ProgrammaticCapReachedPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  // The monthly programmatic credit cap in credits, if known.
  monthlyCapCredits: z.number().nullable(),
  reason: z.enum(PROGRAMMATIC_CAP_NOTIFICATION_REASONS),
});

type ProgrammaticCapReachedPayloadType = z.infer<
  typeof ProgrammaticCapReachedPayloadSchema
>;

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

/**
 * Trigger the programmatic cap email for the given workspace admins.
 * `idempotencyKey` identifies the cap state being reported (billing cycle, cap
 * configuration version); Novu drops repeats of the same `transactionId`.
 */
export async function triggerProgrammaticCapReachedNotifications(
  auth: Authenticator,
  {
    admins,
    monthlyCapCredits,
    reason,
    idempotencyKey,
  }: {
    admins: Array<{
      sId: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    }>;
    monthlyCapCredits: number | null;
    reason: ProgrammaticCapNotificationReason;
    idempotencyKey: string;
  }
): Promise<Result<void, DustError<"internal_error">>> {
  if (admins.length === 0) {
    return new Ok(undefined);
  }

  const workspace = auth.getNonNullableWorkspace();
  const payload: ProgrammaticCapReachedPayloadType = {
    workspaceId: workspace.sId,
    workspaceName: workspace.name,
    monthlyCapCredits,
    reason,
  };

  try {
    const novuClient = await getNovuClient();
    const r = await novuClient.triggerBulk({
      events: admins.map((admin) => ({
        workflowId: PROGRAMMATIC_CAP_REACHED_TRIGGER_ID,
        to: {
          subscriberId: admin.sId,
          email: admin.email,
          firstName: admin.firstName ?? undefined,
          lastName: admin.lastName ?? undefined,
        },
        payload,
        transactionId: `${PROGRAMMATIC_CAP_REACHED_TRIGGER_ID}-${idempotencyKey}-${admin.sId}-${reason}`,
      })),
    });

    if (r.result.some((res) => !!res.error?.length)) {
      const eventErrors = r.result
        .filter((res) => !!res.error?.length)
        .map(({ error }) => error?.join("; "))
        .join("; ");
      return new Err(
        new DustError(
          "internal_error",
          `Failed to trigger programmatic cap reached notification: ${eventErrors}`
        )
      );
    }
  } catch (err) {
    return new Err(
      new DustError(
        "internal_error",
        `Failed to trigger programmatic cap reached notification: ${normalizeError(err).message}`
      )
    );
  }

  return new Ok(undefined);
}
