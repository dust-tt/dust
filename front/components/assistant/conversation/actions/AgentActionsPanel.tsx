import { Spinner } from "@dust-tt/sparkle";
import React from "react";

import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { AgentActionsPanelHeader } from "@app/components/assistant/conversation/actions/AgentActionsPanelHeader";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { MCPActionType } from "@app/lib/actions/mcp";
import { useConversationMessage } from "@app/lib/swr/conversations";
import type { ConversationType, LightWorkspaceType } from "@app/types";

interface AgentActionsPanelProps {
  conversation: ConversationType | null;
  owner: LightWorkspaceType;
}

export function AgentActionsPanel({
  conversation,
  owner,
}: AgentActionsPanelProps) {
  const {
    closePanel,
    data: messageId,
    metadata: messageMetadata,
  } = useConversationSidePanelContext();

  const { message: fullAgentMessage, isMessageLoading } =
    useConversationMessage({
      conversationId: conversation?.sId ?? null,
      workspaceId: owner.sId,
      messageId: messageId ?? null,
    });

  if (
    !messageId ||
    !messageMetadata ||
    !fullAgentMessage ||
    fullAgentMessage.type !== "agent_message"
  ) {
    return null;
  }

  const { actionProgress } = messageMetadata;
  const isActing = fullAgentMessage.status === "created";

  const actions = fullAgentMessage.actions;

  const groupedActionsByStep = actions
    ? actions.reduce<Record<number, MCPActionType[]>>((acc, current) => {
        const currentStep = current.step + 1;
        return {
          ...acc,
          [currentStep]: [...(acc[currentStep] || []), current],
        };
      }, {})
    : {};

  return (
    <div className="flex h-full flex-col">
      <AgentActionsPanelHeader
        title="Breakdown of the tools used"
        onClose={closePanel}
      />
      <div className="flex-1 overflow-y-auto p-4">
        {isMessageLoading ? (
          <div className="flex justify-center">
            <Spinner variant="color" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {Object.entries(groupedActionsByStep).map(([step, actions]) => (
              <div
                className="flex flex-col gap-4 pb-4 duration-1000 animate-in fade-in"
                key={step}
              >
                <p className="heading-xl text-foreground dark:text-foreground-night">
                  Step {step}
                </p>
                {actions.map((action, idx) => {
                  const lastNotification =
                    actionProgress.get(action.id)?.progress ?? null;
                  return (
                    <div key={`action-${action.id}`}>
                      <MCPActionDetails
                        action={action}
                        lastNotification={lastNotification}
                        defaultOpen={idx === 0 && step === "1"}
                        owner={owner}
                        messageStatus={fullAgentMessage.status}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
            {isActing && (
              <div className="flex justify-center">
                <Spinner variant="color" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
