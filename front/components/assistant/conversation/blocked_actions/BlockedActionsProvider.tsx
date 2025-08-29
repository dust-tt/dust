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

import { AuthenticationDialogPage } from "@app/components/assistant/conversation/blocked_actions/DialogAuthenticationpPage";
import { ToolValidationDialogPage } from "@app/components/assistant/conversation/blocked_actions/DialogToolValidationPage";
import type { BlockedActionQueueItem } from "@app/components/assistant/conversation/blocked_actions/type";
import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import { useValidateAction } from "@app/hooks/useValidateAction";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { getIcon } from "@app/lib/actions/mcp_icons";
import { useBlockedActions } from "@app/lib/swr/blocked_actions";
import { useCreatePersonalConnection } from "@app/lib/swr/mcp_servers";
import type {
  ConversationWithoutContentType,
  LightAgentMessageType,
  LightWorkspaceType,
} from "@app/types";

type ConnectionState = "connecting" | "connected" | "idle";

function useBlockedActionsQueue({
  blockedActions,
}: {
  blockedActions: BlockedToolExecution[];
}) {
  const [blockedActionsQueue, setBlockedActionsQueue] = useState<
    BlockedActionQueueItem[]
  >(blockedActions.map((action) => ({ blockedAction: action })));

  useEffect(() => {
    if (blockedActions.length > 0) {
      setBlockedActionsQueue((prevQueue) => {
        const existingIds = new Set(
          prevQueue.map((v) => v.blockedAction.actionId)
        );
        const newItems = blockedActions
          .filter((v) => !existingIds.has(v.actionId))
          .map((blockedAction) => ({
            blockedAction,
          }));
        return [...prevQueue, ...newItems];
      });
    }
  }, [blockedActions]);

  const enqueueBlockedAction = ({
    message,
    blockedAction,
  }: {
    message: LightAgentMessageType;
    blockedAction: BlockedToolExecution;
  }) => {
    setBlockedActionsQueue((prevQueue) => {
      const existingIndex = prevQueue.findIndex(
        (v) => v.blockedAction.actionId === blockedAction.actionId
      );

      // If the action is not in the queue, add it.
      // If the action is in the queue, replace it with the new one.
      return existingIndex === -1
        ? [...blockedActionsQueue, { blockedAction, message }]
        : prevQueue.map((item, index) =>
            index === existingIndex ? { blockedAction, message } : item
          );
    });
  };

  const shiftBlockedActionQueue = useCallback(() => {
    setBlockedActionsQueue((prevQueue) => prevQueue.slice(1));
  }, []);

  const removeCompletedAction = useCallback((actionId: string) => {
    setBlockedActionsQueue((prevQueue) =>
      prevQueue.filter((item) => item.blockedAction.actionId !== actionId)
    );
  }, []);

  return {
    blockedActionsQueue,
    enqueueBlockedAction,
    shiftBlockedActionQueue,
    removeCompletedAction,
  };
}

type ActionValidationContextType = {
  enqueueBlockedAction: (params: {
    message: LightAgentMessageType;
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
  const { createPersonalConnection } = useCreatePersonalConnection(owner);

  const { blockedActions } = useBlockedActions({
    conversationId: conversation?.sId || null,
    workspaceId: owner.sId,
  });

  const { blockedActionsQueue, enqueueBlockedAction, removeCompletedAction } =
    useBlockedActionsQueue({
      blockedActions,
    });

  // Track connection states for each authentication item
  const [connectionStates, setConnectionStates] = useState<
    Record<string, ConnectionState>
  >({});

  const pendingValidations = useMemo(() => {
    return blockedActionsQueue.filter(
      (action) => action.blockedAction.status === "blocked_validation_required"
    );
  }, [blockedActionsQueue]);

  const pendingAuthentications = useMemo(() => {
    return blockedActionsQueue.filter(
      (action) =>
        action.blockedAction.status === "blocked_authentication_required"
    );
  }, [blockedActionsQueue]);

  // Count of already validated actions.
  // used to keep track of the current page in the dialog and the total number of pages.
  const [validatedActions, setValidatedActions] = useState(0);

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

  useEffect(() => {
    // Close the dialog when there are no more blocked actions
    if (blockedActionsQueue.length === 0 && isDialogOpen && !isValidating) {
      setIsDialogOpen(false);
    }
  }, [blockedActionsQueue.length, isDialogOpen, isValidating]);

  const submitValidation = async (status: MCPValidationOutputType) => {
    setSubmitStatus(status);
    if (!blockedActionsQueue.length) {
      return;
    }

    const currentBlockedAction = blockedActionsQueue[0];

    const { blockedAction, message } = currentBlockedAction;
    const result = await validateAction({
      validationRequest: blockedAction,
      message,
      approved:
        status === "approved" && neverAskAgain ? "always_approved" : status,
    });

    if (!result.success) {
      return;
    }

    removeCompletedAction(blockedAction.actionId);

    setSubmitStatus(null);
    setNeverAskAgain(false);
    setErrorMessage(null);

    setValidatedActions((c) => c + 1);
  };

  const showBlockedActionsDialog = useCallback(() => {
    if (blockedActionsQueue.length > 0) {
      setValidatedActions(0);
      setIsDialogOpen(true);
    }
  }, [blockedActionsQueue.length]);

  // Remove all completed authentication actions from the queue
  // We want to wait until all authentication actions are connected to remove them from the queue
  const handleDone = useCallback(() => {
    pendingAuthentications.forEach((item) => {
      removeCompletedAction(item.blockedAction.actionId);
    });
    setIsDialogOpen(false);
  }, [pendingAuthentications, removeCompletedAction]);

  const hasPendingValidations = pendingValidations.length > 0;
  const hasPendingAuthentications = pendingAuthentications.length > 0;
  const hasBlockedActions = hasPendingValidations || hasPendingAuthentications;
  const totalBlockedActions =
    pendingValidations.length + pendingAuthentications.length;

  // Check if all authentication actions are connected
  const areAllAuthenticationsConnected = useMemo(() => {
    if (!hasPendingAuthentications) {
      return true;
    }
    return pendingAuthentications.every(
      (item) => connectionStates[item.blockedAction.actionId] === "connected"
    );
  }, [hasPendingAuthentications, pendingAuthentications, connectionStates]);

  const pages = useMemo(() => {
    // Total count is:
    // number of validated actions
    // + number of pending validations
    // +1 if there are pending authentications has it's all in one page.
    const totalCount =
      validatedActions +
      (hasPendingAuthentications ? 1 : 0) +
      pendingValidations.length;

    if (totalCount === 0) {
      return [];
    }

    return Array.from({ length: totalCount }, (_, index) => {
      if (hasPendingAuthentications && index === 0) {
        // Create a combined authentication page with all pending authentications
        const authActions: (BlockedToolExecution & {
          status: "blocked_authentication_required";
        })[] = pendingAuthentications
          .map((item) => item.blockedAction)
          .filter(
            (
              item
            ): item is BlockedToolExecution & {
              status: "blocked_authentication_required";
            } => item.status === "blocked_authentication_required"
          );

        return {
          id: "auth",
          title: "Personal authentication required",
          description:
            "The agent took an action that requires personal authentication",
          icon: undefined,
          content: (
            <AuthenticationDialogPage
              authActions={authActions}
              connectionStates={connectionStates}
              onConnectionStateChange={(actionId, status) =>
                setConnectionStates((prev) => ({
                  ...prev,
                  [actionId]: status,
                }))
              }
              createPersonalConnection={createPersonalConnection}
              errorMessage={errorMessage}
            />
          ),
        };
      }

      // Index within the validations section (excluding the optional auth page)
      const validationSectionIndex = hasPendingAuthentications
        ? index - 1
        : index;

      if (validationSectionIndex < validatedActions) {
        return {
          id: index.toString(),
          title: "Completed",
          icon: ActionPieChartIcon,
          content: (
            <div className="py-4 text-sm text-muted-foreground">
              Action already processed
            </div>
          ),
        };
      }

      const pendingValidationIndex = validationSectionIndex - validatedActions;
      const currentBlockedAction = pendingValidations[pendingValidationIndex];

      if (!currentBlockedAction) {
        return {
          id: index.toString(),
          title: "Completed",
          icon: ActionPieChartIcon,
          content: (
            <div className="py-4 text-sm text-muted-foreground">
              Action already processed
            </div>
          ),
        };
      }

      const { blockedAction } = currentBlockedAction;

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
  }, [
    errorMessage,
    neverAskAgain,
    validatedActions,
    connectionStates,
    createPersonalConnection,
    hasPendingAuthentications,
    pendingValidations,
    pendingAuthentications,
  ]);

  const currentPageId = useMemo(() => {
    if (pages.length === 0) {
      return "";
    }
    if (hasPendingAuthentications && validatedActions === 0) {
      return "auth";
    }
    const nextValidation = pendingValidations[validatedActions];
    return nextValidation
      ? `validation-${nextValidation.blockedAction.actionId}`
      : pages[0].id;
  }, [pages, hasPendingAuthentications, validatedActions, pendingValidations]);

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
            hideCloseButton={
              !(hasPendingAuthentications && validatedActions === 0)
            }
            size="lg"
            isAlertDialog
            showNavigation={true}
            showHeaderNavigation={false}
            footerContent={(() => {
              // Check if we're on the authentication page (first page with pending authentications)
              const isOnAuthenticationDialogPage =
                hasPendingAuthentications && validatedActions === 0;

              if (isOnAuthenticationDialogPage) {
                return (
                  <div className="flex flex-row justify-end gap-2">
                    <Button
                      variant="highlight"
                      label="Done"
                      onClick={handleDone}
                      disabled={!areAllAuthenticationsConnected}
                    />
                  </div>
                );
              }

              // For validation pages, show the usual Allow/Decline buttons
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
