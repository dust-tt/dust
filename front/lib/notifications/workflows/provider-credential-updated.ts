import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { getNovuClient } from "@app/lib/notifications/novu-client";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import logger from "@app/logger/logger";
import { PROVIDER_CREDENTIALS_HEALTH_UPDATED_TRIGGER_ID } from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workflow } from "@novu/framework";
import z from "zod";

const ProviderCredentialsHealthUpdatedPayloadSchema = z.object({
  workspaceId: z.string(),
});

type ProviderCredentialsHealthUpdatedPayloadType = z.infer<
  typeof ProviderCredentialsHealthUpdatedPayloadSchema
>;

export const providerCredentialsHealthUpdatedWorkflow = workflow(
  PROVIDER_CREDENTIALS_HEALTH_UPDATED_TRIGGER_ID,
  async ({ step, payload }) => {
    await step.inApp("provider-credentials-health-updated-in-app", async () => {
      return {
        subject: "",
        body: "",
        data: {
          autoDelete: true,
          mutateAuthContext: true,
          workspaceId: payload.workspaceId,
        },
      };
    });
  },
  {
    payloadSchema: ProviderCredentialsHealthUpdatedPayloadSchema,
    tags: ["provider-credentials-health"],
  }
);

export const triggerProviderCredentialsHealthUpdatedNotifications = async (
  auth: Authenticator
): Promise<Result<void, DustError<"internal_error">>> => {
  const workspace = auth.getNonNullableWorkspace();

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });

  const membersWithUser = memberships.filter((m) => m.user !== undefined);

  if (membersWithUser.length === 0) {
    return new Ok(undefined);
  }

  try {
    const novuClient = await getNovuClient();

    const payload: ProviderCredentialsHealthUpdatedPayloadType = {
      workspaceId: workspace.sId,
    };

    const r = await novuClient.triggerBulk({
      events: membersWithUser.map((m) => ({
        workflowId: PROVIDER_CREDENTIALS_HEALTH_UPDATED_TRIGGER_ID,
        to: {
          subscriberId: m.user!.sId,
          email: m.user!.email,
          firstName: m.user!.firstName ?? undefined,
          lastName: m.user!.lastName ?? undefined,
        },
        payload,
      })),
    });

    if (r.result.some((res) => !!res.error?.length)) {
      const eventErrors = r.result
        .filter((res) => !!res.error?.length)
        .map(({ error }) => error?.join("; "))
        .join("; ");
      return new Err({
        name: "dust_error",
        code: "internal_error",
        message: `Failed to trigger provider credentials health updated notification: ${eventErrors}`,
      });
    }
  } catch (err) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message:
        "Failed to trigger provider credentials health updated notification",
      cause: normalizeError(err),
    });
  }

  return new Ok(undefined);
};

/**
 * Fire-and-forget helper to notify all workspace members that provider
 * credentials health changed, so their frontends can refresh the auth context.
 * Errors are logged but don't block the caller.
 */
export function notifyProviderCredentialsHealthUpdated(
  auth: Authenticator
): void {
  void triggerProviderCredentialsHealthUpdatedNotifications(auth).then(
    (notifRes) => {
      if (notifRes.isErr()) {
        logger.error(
          {
            error: notifRes.error,
            workspaceId: auth.getNonNullableWorkspace().sId,
          },
          "Failed to trigger provider credentials health updated notification"
        );
      }
    }
  );
}
