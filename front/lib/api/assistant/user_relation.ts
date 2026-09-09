import { AgentResource } from "@app/lib/resources/agent_resource";

export function setAgentUserFavorite(
  ...args: Parameters<typeof AgentResource.setUserFavorite>
): ReturnType<typeof AgentResource.setUserFavorite> {
  return AgentResource.setUserFavorite(...args);
}
