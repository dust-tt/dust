import { AgentActionsPanel } from "@app/components/assistant/conversation/actions/AgentActionsPanel";
import { InteractiveContentContainer } from "@app/components/assistant/conversation/content/InteractiveContentContainer";
import type { ConversationSidePanelType } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { ConversationType, WorkspaceType } from "@app/types";

interface ConversationSidePanelContentProps {
  conversation: ConversationType | null;
  owner: WorkspaceType;
  currentPanel: ConversationSidePanelType;
}

export default function ConversationSidePanelContent({
  conversation,
  owner,
  currentPanel,
}: ConversationSidePanelContentProps) {
  switch (currentPanel) {
    case "actions":
      return <AgentActionsPanel conversation={conversation} owner={owner} />;
    case "content":
      return (
        <InteractiveContentContainer
          conversation={conversation}
          owner={owner}
        />
      );
    default:
      return null;
  }
}
