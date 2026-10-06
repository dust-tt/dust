import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import { SkillSuggestionsReadyPayloadSchema } from "@app/lib/notifications/triggers/skill-suggestions-ready";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import { SKILL_SUGGESTIONS_READY_TRIGGER_ID } from "@app/types/notification_preferences";
import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { workflow } from "@novu/framework";

export function buildSkillSuggestionsReadyInAppCopy(
  i18n: I18n,
  suggestionCount: number
): { body: string; actionLabel: string } {
  return {
    body: i18n._(
      msg`${plural(suggestionCount, {
        one: "# new improvement suggestion ready for review.",
        other: "# new improvement suggestions ready for review.",
      })}`
    ),
    actionLabel: i18n._(msg({ message: "Review", context: "action" })),
  };
}

export const skillSuggestionsReadyWorkflow = workflow(
  SKILL_SUGGESTIONS_READY_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.inApp("send-in-app", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { body, actionLabel } = buildSkillSuggestionsReadyInAppCopy(
        i18n,
        payload.suggestionCount
      );
      return {
        subject: payload.skillName,
        body,
        primaryAction: {
          label: actionLabel,
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
