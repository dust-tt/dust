import { AgentActionsPanel } from "@app/components/assistant/conversation/actions/AgentActionsPanel";
import { ContentCreationContainer } from "@app/components/assistant/conversation/content_creation/ContentCreationContainer";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";
import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";
import {
  AGENT_ACTIONS_SIDE_PANEL_TYPE,
  CONTENT_CREATION_SIDE_PANEL_TYPE,
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

    case CONTENT_CREATION_SIDE_PANEL_TYPE:
      return (
        <ContentCreationContainer conversation={conversation} owner={owner} />
      );

    default:
      return null;
  }
}
