import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { getNovuClient } from "@app/lib/notifications";
import logger from "@app/logger/logger";
import { SKILL_SUGGESTIONS_READY_TRIGGER_ID } from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { UserType } from "@app/types/user";
import z from "zod";

export const SkillSuggestionsReadyPayloadSchema = z.object({
  workspaceId: z.string(),
  skillId: z.string(),
  skillName: z.string(),
  suggestionCount: z.number(),
});

export type SkillSuggestionsReadyPayloadType = z.infer<
  typeof SkillSuggestionsReadyPayloadSchema
>;

const triggerSkillSuggestionsReadyNotifications = async (
  auth: Authenticator,
  {
    skillId,
    skillName,
    editors,
    suggestionCount,
  }: {
    skillId: string;
    skillName: string;
    editors: UserType[];
    suggestionCount: number;
  }
): Promise<Result<void, DustError<"internal_error">>> => {
  if (suggestionCount === 0) {
    return new Ok(undefined);
  }

  if (editors.length === 0) {
    logger.info(
      { skillId },
      "No editors found for skill, skipping suggestions ready notification"
    );
    return new Ok(undefined);
  }

  try {
    const novuClient = await getNovuClient();

    const payload: SkillSuggestionsReadyPayloadType = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      skillId,
      skillName,
      suggestionCount,
    };

    const r = await novuClient.triggerBulk({
      events: editors.map((editor) => ({
        workflowId: SKILL_SUGGESTIONS_READY_TRIGGER_ID,
        to: {
          subscriberId: editor.sId,
          email: editor.email,
          firstName: editor.firstName ?? undefined,
          lastName: editor.lastName ?? undefined,
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
        message: `Failed to trigger skill suggestions ready notification: ${eventErrors}`,
      });
    }
  } catch (err) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Failed to trigger skill suggestions ready notification",
      cause: normalizeError(err),
    });
  }

  return new Ok(undefined);
};

/**
 * Fire-and-forget helper to notify skill editors that reinforcement suggestions are ready.
 * Errors are logged but don't block the caller.
 */
export function notifySkillSuggestionsReady(
  auth: Authenticator,
  {
    skillId,
    skillName,
    editors,
    suggestionCount,
  }: {
    skillId: string;
    skillName: string;
    editors: UserType[];
    suggestionCount: number;
  }
): void {
  void triggerSkillSuggestionsReadyNotifications(auth, {
    skillId,
    skillName,
    editors,
    suggestionCount,
  }).then((notifRes) => {
    if (notifRes.isErr()) {
      logger.error(
        {
          error: notifRes.error,
          skillId,
        },
        "Failed to trigger skill suggestions ready notification"
      );
    }
  });
}
