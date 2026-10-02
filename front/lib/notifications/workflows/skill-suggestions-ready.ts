import { SkillSuggestionsReadyPayloadSchema } from "@app/lib/notifications/triggers/skill-suggestions-ready";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import { SKILL_SUGGESTIONS_READY_TRIGGER_ID } from "@app/types/notification_preferences";
import { pluralize } from "@app/types/shared/utils/string_utils";
import { workflow } from "@novu/framework";

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
