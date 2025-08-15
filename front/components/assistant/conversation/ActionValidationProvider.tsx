import {
  ActionPieChartIcon,
  Button,
  Checkbox,
  CodeBlock,
  CollapsibleComponent,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Label,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useCallback, useState } from "react";

import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { getAvatarFromIcon } from "@app/lib/actions/mcp_icons";
import { usePendingValidations } from "@app/lib/swr/pending_validations";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
  MCPActionValidationRequest,
} from "@app/types";
import { asDisplayName, pluralize } from "@app/types";

function useValidationQueue(pendingValidations: MCPActionValidationRequest[]) {
  // All except the first one, which will go into currentValidation.
  const [validationQueue, setValidationQueue] = useState(
    pendingValidations.slice(1)
  );

  const [currentValidation, setCurrentValidation] =
    useState<MCPActionValidationRequest | null>(pendingValidations[0] || null);

  // The current validation request is the one being processed.
  // The queue does not stores the current validation request.
  // It's memoized since it's used as a dependency of the hook.
  const handleValidationRequest = useCallback(
    (validationRequest: MCPActionValidationRequest) => {
      setCurrentValidation((current) => {
        if (current === null) {
          return validationRequest;
        }

        setValidationQueue((prevQueue) => [...prevQueue, validationRequest]);
        return current;
      });
    },
    []
  );

  // We don't update the current validation here to avoid content flickering.
  const takeNextFromQueue = () => {
    if (validationQueue.length > 0) {
      const nextValidation = validationQueue[0];
      const newQueue = validationQueue.slice(1);
      setValidationQueue(newQueue);
      return nextValidation;
    } else {
      return null;
    }
  };

  return {
    validationQueue,
    currentValidation,
    handleValidationRequest,
    takeNextFromQueue,
    setCurrentValidation,
  };
}

type ActionValidationContextType = {
  showValidationDialog: (
    validationRequest?: MCPActionValidationRequest
  ) => void;
  hasPendingValidations: boolean;
  totalPendingValidations: number;
};

const ActionValidationContext = React.createContext<
  ActionValidationContextType | undefined
>(undefined);

export function useActionValidationContext() {
  const context = React.useContext(ActionValidationContext);
  if (!context) {
    throw new Error(
      "useActionValidationContext must be used within an ActionValidationContext"
    );
  }
  return context;
}

interface ActionValidationProviderProps {
  owner: LightWorkspaceType;
  conversation: ConversationWithoutContentType | null;
  children: React.ReactNode;
}

export function ActionValidationProvider({
  owner,
  conversation,
  children,
}: ActionValidationProviderProps) {
  const { pendingValidations } = usePendingValidations({
    conversationId: conversation?.sId || null,
    workspaceId: owner.sId,
  });

  const {
    validationQueue,
    currentValidation,
    setCurrentValidation,
    handleValidationRequest,
    takeNextFromQueue,
  } = useValidationQueue(pendingValidations);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [neverAskAgain, setNeverAskAgain] = useState(false);

  useNavigationLock(isDialogOpen);

  const sendCurrentValidation = async (status: MCPValidationOutputType) => {
    if (!currentValidation) {
      return;
    }

    let approved = status;
    if (status === "approved" && neverAskAgain) {
      approved = "always_approved";
    }

    setErrorMessage(null);
    setIsProcessing(true);

    const response = await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${currentValidation.conversationId}/messages/${currentValidation.messageId}/validate-action`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actionId: currentValidation.actionId,
          approved,
        }),
      }
    );

    setIsProcessing(false);

    if (!response.ok) {
      setErrorMessage("Failed to assess action approval. Please try again.");
      return;
    }

    setNeverAskAgain(false);
  };

  const handleSubmit = (approved: MCPValidationOutputType) => {
    void sendCurrentValidation(approved);

    const foundItem = takeNextFromQueue();
    if (foundItem) {
      setCurrentValidation(foundItem);
    } else {
      // To avoid content flickering, we will clear out the current validation in onDialogAnimationEnd.
      setIsDialogOpen(false);
    }
  };

  // To avoid content flickering, we will clear out the current validation when closing animation ends.
  const onDialogAnimationEnd = () => {
    // This is safe to check because the dialog closing animation is triggered after isDialogOpen is set to false.
    if (!isDialogOpen) {
      setCurrentValidation(null);
      setErrorMessage(null);
    }
  };

  // This will be used as a dependency of the hook down the line so we need to use useCallback.
  const showValidationDialog = useCallback(
    (validationRequest?: MCPActionValidationRequest) => {
      // If we have a new validation request, queue it.
      if (validationRequest) {
        handleValidationRequest(validationRequest);
      }

      // Always open the dialog if there are pending validations (if not already open)/
      if (!isDialogOpen && (currentValidation || validationQueue.length > 0)) {
        setIsDialogOpen(true);
      }
    },
    [
      handleValidationRequest,
      currentValidation,
      validationQueue.length,
      isDialogOpen,
    ]
  );

  const hasPendingValidations =
    currentValidation !== null || validationQueue.length > 0;
  const totalPendingValidations =
    (currentValidation ? 1 : 0) + validationQueue.length;

  return (
    <ActionValidationContext.Provider
      value={{
        showValidationDialog,
        hasPendingValidations,
        totalPendingValidations,
      }}
    >
      {children}

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isProcessing && currentValidation) {
            void handleSubmit("rejected");
          }
        }}
      >
        <DialogContent isAlertDialog onAnimationEnd={onDialogAnimationEnd}>
          <DialogHeader>
            <DialogTitle
              visual={
                currentValidation?.metadata.icon ? (
                  getAvatarFromIcon(currentValidation.metadata.icon)
                ) : (
                  <Icon visual={ActionPieChartIcon} size="sm" />
                )
              }
            >
              Tool Validation Required
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <div className="flex flex-col gap-4">
              <div>
                Allow <b>@{currentValidation?.metadata.agentName}</b> to use the
                tool{" "}
                <b>{asDisplayName(currentValidation?.metadata.toolName)}</b>{" "}
                from{" "}
                <b>
                  {asDisplayName(currentValidation?.metadata.mcpServerName)}
                </b>
                ?
              </div>
              {currentValidation?.inputs &&
                Object.keys(currentValidation.inputs).length > 0 && (
                  <CollapsibleComponent
                    triggerChildren={
                      <span className="font-medium text-muted-foreground dark:text-muted-foreground-night">
                        Details
                      </span>
                    }
                    contentChildren={
                      <div>
                        <div className="max-h-80 overflow-auto rounded-lg bg-muted dark:bg-muted-night">
                          <CodeBlock
                            wrapLongLines
                            className="language-json overflow-y-auto"
                          >
                            {JSON.stringify(currentValidation?.inputs, null, 2)}
                          </CodeBlock>
                        </div>
                      </div>
                    }
                  />
                )}

              {validationQueue.length > 0 && (
                <div className="mt-2 text-sm font-medium text-info-900 dark:text-info-900-night">
                  {validationQueue.length} more request
                  {pluralize(validationQueue.length)} in the queue
                </div>
              )}

              {errorMessage && (
                <div className="mt-2 text-sm font-medium text-warning-800 dark:text-warning-800-night">
                  {errorMessage}
                </div>
              )}
            </div>
            {currentValidation?.stake === "low" && (
              <div className="mt-5">
                <Label className="copy-sm flex w-fit cursor-pointer flex-row items-center gap-2 py-2 pr-2 font-normal">
                  <Checkbox
                    checked={neverAskAgain}
                    onCheckedChange={(check) => {
                      setNeverAskAgain(!!check);
                    }}
                  />
                  <span>Always allow this tool</span>
                </Label>
              </div>
            )}
          </DialogContainer>
          <DialogFooter>
            <Button
              label="Decline"
              variant="outline"
              onClick={() => handleSubmit("rejected")}
              disabled={isProcessing}
            >
              {isProcessing && (
                <div className="flex items-center">
                  <span className="mr-2">Declining</span>
                  <Spinner size="xs" variant="dark" />
                </div>
              )}
            </Button>
            <Button
              label="Allow"
              variant="highlight"
              onClick={() => handleSubmit("approved")}
              disabled={isProcessing}
            >
              {isProcessing && (
                <div className="flex items-center">
                  <span className="mr-2">Approving</span>
                  <Spinner size="xs" variant="light" />
                </div>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ActionValidationContext.Provider>
  );
}
