import { apiConfig } from "@connectors/lib/api/config";

export function makeDustAppUrl(path: string) {
  return `${apiConfig.getDustAppUrl()}${path}`;
}

export function makeConversationUrl(
  workspaceId?: string,
  conversationId?: string | null
) {
  if (workspaceId && conversationId) {
    return makeDustAppUrl(`/w/${workspaceId}/conversation/${conversationId}`);
  }
  return null;
}

/**
 * Opens the agent details sheet in the given conversation (same query as front
 * `getConversationRoute(wId, conversationId, \`agentDetails=${agentConfigurationId}\`)`).
 */
export function makeAgentDetailsInConversationUrl(
  workspaceId: string,
  conversationId: string,
  agentConfigurationId: string
): string {
  const q = new URLSearchParams({
    agentDetails: agentConfigurationId,
  });
  return makeDustAppUrl(
    `/w/${workspaceId}/conversation/${conversationId}?${q.toString()}`
  );
}
