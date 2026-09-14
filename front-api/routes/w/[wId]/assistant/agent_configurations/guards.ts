import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";

export const ARCHIVED_AGENT_API_ERROR: APIErrorWithContentfulStatusCode = {
  status_code: 400,
  api_error: {
    type: "invalid_request_error",
    message: "An archived agent cannot be updated. Restore it first.",
  },
};

export function isArchivedAgent(agent: LightAgentConfigurationType): boolean {
  return agent.status === "archived";
}

export function isArchivedAgents(
  agents: LightAgentConfigurationType[]
): boolean {
  return agents.some(isArchivedAgent);
}
