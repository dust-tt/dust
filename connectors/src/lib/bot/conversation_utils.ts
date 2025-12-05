import { apiConfig } from "@connectors/lib/api/config";

export function makeDustAppUrl(path: string) {
  return `${apiConfig.getDustClientFacingUrl()}${path}`;
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
