import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";

import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import type { MCPActionType } from "@app/lib/actions/mcp";
import type { ActionProgressState } from "@app/lib/assistant/state/messageReducer";
import { useConversationMessage } from "@app/lib/swr/conversations";
import type {
  LightAgentMessageType,
  LightWorkspaceType,
} from "@app/types";

interface AgentMessageActionsDrawerProps {
  conversationId: string;
  message: LightAgentMessageType;
  actionProgress: ActionProgressState;
  isOpened: boolean;
  isActing: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}
export function AgentMessageActionsDrawer({
  conversationId,
  message,
  actionProgress,
  isOpened,
  isActing,
  onClose,
  owner,
}: AgentMessageActionsDrawerProps) {
  const { message: fullAgentMessage, isMessageLoading } =
    useConversationMessage({
      conversationId,
      workspaceId: owner.sId,
      messageId: isOpened ? message.sId : null,
    });

  const actions =
    fullAgentMessage?.type === "agent_message" ? fullAgentMessage.actions : [];

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
    <Sheet
      open={isOpened}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>Breakdown of the tools used</SheetTitle>
        </SheetHeader>
        <SheetContainer>
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
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
