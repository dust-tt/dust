import z from "zod";

import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { getNovuClient } from "@app/lib/notifications";
import { UserResource } from "@app/lib/resources/user_resource";
import type { ConversationWithoutContentType, Result } from "@app/types";
import { Err } from "@app/types";
import { Ok } from "@app/types";

export const ConversationAddedAsParticipantPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
  userThatAddedYouId: z.string(),
});

export type ConversationAddedAsParticipantPayloadType = z.infer<
  typeof ConversationAddedAsParticipantPayloadSchema
>;

export const CONVERSATION_ADDED_AS_PARTICIPANT_TRIGGER_ID =
  "conversation-added-as-participant";

export const triggerConversationAddedAsParticipantNotification = async (
  auth: Authenticator,
  {
    conversation,
    addedUserId,
  }: {
    conversation: ConversationWithoutContentType;
    addedUserId: string;
  }
): Promise<Result<void, DustError<"internal_error">>> => {
  // Skip any sub-conversations.
  if (conversation.depth > 0) {
    return new Ok(undefined);
  }

  const userThatAddedYou = auth.user();

  // Message could be created via the API without a specific user.
  if (!userThatAddedYou) {
    return new Ok(undefined);
  }

  const addedUser = await UserResource.fetchById(addedUserId);
  if (!addedUser) {
    return new Err(new DustError("internal_error", "User not found"));
  }

  try {
    const novuClient = await getNovuClient();

    const payload: ConversationAddedAsParticipantPayloadType = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: conversation.sId,
      userThatAddedYouId: userThatAddedYou.sId,
    };

    const r = await novuClient.trigger({
      workflowId: CONVERSATION_ADDED_AS_PARTICIPANT_TRIGGER_ID,
      to: {
        subscriberId: addedUserId,
        email: addedUser.email,
        firstName: addedUser.firstName ?? undefined,
        lastName: addedUser.lastName ?? undefined,
      },
      payload,
    });
    if (r.result.error?.length) {
      const eventErrors = r.result.error.join(", ");
      return new Err({
        name: "dust_error",
        code: "internal_error",
        message:
          "Failed to trigger conversation added as participant notification",
        cause: eventErrors,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message:
        "Failed to trigger conversation added as participant notification",
    });
  }

  return new Ok(undefined);
};
