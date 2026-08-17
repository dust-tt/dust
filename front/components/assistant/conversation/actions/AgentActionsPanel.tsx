import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { AgentActionsPanelHeader } from "@app/components/assistant/conversation/actions/AgentActionsPanelHeader";
import {
  parseDataAsMessageIdAndActionId,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { useConversationMessageAction } from "@app/hooks/conversations";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { Spinner, XClose } from "@dust-tt/sparkle";

import type React from "react";

interface AgentActionsPanelProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

interface AgentSingleActionPanelProps extends AgentActionsPanelProps {
  messageId: string;
  actionId: string;
  virtuosoMsg: AgentMessageWithStreaming | null;
  closeIcon?: React.ComponentType;
  onClose: () => void;
}

export function AgentSingleActionPanel({
  conversation,
  owner,
  messageId,
  actionId,
  virtuosoMsg,
  closeIcon = XClose,
  onClose,
}: AgentSingleActionPanelProps) {
  const {
    action: fetchedAction,
    messageStatus,
    isActionLoading,
  } = useConversationMessageAction({
    conversationId: conversation.sId,
    workspaceId: owner.sId,
    messageId,
    actionId,
  });

  // While the agent is streaming, the SWR-fetched action snapshot can lag the
  // live state held in the Virtuoso message (e.g. status / executionDurationMs
  // arrive via stream events). Prefer the streaming action when available so
  // the panel reflects completion as soon as it happens.
  const liveAction =
    virtuosoMsg?.sId === messageId
      ? (virtuosoMsg.actions.find((a) => a.sId === actionId) ?? null)
      : null;
  const action = liveAction ?? fetchedAction;

  // Extract streaming progress for the action from the Virtuoso message state.
  const lastNotification =
    action && virtuosoMsg?.sId === messageId && virtuosoMsg.status === "created"
      ? (virtuosoMsg.streaming.actionProgress.get(action.id)?.progress ?? null)
      : null;

  if (isActionLoading && !action) {
    return (
      <AgentActionsPanelHeader
        title="Tool detail"
        closeIcon={closeIcon}
        onClose={onClose}
      >
        <div className="flex items-center justify-center">
          <Spinner />
        </div>
      </AgentActionsPanelHeader>
    );
  }

  if (!action) {
    return (
      <AgentActionsPanelHeader
        title="Tool detail"
        closeIcon={closeIcon}
        onClose={onClose}
      >
        <div className="flex items-center justify-center">
          <span className="text-muted-foreground">Nothing to display.</span>
        </div>
      </AgentActionsPanelHeader>
    );
  }

  return (
    <div className="flex h-panel flex-col bg-panel-background">
      <AgentActionsPanelHeader
        title="Tool detail"
        closeIcon={closeIcon}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto p-4 pb-12">
        <MCPActionDetails
          displayContext="sidebar-single-action"
          action={action}
          lastNotification={lastNotification}
          owner={owner}
          messageStatus={messageStatus}
        />
      </div>
    </div>
  );
}

export function AgentActionsPanel({
  conversation,
  owner,
}: AgentActionsPanelProps) {
  const {
    closePanel,
    virtuosoMsg,
    data: rawData,
  } = useConversationSidePanelContext();

  const { messageId, actionId } = parseDataAsMessageIdAndActionId(rawData);

  if (!messageId || !actionId) {
    return null;
  }

  return (
    <AgentSingleActionPanel
      key={actionId}
      conversation={conversation}
      owner={owner}
      messageId={messageId}
      actionId={actionId}
      virtuosoMsg={virtuosoMsg}
      onClose={closePanel}
    />
  );
}
