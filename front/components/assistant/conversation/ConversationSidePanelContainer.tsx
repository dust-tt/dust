import { AgentActionsPanel } from "@app/components/assistant/conversation/actions/AgentActionsPanel";
import { InteractiveContentContainer } from "@app/components/assistant/conversation/content/InteractiveContentContainer";
import { ConversationSidePanelType } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationType, WorkspaceType } from "@app/types";

interface ConversationSidePanelContainerProps {
  currentPanel: ConversationSidePanelType;
  conversation: ConversationType | null;
  owner: WorkspaceType;
}

export default function ConversationSidePanelContainer({
  currentPanel,
  conversation,
  owner,
}: ConversationSidePanelContainerProps) {
  return (
    <>
      {currentPanel === "content" && (
        <InteractiveContentContainer
          conversation={conversation}
          owner={owner}
        />
      )}
      {currentPanel === "actions" && (
        <AgentActionsPanel conversation={conversation} owner={owner} />
      )}
    </>
  );
}
