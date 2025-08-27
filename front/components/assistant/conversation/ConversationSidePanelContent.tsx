import { AgentActionsPanel } from "@app/components/assistant/conversation/actions/AgentActionsPanel";
import { CanvasContainer } from "@app/components/assistant/conversation/canvas/CanvasContainer";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";
import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";
import {
  AGENT_ACTIONS_SIDE_PANEL_TYPE,
  CANVAS_SIDE_PANEL_TYPE,
} from "@app/types/conversation_side_panel";

interface ConversationSidePanelContentProps {
  conversation: ConversationWithoutContentType | null;
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

    case CANVAS_SIDE_PANEL_TYPE:
      return <CanvasContainer conversation={conversation} owner={owner} />;

    default:
      return null;
  }
}
