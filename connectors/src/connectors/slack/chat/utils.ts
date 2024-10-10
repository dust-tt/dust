import { slackConfig } from "@connectors/connectors/slack/lib/config";

export function makeDustAppUrl(path: string) {
  return `${slackConfig.getRequiredDustBaseUrl()}${path}`;
}

export function makeConversationUrl(
  workspaceId?: string,
  conversationId?: string | null
) {
  if (workspaceId && conversationId) {
    return makeDustAppUrl(`/w/${workspaceId}/assistant/${conversationId}`);
  }
  return null;
}
