import { AgentActionsPanel } from "@app/components/assistant/conversation/actions/AgentActionsPanel";
import { InteractiveContentContainer } from "@app/components/assistant/conversation/interactive_content/InteractiveContentContainer";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";
import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";
import {
  AGENT_ACTIONS_SIDE_PANEL_TYPE,
  INTERACTIVE_CONTENT_SIDE_PANEL_TYPE,
} from "@app/types/conversation_side_panel";

interface ConversationSidePanelContentProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
  currentPanel: ConversationSidePanelType;
}

export default function ConversationSidePanelContent({
  conversation,
  owner,
  currentPanel,
}: ConversationSidePanelContentProps) {
  switch (currentPanel) {
    case AGENT_ACTIONS_SIDE_PANEL_TYPE:
      return <AgentActionsPanel conversation={conversation} owner={owner} />;

    case INTERACTIVE_CONTENT_SIDE_PANEL_TYPE:
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
