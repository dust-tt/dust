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

import { AuthenticationDialogPage } from "@app/components/assistant/conversation/blocked_actions/AuthentificationDialogPage";
import { ToolValidationDialogPage } from "@app/components/assistant/conversation/blocked_actions/ToolValidationDialogPage";
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

type BlockedActionQueueItem = {
  message?: LightAgentMessageType;
  blockedAction: BlockedToolExecution;
};

const EMPTY_BLOCKED_ACTIONS_QUEUE: BlockedActionQueueItem[] = [];

type AuthenticationRequiredBlockedAction = BlockedToolExecution & {
  status: "blocked_authentication_required";
};

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
        blockedActions.map((action) => ({ blockedAction: action }))
      );
    } else {
      setBlockedActionsQueue(EMPTY_BLOCKED_ACTIONS_QUEUE);
    }
  }, [conversationId, blockedActions]);

  const enqueueBlockedAction = ({
    message,
    blockedAction,
  }: {
    message: LightAgentMessageType;
    blockedAction: BlockedToolExecution;
  }) => {
    // Only enqueue actions for the current conversation
    if (blockedAction.conversationId !== conversationId) {
      return;
    }

    setBlockedActionsQueue((prevQueue) => {
      const existingIndex = prevQueue.findIndex(
        (v) => v.blockedAction.actionId === blockedAction.actionId
      );

      // If the action is not in the queue, add it.
      // If the action is in the queue, replace it with the new one.
      return existingIndex === -1
        ? [...prevQueue, { blockedAction, message }]
        : prevQueue.map((item, index) =>
            index === existingIndex ? { blockedAction, message } : item
          );
    });
  };

  const removeCompletedAction = useCallback((actionId: string) => {
    setBlockedActionsQueue((prevQueue) =>
      prevQueue.filter((item) => item.blockedAction.actionId !== actionId)
    );
  }, []);

  return {
    blockedActionsQueue,
    enqueueBlockedAction,
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
  const conversationId = conversation?.sId || null;

  const { blockedActions } = useBlockedActions({
    conversationId,
    workspaceId: owner.sId,
  });

  const { blockedActionsQueue, enqueueBlockedAction, removeCompletedAction } =
    useBlockedActionsQueue({
      blockedActions,
      conversationId,
    });

  const pendingValidations = useMemo(() => {
    return blockedActionsQueue.filter(
      (action) => action.blockedAction.status === "blocked_validation_required"
    );
  }, [blockedActionsQueue]);

  const pendingAuthorizations = useMemo(() => {
    return blockedActionsQueue.filter(
      (action) =>
        action.blockedAction.status === "blocked_authentication_required"
    );
  }, [blockedActionsQueue]);

  const [currentStep, setCurrentStep] = useState<"auth" | "validation">(
    "validation"
  );

  const [currentValidationIndex, setCurrentValidationIndex] = useState(0);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [neverAskAgain, setNeverAskAgain] = useState(false);

  // Track the status of the current submit action.
  const [submitStatus, setSubmitStatus] =
    useState<MCPValidationOutputType | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Track connection states for authentication actions
  const [connectionStates, setConnectionStates] = useState<
    Record<string, "connecting" | "connected" | "idle">
  >({});

  const { validateAction, isValidating } = useValidateAction({
    owner,
    conversation,
    onError: setErrorMessage,
  });

  const { createPersonalConnection } = useCreatePersonalConnection(owner);

  useNavigationLock(isDialogOpen);

  const handleRetry = useCallback(async () => {
    if (!conversationId) {
      return;
    }

    const firstMessage =
      pendingValidations[0]?.message || pendingAuthorizations[0]?.message;
    if (!firstMessage) {
      return;
    }

    try {
      await fetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${firstMessage.sId}/retry?blocked_only=true`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      pendingValidations.forEach((item) => {
        removeCompletedAction(item.blockedAction.actionId);
      });

      pendingAuthorizations.forEach((item) => {
        removeCompletedAction(item.blockedAction.actionId);
      });

      setIsDialogOpen(false);
      setCurrentStep("validation");
      setCurrentValidationIndex(0);
    } catch (error) {
      setErrorMessage("Failed to resume conversation. Please try again.");
    }
  }, [
    conversationId,
    pendingValidations,
    pendingAuthorizations,
    owner.sId,
    removeCompletedAction,
  ]);

  useEffect(() => {
    // Close the dialog when there are no more blocked actions
    if (blockedActionsQueue.length === 0 && isDialogOpen && !isValidating) {
      setIsDialogOpen(false);
      setCurrentStep("validation");
      setCurrentValidationIndex(0);
    }
  }, [blockedActionsQueue.length, isDialogOpen, isValidating]);

  useEffect(() => {
    if (
      pendingAuthorizations.length > 0 &&
      Object.values(connectionStates).every((state) => state === "connected")
    ) {
      void handleRetry();
    }
  }, [connectionStates, pendingAuthorizations.length, handleRetry]);

  useEffect(() => {
    if (
      currentStep === "auth" &&
      pendingAuthorizations.length === 0 &&
      pendingValidations.length > 0
    ) {
      setCurrentStep("validation");
      setCurrentValidationIndex(0);
    }

    if (
      currentStep === "validation" &&
      pendingValidations.length === 0 &&
      pendingAuthorizations.length > 0
    ) {
      setCurrentStep("auth");
    }
  }, [currentStep, pendingAuthorizations.length, pendingValidations.length]);

  const submitValidation = async (status: MCPValidationOutputType) => {
    setSubmitStatus(status);
    if (!pendingValidations.length) {
      return;
    }

    const currentBlockedAction = pendingValidations[currentValidationIndex];
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

    setSubmitStatus(null);
    setNeverAskAgain(false);
    setErrorMessage(null);

    // Move to next validation or close dialog if done
    if (currentValidationIndex + 1 < pendingValidations.length) {
      setCurrentValidationIndex(currentValidationIndex + 1);
    } else {
      pendingValidations.forEach((item) => {
        removeCompletedAction(item.blockedAction.actionId);
      });

      // If there are still pending authorizations, switch to auth step
      if (pendingAuthorizations.length > 0) {
        setCurrentStep("auth");
        setCurrentValidationIndex(0);
      } else {
        // Close dialog if no more blocked actions
        setIsDialogOpen(false);
        setCurrentStep("validation");
        setCurrentValidationIndex(0);
      }
    }
  };

  const showBlockedActionsDialog = useCallback(() => {
    if (blockedActionsQueue.length > 0) {
      // Always show validation first if there are pending validations
      if (pendingAuthorizations.length > 0) {
        setCurrentStep("auth");
      } else if (pendingValidations.length > 0) {
        setCurrentStep("validation");
      }

      setCurrentValidationIndex(0);
      setIsDialogOpen(true);
    }
  }, [
    blockedActionsQueue.length,
    pendingValidations.length,
    pendingAuthorizations.length,
  ]);

  const handleConnectionStateChange = useCallback(
    (actionId: string, status: "connecting" | "connected" | "idle") => {
      setConnectionStates((prev) => ({
        ...prev,
        [actionId]: status,
      }));
    },
    []
  );

  const hasPendingValidations = pendingValidations.length > 0;
  const hasPendingAuthorizations = pendingAuthorizations.length > 0;
  const hasBlockedActions = hasPendingValidations || hasPendingAuthorizations;
  const totalBlockedActions =
    pendingValidations.length + pendingAuthorizations.length;

  const pages = useMemo(() => {
    if (currentStep === "validation" && hasPendingValidations) {
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

    if (currentStep === "auth" && hasPendingAuthorizations) {
      return [
        {
          id: "authorization",
          title: "Authentication Required",
          icon: ActionPieChartIcon,
          content: (
            <AuthenticationDialogPage
              authActions={pendingAuthorizations.map(
                (item) =>
                  item.blockedAction as AuthenticationRequiredBlockedAction
              )}
              connectionStates={connectionStates}
              onConnectionStateChange={handleConnectionStateChange}
              createPersonalConnection={createPersonalConnection}
              errorMessage={errorMessage}
            />
          ),
        },
      ];
    }

    return [];
  }, [
    currentStep,
    hasPendingValidations,
    hasPendingAuthorizations,
    pendingValidations,
    pendingAuthorizations,
    errorMessage,
    neverAskAgain,
    connectionStates,
    handleConnectionStateChange,
    createPersonalConnection,
  ]);

  const currentPageId = useMemo(() => {
    if (pages.length === 0) {
      return "";
    }

    if (
      currentStep === "validation" &&
      pendingValidations[currentValidationIndex]
    ) {
      return `validation-${pendingValidations[currentValidationIndex].blockedAction.actionId}`;
    }

    if (currentStep === "auth") {
      return "authorization";
    }

    return pages[0]?.id || "";
  }, [pages, currentStep, currentValidationIndex, pendingValidations]);

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
            hideCloseButton={currentStep === "auth"}
            size="lg"
            isAlertDialog
            showNavigation={currentStep === "validation" && pages.length > 1}
            showHeaderNavigation={false}
            footerContent={(() => {
              if (currentStep === "validation") {
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
              }

              return null;
            })()}
          />
        )}
      </MultiPageDialog>
    </ActionValidationContext.Provider>
  );
}
