import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useReducer } from "react";

import { getActionSpecification } from "@app/components/actions/types";
import { useEventSource } from "@app/hooks/useEventSource";
import type { MessageTemporaryState } from "@app/lib/assistant/state/fullMessageReducer";
import { MessageReducer } from "@app/lib/assistant/state/fullMessageReducer";
import type { ActionProgressState } from "@app/lib/assistant/state/messageReducer";
import { useConversationMessage } from "@app/lib/swr/conversations";
import type {
  AgentActionType,
  AgentMessageType,
  LightAgentMessageType,
  LightWorkspaceType,
} from "@app/types";
import { isAgentMessageType } from "@app/types";

function makeInitialFullMessageState(
  fullMessage: AgentMessageType | null
): MessageTemporaryState {
  if (!fullMessage) {
    return {
      message: null as any,
      agentState: "done",
      isRetrying: false,
      lastUpdated: new Date(),
      actionProgress: new Map(),
    };
  }

  return {
    message: fullMessage,
    agentState: fullMessage.status === "created" ? "thinking" : "done",
    isRetrying: false,
    lastUpdated: new Date(),
    actionProgress: new Map(),
  };
}

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

  const [drawerState, dispatch] = useReducer(MessageReducer, null, () =>
    makeInitialFullMessageState(null)
  );

  useEffect(() => {
    if (fullAgentMessage && isAgentMessageType(fullAgentMessage)) {
      dispatch({
        type: "agent_message_success",
        created: Date.now(),
        configurationId: fullAgentMessage.configuration.sId,
        messageId: fullAgentMessage.sId,
        message: fullAgentMessage,
        runIds: [],
      });
    }
  }, [fullAgentMessage]);

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      if (!isOpened || !message.sId || !fullAgentMessage) {
        return null;
      }

      const esURL = `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/events`;
      let lastEventId = "";
      if (lastEvent) {
        const eventPayload: { eventId: string } = JSON.parse(lastEvent);
        lastEventId = eventPayload.eventId;
      }
      return esURL + "?lastEventId=" + lastEventId;
    },
    [isOpened, message.sId, owner.sId, conversationId, fullAgentMessage]
  );

  const onEventCallback = useCallback((eventStr: string) => {
    const eventPayload: {
      eventId: string;
      data: any;
    } = JSON.parse(eventStr);

    if (
      eventPayload.data.type === "tool_approve_execution" ||
      eventPayload.data.type === "end-of-stream"
    ) {
      return;
    }

    const shouldUpdate =
      eventPayload.data.type === "agent_action_success" ||
      eventPayload.data.type === "agent_message_success";

    if (shouldUpdate) {
      dispatch(eventPayload.data);
    }
  }, []);

  useEventSource(
    buildEventSourceURL,
    onEventCallback,
    `drawer-message-${message.sId}`,
    {
      isReadyToConsumeStream: isOpened && !!fullAgentMessage,
    }
  );

  const actions =
    drawerState?.message?.actions ||
    (fullAgentMessage?.type === "agent_message"
      ? fullAgentMessage.actions
      : []);

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
