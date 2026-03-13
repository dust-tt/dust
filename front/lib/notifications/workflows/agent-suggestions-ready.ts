import { getEditors } from "@app/lib/api/assistant/editors";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { getNovuClient } from "@app/lib/notifications";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { AGENT_SUGGESTIONS_READY_TRIGGER_ID } from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workflow } from "@novu/framework";
import z from "zod";

const AgentSuggestionsReadyPayloadSchema = z.object({
  workspaceId: z.string(),
  agentConfigurationId: z.string(),
  agentName: z.string(),
  suggestionCount: z.number(),
});

type AgentSuggestionsReadyPayloadType = z.infer<
  typeof AgentSuggestionsReadyPayloadSchema
>;

export const agentSuggestionsReadyWorkflow = workflow(
  AGENT_SUGGESTIONS_READY_TRIGGER_ID,
  async ({ step, payload }) => {
    await step.inApp("send-in-app", async () => {
      const countLabel =
        payload.suggestionCount === 1
          ? "1 suggestion"
          : `${payload.suggestionCount} suggestions`;

      return {
        subject: `@${payload.agentName}`,
        body: `New improvement suggestions are ready for review (${countLabel}).`,
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
          autoDelete: true,
        },
      };
    });
  },
  {
    payloadSchema: AgentSuggestionsReadyPayloadSchema,
    tags: ["admin"],
  }
);

export const triggerAgentSuggestionsReadyNotifications = async (
  auth: Authenticator,
  {
    agentConfiguration,
    suggestionCount,
  }: {
    agentConfiguration: LightAgentConfigurationType;
    suggestionCount: number;
  }
): Promise<Result<void, DustError<"internal_error">>> => {
  if (suggestionCount === 0) {
    return new Ok(undefined);
  }

  const editors = await getEditors(auth, agentConfiguration);

  if (editors.length === 0) {
    logger.info(
      { agentConfigurationId: agentConfiguration.sId },
      "No editors found for agent, skipping suggestions ready notification"
    );
    return new Ok(undefined);
  }

  try {
    const novuClient = await getNovuClient();

    const payload: AgentSuggestionsReadyPayloadType = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      agentConfigurationId: agentConfiguration.sId,
      agentName: agentConfiguration.name,
      suggestionCount,
    };

    const r = await novuClient.triggerBulk({
      events: editors.map((editor) => ({
        workflowId: AGENT_SUGGESTIONS_READY_TRIGGER_ID,
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
        message: `Failed to trigger agent suggestions ready notification: ${eventErrors}`,
      });
    }
  } catch (err) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Failed to trigger agent suggestions ready notification",
      cause: normalizeError(err),
    });
  }

  return new Ok(undefined);
};

/**
 * Fire-and-forget helper to notify agent editors that reinforcement suggestions are ready.
 * Errors are logged but don't block the caller.
 */
export function notifyAgentSuggestionsReady(
  auth: Authenticator,
  {
    agentConfiguration,
    suggestionCount,
  }: {
    agentConfiguration: LightAgentConfigurationType;
    suggestionCount: number;
  }
): void {
  void triggerAgentSuggestionsReadyNotifications(auth, {
    agentConfiguration,
    suggestionCount,
  }).then((notifRes) => {
    if (notifRes.isErr()) {
      logger.error(
        {
          error: notifRes.error,
          agentConfigurationId: agentConfiguration.sId,
        },
        "Failed to trigger agent suggestions ready notification"
      );
    }
  });
}
