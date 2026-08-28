import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";

type ApiErrorResponse = ReturnType<typeof apiError>;

export function rejectArchivedAgent(
  ctx: Context,
  agent: LightAgentConfigurationType
): ApiErrorResponse | null {
  if (agent.status !== "archived") {
    return null;
  }

  return apiError(ctx, {
    status_code: 400,
    api_error: {
      type: "invalid_request_error",
      message: "An archived agent cannot be updated. Restore it first.",
    },
  });
}

export function rejectArchivedAgents(
  ctx: Context,
  agents: LightAgentConfigurationType[]
): ApiErrorResponse | null {
  const archivedAgentNames = agents
    .filter((agent) => agent.status === "archived")
    .map((agent) => agent.name);
  if (archivedAgentNames.length === 0) {
    return null;
  }

  return apiError(ctx, {
    status_code: 400,
    api_error: {
      type: "invalid_request_error",
      message: `Archived agents cannot be updated: ${archivedAgentNames.join(", ")}. Restore them first.`,
    },
  });
}
