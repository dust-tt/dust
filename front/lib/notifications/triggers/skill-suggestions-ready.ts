import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { getNovuClient } from "@app/lib/notifications";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { SKILL_SUGGESTIONS_READY_TRIGGER_ID } from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { UserType } from "@app/types/user";
import { workflow } from "@novu/framework";
import z from "zod";

const SkillSuggestionsReadyPayloadSchema = z.object({
  workspaceId: z.string(),
  skillId: z.string(),
  skillName: z.string(),
  suggestionCount: z.number(),
});

type SkillSuggestionsReadyPayloadType = z.infer<
  typeof SkillSuggestionsReadyPayloadSchema
>;

export const skillSuggestionsReadyWorkflow = workflow(
  SKILL_SUGGESTIONS_READY_TRIGGER_ID,
  async ({ step, payload }) => {
    await step.inApp("send-in-app", async () => {
      return {
        subject: payload.skillName,
        body: `${payload.suggestionCount} new improvement suggestion${pluralize(payload.suggestionCount)} ready for review.`,
        primaryAction: {
          label: "Review",
          redirect: {
            url: getSkillBuilderRoute(payload.workspaceId, payload.skillId),
          },
        },
        data: {
          skillId: payload.skillId,
          skillName: payload.skillName,
        },
      };
    });
  },
  {
    payloadSchema: SkillSuggestionsReadyPayloadSchema,
    tags: ["admin"],
  }
);

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
