import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { getNovuClient } from "@app/lib/notifications";
import { fireAndForgetNotification } from "@app/lib/notifications/fire_and_forget";
import { UserResource } from "@app/lib/resources/user_resource";
import { POD_ADDED_AS_MEMBER_TRIGGER_ID } from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { SpaceType } from "@app/types/space";
import z from "zod";

export const PodAddedAsMemberPayloadSchema = z.object({
  workspaceId: z.string(),
  podId: z.string(),
  userThatAddedYouId: z.string(),
});

export type PodAddedAsMemberPayloadType = z.infer<
  typeof PodAddedAsMemberPayloadSchema
>;

/**
 * Trigger notifications for users added to a pod.
 * Should be called from API endpoints after successfully adding members.
 */
const triggerPodAddedAsMemberNotifications = async (
  auth: Authenticator,
  {
    pod,
    addedUserIds,
  }: {
    pod: SpaceType;
    addedUserIds: string[];
  }
): Promise<Result<void, DustError<"internal_error">>> => {
  // Only notify for project spaces.
  if (pod.kind !== "project") {
    return new Ok(undefined);
  }

  const userThatAddedYou = auth.user();

  // If no user context (e.g., API call without specific user), skip notification.
  if (!userThatAddedYou) {
    return new Ok(undefined);
  }

  // Filter out the user who added them (don't notify yourself).
  const userIdsToNotify = addedUserIds.filter(
    (userId) => userId !== userThatAddedYou.sId
  );

  if (userIdsToNotify.length === 0) {
    return new Ok(undefined);
  }

  const addedUsers = await UserResource.fetchByIds(userIdsToNotify);
  if (addedUsers.length === 0) {
    return new Ok(undefined);
  }

  try {
    const novuClient = await getNovuClient();

    const payload: PodAddedAsMemberPayloadType = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      podId: pod.sId,
      userThatAddedYouId: userThatAddedYou.sId,
    };

    const r = await novuClient.triggerBulk({
      events: addedUsers.map((user: UserResource) => ({
        workflowId: POD_ADDED_AS_MEMBER_TRIGGER_ID,
        to: {
          subscriberId: user.sId,
          email: user.email,
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
        },
        payload,
      })),
    });

    if (r.result.some((event) => !!event.error?.length)) {
      const eventErrors = r.result
        .filter((res) => !!res.error?.length)
        .map(({ error }) => error?.join("; "))
        .join("; ");
      return new Err({
        name: "dust_error",
        code: "internal_error",
        message: `Failed to trigger pod added as member notification: ${eventErrors}`,
      });
    }
  } catch (err) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Failed to trigger pod added as member notification",
      cause: normalizeError(err),
    });
  }

  return new Ok(undefined);
};

/**
 * Fire-and-forget helper to trigger pod member notifications.
 * The notification is sent asynchronously and errors are logged but don't block the caller.
 */
export function notifyPodMembersAdded(
  auth: Authenticator,
  {
    pod,
    addedUserIds,
  }: {
    pod: SpaceType;
    addedUserIds: string[];
  }
): void {
  fireAndForgetNotification(
    triggerPodAddedAsMemberNotifications(auth, { pod, addedUserIds }),
    {
      message: "Failed to trigger pod added as member notification",
      context: { podId: pod.sId },
    }
  );
}
