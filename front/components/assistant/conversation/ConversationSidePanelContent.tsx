import { AgentActionsPanel } from "@app/components/assistant/conversation/actions/AgentActionsPanel";
import { ConversationAgentPanel } from "@app/components/assistant/conversation/agent_panel/ConversationAgentPanel";
import { ConversationCreditUsagePanel } from "@app/components/assistant/conversation/credits_panel/ConversationCreditUsagePanel";
import { ConversationFilesPanel } from "@app/components/assistant/conversation/files_panel/ConversationFilesPanel";
import { FilePreviewPanel } from "@app/components/assistant/conversation/files_panel/FilePreviewPanel";
import { InteractiveContentContainer } from "@app/components/assistant/conversation/interactive_content/InteractiveContentContainer";
import { ConversationPlanModePanel } from "@app/components/assistant/conversation/plan_mode/ConversationPlanModePanel";
import { ConversationSkillPanel } from "@app/components/assistant/conversation/skill_panel/ConversationSkillPanel";
import { ConversationToolPanel } from "@app/components/assistant/conversation/tool_panel/ConversationToolPanel";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";
import {
  AGENT_ACTIONS_SIDE_PANEL_TYPE,
  AGENT_SIDE_PANEL_TYPE,
  CREDITS_SIDE_PANEL_TYPE,
  FILE_PREVIEW_SIDE_PANEL_TYPE,
  FILES_SIDE_PANEL_TYPE,
  INTERACTIVE_CONTENT_SIDE_PANEL_TYPE,
  PLAN_SIDE_PANEL_TYPE,
  SKILL_SIDE_PANEL_TYPE,
  TOOL_SIDE_PANEL_TYPE,
} from "@app/types/conversation_side_panel";
import type { LightWorkspaceType } from "@app/types/user";

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

    case FILE_PREVIEW_SIDE_PANEL_TYPE:
      return <FilePreviewPanel conversation={conversation} owner={owner} />;

    case FILES_SIDE_PANEL_TYPE:
      return (
        <ConversationFilesPanel conversation={conversation} owner={owner} />
      );

    case CREDITS_SIDE_PANEL_TYPE:
      return (
        <ConversationCreditUsagePanel
          conversation={conversation}
          owner={owner}
        />
      );

    case PLAN_SIDE_PANEL_TYPE:
      return (
        <ConversationPlanModePanel conversation={conversation} owner={owner} />
      );

    case SKILL_SIDE_PANEL_TYPE:
      return <ConversationSkillPanel owner={owner} />;

    case TOOL_SIDE_PANEL_TYPE:
      return <ConversationToolPanel owner={owner} />;

    case AGENT_SIDE_PANEL_TYPE:
      return <ConversationAgentPanel owner={owner} />;

    default:
      return null;
  }
}
