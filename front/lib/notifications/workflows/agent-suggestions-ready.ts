import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import { AGENT_SUGGESTIONS_READY_TRIGGER_ID } from "@app/types/notification_preferences";
import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { workflow } from "@novu/framework";
import z from "zod";

const AgentSuggestionsReadyPayloadSchema = z.object({
  workspaceId: z.string(),
  agentConfigurationId: z.string(),
  agentName: z.string(),
  suggestionCount: z.number(),
});

export function buildAgentSuggestionsReadyInAppCopy(
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

export const agentSuggestionsReadyWorkflow = workflow(
  AGENT_SUGGESTIONS_READY_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.inApp("send-in-app", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { body, actionLabel } = buildAgentSuggestionsReadyInAppCopy(
        i18n,
        payload.suggestionCount
      );
      return {
        subject: payload.agentName,
        body,
        primaryAction: {
          label: actionLabel,
          redirect: {
            url: getAgentBuilderRoute(
              payload.workspaceId,
              payload.agentConfigurationId
            ),
          },
        },
        data: {
          agentConfigurationId: payload.agentConfigurationId,
          agentName: payload.agentName,
        },
      };
    });
  },
  {
    payloadSchema: AgentSuggestionsReadyPayloadSchema,
    tags: ["admin"],
  }
);
