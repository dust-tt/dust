import type { LightWorkspaceType } from "@dust-tt/types";

interface ConversationViewerProps {
  conversationId: string;
  owner: LightWorkspaceType;
}

export function ConversationViewer({
  conversationId,
  owner,
}: ConversationViewerProps) {
  console.log(conversationId, owner);
  return <div>Viewing conversation {conversationId}</div>;
}
