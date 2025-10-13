import {
  ActionPieChartIcon,
  Button,
  MultiPageDialog,
  MultiPageDialogContent,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ToolValidationDialogPage } from "@app/components/assistant/conversation/blocked_actions/ToolValidationDialogPage";
import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import { getIcon } from "@app/components/resources/resources_icons";
import { useValidateAction } from "@app/hooks/useValidateAction";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { useBlockedActions } from "@app/lib/swr/blocked_actions";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";

type BlockedActionQueueItem = {
  messageId: string;
  blockedAction: BlockedToolExecution;
};

const EMPTY_BLOCKED_ACTIONS_QUEUE: BlockedActionQueueItem[] = [];

function useBlockedActionsQueue({
  blockedActions,
  conversationId,
}: {
  blockedActions: BlockedToolExecution[];
  conversationId: string | null;
}) {
  const [blockedActionsQueue, setBlockedActionsQueue] = useState<
    BlockedActionQueueItem[]
  >([]);

  useEffect(() => {
    if (conversationId) {
      setBlockedActionsQueue(
        blockedActions.flatMap((action): BlockedActionQueueItem[] => {
          if (action.status === "blocked_child_action_input_required") {
            return action.childBlockedActionsList.map((childAction) => ({
              blockedAction: childAction,
              messageId: action.messageId,
            }));
          } else {
            return [{ blockedAction: action, messageId: action.messageId }];
          }
        })
      );
    } else {
      setBlockedActionsQueue(EMPTY_BLOCKED_ACTIONS_QUEUE);
    }
  }, [conversationId, blockedActions]);

  const enqueueBlockedAction = useCallback(
    ({
      messageId,
      blockedAction,
    }: {
      messageId: string;
      blockedAction: BlockedToolExecution;
    }) => {
      setBlockedActionsQueue((prevQueue) => {
        const existingIndex = prevQueue.findIndex(
          (v) => v.blockedAction.actionId === blockedAction.actionId
        );

        // If the action is not in the queue, add it.
        // If the action is in the queue, replace it with the new one.
        return existingIndex === -1
          ? [...prevQueue, { blockedAction, messageId }]
          : prevQueue.map((item, index) =>
              index === existingIndex ? { blockedAction, messageId } : item
            );
      });
    },
    []
  );

  const removeCompletedAction = useCallback((actionId: string) => {
    setBlockedActionsQueue((prevQueue) =>
      prevQueue.filter((item) => item.blockedAction.actionId !== actionId)
    );
  }, []);

  const emptyBlockedActionsQueue = useCallback(() => {
    setBlockedActionsQueue(EMPTY_BLOCKED_ACTIONS_QUEUE);
  }, []);

  return {
    blockedActionsQueue,
    enqueueBlockedAction,
    removeCompletedAction,
    emptyBlockedActionsQueue,
  };
}

type ActionValidationContextType = {
  enqueueBlockedAction: (params: {
    messageId: string;
    blockedAction: BlockedToolExecution;
  }) => void;
  showBlockedActionsDialog: () => void;
  hasBlockedActions: boolean;
  totalBlockedActions: number;
};

const ActionValidationContext = createContext<
  ActionValidationContextType | undefined
>(undefined);

export function useActionValidationContext() {
  const context = useContext(ActionValidationContext);
  if (!context) {
    throw new Error(
      "useActionValidationContext must be used within an ActionValidationContext"
    );
  }

  return context;
}

interface BlockedActionsProviderProps {
  owner: LightWorkspaceType;
  conversation: ConversationWithoutContentType | null;
  children: ReactNode;
}

export function BlockedActionsProvider({
  owner,
  conversation,
  children,
}: BlockedActionsProviderProps) {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const conversationId = conversation?.sId || null;

  const { blockedActions } = useBlockedActions({
    conversationId,
    workspaceId: owner.sId,
  });

  const {
    blockedActionsQueue,
    enqueueBlockedAction,
    emptyBlockedActionsQueue,
  } = useBlockedActionsQueue({
    blockedActions,
    conversationId,
  });

  const pendingValidations = useMemo(() => {
    return blockedActionsQueue.filter(
      (action) => action.blockedAction.status === "blocked_validation_required"
    );
  }, [blockedActionsQueue]);

  const [currentValidationIndex, setCurrentValidationIndex] = useState(0);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [neverAskAgain, setNeverAskAgain] = useState(false);

  // Track the status of the current submit action.
  const [submitStatus, setSubmitStatus] =
    useState<MCPValidationOutputType | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { validateAction, isValidating } = useValidateAction({
    owner,
    conversation,
    onError: setErrorMessage,
  });

  useNavigationLock(isDialogOpen);

  const submitValidation = async (status: MCPValidationOutputType) => {
    setSubmitStatus(status);

    const currentBlockedAction = pendingValidations[currentValidationIndex];
    if (!currentBlockedAction) {
      setErrorMessage("No blocked action found. Please try again.");
      return;
    }

    const { blockedAction, messageId } = currentBlockedAction;

    const result = await validateAction({
      validationRequest: blockedAction,
      messageId,
      approved:
        status === "approved" && neverAskAgain ? "always_approved" : status,
    });

    if (!result.success) {
      setErrorMessage("Failed to assess action approval. Please try again.");
      return;
    }

    setSubmitStatus(null);
    setNeverAskAgain(false);
    setErrorMessage(null);

    // Move to next validation or close dialog if done
    if (currentValidationIndex + 1 < pendingValidations.length) {
      setCurrentValidationIndex(currentValidationIndex + 1);
    } else {
      // Wait until all validations are completed before clearing the queue.
      // This avoids re-rendering the dialog for each action.
      emptyBlockedActionsQueue();

      // Close dialog if no more blocked actions
      setIsDialogOpen(false);
      setCurrentValidationIndex(0);
    }
  };

  // Opens the dialog when there are new pending validations
  useEffect(() => {
    if (pendingValidations.length > 0 && !isDialogOpen) {
      setCurrentValidationIndex(0);
      setIsDialogOpen(true);
    }
  }, [pendingValidations.length, isDialogOpen]);

  // Close the dialog when there are no more blocked actions
  useEffect(() => {
    if (blockedActionsQueue.length === 0 && isDialogOpen && !isValidating) {
      setIsDialogOpen(false);
      setCurrentValidationIndex(0);
    }
  }, [blockedActionsQueue.length, isDialogOpen, isValidating]);

  const showBlockedActionsDialog = useCallback(() => {
    if (blockedActionsQueue.length > 0 && pendingValidations.length > 0) {
      setCurrentValidationIndex(0);
      setIsDialogOpen(true);
    }
  }, [blockedActionsQueue.length, pendingValidations.length]);

  const hasBlockedActions = pendingValidations.length > 0;
  const totalBlockedActions = pendingValidations.length;

  const pages = useMemo(() => {
    if (pendingValidations.length > 0) {
      return pendingValidations.map((item) => {
        const { blockedAction } = item;
        return {
          id: `validation-${blockedAction.actionId}`,
          title: "Tool Validation Required",
          icon: blockedAction.metadata.icon
            ? getIcon(blockedAction.metadata.icon)
            : ActionPieChartIcon,
          content: (
            <ToolValidationDialogPage
              blockedAction={blockedAction}
              errorMessage={errorMessage}
              neverAskAgain={neverAskAgain}
              setNeverAskAgain={setNeverAskAgain}
            />
          ),
        };
      });
    }

    return [];
  }, [pendingValidations, errorMessage, neverAskAgain]);

  const currentPageId = useMemo(() => {
    if (pages.length === 0) {
      return "";
    }

    if (pendingValidations[currentValidationIndex]) {
      return `validation-${pendingValidations[currentValidationIndex].blockedAction.actionId}`;
    }

    return pages[0]?.id || "";
  }, [pages, currentValidationIndex, pendingValidations]);

  return (
    <ActionValidationContext.Provider
      value={{
        showBlockedActionsDialog,
        enqueueBlockedAction,
        hasBlockedActions,
        totalBlockedActions,
      }}
    >
      {children}

      <MultiPageDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        {pages.length > 0 && (
          <MultiPageDialogContent
            pages={pages}
            currentPageId={currentPageId}
            onPageChange={() => {}}
            hideCloseButton
            size="lg"
            isAlertDialog
            showNavigation={pages.length > 1}
            showHeaderNavigation={false}
            footerContent={(() => {
              return (
                <div className="flex flex-row justify-end gap-2">
                  <Button
                    variant="outline"
                    label="Decline"
                    onClick={() => submitValidation("rejected")}
                    disabled={isValidating}
                    isLoading={submitStatus === "rejected"}
                  >
                    Decline
                  </Button>
                  <Button
                    variant="highlight"
                    label="Allow"
                    autoFocus
                    onClick={() => submitValidation("approved")}
                    disabled={isValidating}
                    isLoading={submitStatus === "approved"}
                  />
                </div>
              );
            })()}
          />
        )}
      </MultiPageDialog>
    </ActionValidationContext.Provider>
  );
}
