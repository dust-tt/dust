import { AgentActionsPanelForMessage } from "@app/components/assistant/conversation/actions/AgentActionsPanel";
import { MessageItem } from "@app/components/assistant/conversation/MessageItem";
import {
  type AgentMessageWithStreaming,
  isAgentMessageWithStreaming,
  type VirtuosoMessage,
  type VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  useCancelMessage,
  useConversationBranchActions,
} from "@app/hooks/conversations";
import {
  ArrowLeftIcon,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetTitle,
  Tabs,
  TabsContent,
} from "@dust-tt/sparkle";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import { useMemo, useState } from "react";

export function ConversationBranchApprovalModal({
  context,
}: {
  context: VirtuosoMessageListContext;
}) {
  const methods = useVirtuosoMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >();
  const branchMessagesToApprove = methods.data
    .get()
    .filter((m) => m.branchId === context.branchIdToApprove);

  const title = useMemo(() => {
    // Find the name of the agent(s) in the branch messages
    const agentNames = branchMessagesToApprove
      .filter(isAgentMessageWithStreaming)
      .map((m) => {
        return `@${m.configuration.name}`;
      });
    return agentNames.join(", ");
  }, [branchMessagesToApprove]);

  const description = useMemo(() => {
    const hasMultipleAgents =
      branchMessagesToApprove.filter(isAgentMessageWithStreaming).length > 1;
    if (hasMultipleAgents) {
      return `Your agents have access to sensitive data. Review the Agent messages before publishing them in the conversation.`;
    }
    return `Your agent has access to sensitive data. Review the Agent message before publishing it in the conversation.`;
  }, [branchMessagesToApprove]);

  const [selectedTab, setSelectedTab] = useState<"messages" | "details">(
    "messages"
  );
  const [selectedMessage, setSelectedMessage] =
    useState<AgentMessageWithStreaming | null>(null);

  const { mergeBranch, closeBranch, isMerging, isClosing } =
    useConversationBranchActions({
      owner: context.owner,
      conversationId: context.conversation?.sId,
    });

  const cancelMessage = useCancelMessage({
    owner: context.owner,
    conversationId: context.conversation?.sId,
  });

  const branchId = context.branchIdToApprove ?? null;

  const [activeBranchAction, setActiveBranchAction] = useState<
    "close" | "merge" | null
  >(null);

  const isBranchActionInProgress =
    isMerging || isClosing || activeBranchAction !== null;

  const allAgentMessagesSucceeded = useMemo(() => {
    const agentMessages = branchMessagesToApprove.filter(
      isAgentMessageWithStreaming
    );
    return (
      agentMessages.length > 0 &&
      agentMessages.every((m) => m.status === "succeeded")
    );
  }, [branchMessagesToApprove]);

  const cancelOngoingAgentGenerations = async () => {
    const inFlightAgentMessageIds = branchMessagesToApprove
      .filter(isAgentMessageWithStreaming)
      .filter((m) => m.status === "created")
      .map((m) => m.sId);

    await cancelMessage(inFlightAgentMessageIds);
  };

  return (
    <Sheet defaultOpen={false} open={branchMessagesToApprove.length > 0}>
      <SheetContent
        side="right"
        size="3xl"
        className="flex h-full flex-col p-0"
      >
        <div className="shrink-0">
          <SheetTitle className="mt-4 px-4 text-base font-semibold">
            {title}
          </SheetTitle>
          <SheetDescription className="px-4 pb-4">
            {description}
          </SheetDescription>
        </div>
        <Tabs value={selectedTab} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <TabsContent value="messages" className="h-full">
              <ScrollArea className="h-full">
                {branchMessagesToApprove.map((m, index) => (
                  <div key={m.sId} className="px-4">
                    <MessageItem
                      allowBranchMessages={true}
                      data={m}
                      context={context}
                      nextData={branchMessagesToApprove.at(index + 1) ?? null}
                      prevData={branchMessagesToApprove.at(index - 1) ?? null}
                      onAgentMessageCompletionStatusClick={(messageId) => {
                        setSelectedMessage(
                          branchMessagesToApprove
                            .filter(isAgentMessageWithStreaming)
                            .find((m) => m.sId === messageId) ?? null
                        );
                        setSelectedTab("details");
                      }}
                    />
                  </div>
                ))}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="details" className="h-full">
              <div className="h-full">
                {context.conversation && selectedMessage ? (
                  <AgentActionsPanelForMessage
                    conversation={context.conversation}
                    owner={context.owner}
                    messageId={selectedMessage.sId}
                    virtuosoMsg={selectedMessage}
                    closeIcon={ArrowLeftIcon}
                    onClose={() => {
                      setSelectedMessage(null);
                      setSelectedTab("messages");
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
                    Select an agent message to view its details.
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
        <div className="shrink-0">
          <SheetFooter
            leftButtonProps={{
              label: "Reject",
              variant: "outline",
              disabled: !branchId || isBranchActionInProgress,
              isLoading: isClosing || activeBranchAction === "close",
              onClick: async () => {
                if (!branchId) {
                  return;
                }
                setActiveBranchAction("close");
                try {
                  await cancelOngoingAgentGenerations();
                  const ok = await closeBranch(branchId);
                  if (ok) {
                    context.setBranchIdToApprove?.(null);
                  }
                } finally {
                  setActiveBranchAction(null);
                }
              },
            }}
            rightButtonProps={{
              label: "Publish in conversation",
              variant: "highlight",
              disabled:
                !branchId ||
                isBranchActionInProgress ||
                !allAgentMessagesSucceeded,
              isLoading: isMerging || activeBranchAction === "merge",
              onClick: async () => {
                if (!branchId) {
                  return;
                }
                setActiveBranchAction("merge");
                try {
                  await cancelOngoingAgentGenerations();
                  const ok = await mergeBranch(branchId);
                  if (ok) {
                    context.setBranchIdToApprove?.(null);
                  }
                } finally {
                  setActiveBranchAction(null);
                }
              },
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
