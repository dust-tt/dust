import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";

import { getActionSpecification } from "@app/components/actions/types";
import type { ActionProgressState } from "@app/lib/assistant/state/messageReducer";
import { useConversationMessage } from "@app/lib/swr/conversations";
import type {
  AgentActionType,
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
      messageId: message.sId,
    });

  const actions =
    fullAgentMessage?.type === "agent_message" ? fullAgentMessage.actions : [];

  const groupedActionsByStep = actions
    ? actions.reduce<Record<number, AgentActionType[]>>((acc, current) => {
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
                    const actionSpecification = getActionSpecification(
                      action.type
                    );
                    const lastNotification =
                      actionProgress.get(action.id)?.progress ?? null;
                    const ActionDetailsComponent =
                      actionSpecification.detailsComponent;
                    return (
                      <div key={`action-${action.id}`}>
                        <ActionDetailsComponent
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
