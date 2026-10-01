import { getAgentBuilderRoute } from "@app/lib/utils/router";
import { AGENT_SUGGESTIONS_READY_TRIGGER_ID } from "@app/types/notification_preferences";
import { pluralize } from "@app/types/shared/utils/string_utils";
import { workflow } from "@novu/framework";
import z from "zod";

const AgentSuggestionsReadyPayloadSchema = z.object({
  workspaceId: z.string(),
  agentConfigurationId: z.string(),
  agentName: z.string(),
  suggestionCount: z.number(),
});

export const agentSuggestionsReadyWorkflow = workflow(
  AGENT_SUGGESTIONS_READY_TRIGGER_ID,
  async ({ step, payload }) => {
    await step.inApp("send-in-app", async () => {
      return {
        subject: payload.agentName,
        body: `${payload.suggestionCount} new improvement suggestion${pluralize(payload.suggestionCount)} ready for review.`,
        primaryAction: {
          label: "Review",
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
