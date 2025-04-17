import {
  ActionPieChartIcon,
  Button,
  CodeBlock,
  CollapsibleComponent,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { createContext, useCallback, useEffect, useState } from "react";

import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import type {
  MCPToolStakeLevelType,
  MCPValidationMetadataType,
  MCPValidationOutputType,
} from "@app/lib/actions/constants";
import type { MCPActionType } from "@app/lib/actions/mcp";
import { asDisplayName } from "@app/types";

type ActionValidationContextType = {
  showValidationDialog: (validationRequest: {
    workspaceId: string;
    messageId: string;
    conversationId: string;
    action: MCPActionType;
    inputs: Record<string, unknown>;
    stake?: MCPToolStakeLevelType;
    metadata: MCPValidationMetadataType;
  }) => void;
};

// Pending validation requests, keyed by message ID
export type PendingValidationRequestType = {
  workspaceId: string;
  messageId: string;
  conversationId: string;
  action: MCPActionType;
  inputs: Record<string, unknown>;
  stake?: MCPToolStakeLevelType;
  metadata: MCPValidationMetadataType;
};

export const ActionValidationContext =
  createContext<ActionValidationContextType>({} as ActionValidationContextType);

function useValidationQueue() {
  const [validationQueue, setValidationQueue] = useState<
    PendingValidationRequestType[]
  >([]);
  const [currentValidation, setCurrentValidation] =
    useState<PendingValidationRequestType | null>(null);

  // Queue stores the pending validation requests
  // The current validation request is the one being processed
  // The queue does not stores the current validation request
  const addToQueue = (validationRequest: PendingValidationRequestType) => {
    setCurrentValidation((current) => {
      if (current === null) {
        return validationRequest;
      }

      setValidationQueue((prevQueue) => [...prevQueue, validationRequest]);
      return current;
    });
  };

  const takeNextFromQueue = () => {
    if (validationQueue.length > 0) {
      const nextValidation = validationQueue[0];
      const newQueue = validationQueue.slice(1);
      setValidationQueue(newQueue);
      setCurrentValidation(nextValidation);
      return nextValidation;
    } else {
      setCurrentValidation(null);
      return null;
    }
  };

  return {
    validationQueue,
    currentValidation,
    addToQueue,
    takeNextFromQueue,
  };
}

export function ActionValidationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { validationQueue, currentValidation, addToQueue, takeNextFromQueue } =
    useValidationQueue();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [neverAskAgain, setNeverAskAgain] = useState(false);

  useNavigationLock(isDialogOpen);

  const sendCurrentValidation = useCallback(
    async (status: MCPValidationOutputType) => {
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
        `/api/w/${currentValidation.workspaceId}/assistant/conversations/${currentValidation.conversationId}/messages/${currentValidation.messageId}/validate-action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actionId: currentValidation.action.id,
            approved,
          }),
        }
      );

      if (!response.ok) {
        setErrorMessage("Failed to assess action approval. Please try again.");
        return;
      }

      setNeverAskAgain(false);
    },
    [currentValidation, neverAskAgain]
  );

  const handleSubmit = useCallback(
    (approved: MCPValidationOutputType) => {
      void sendCurrentValidation(approved);
      setIsProcessing(false);
      const foundItem = takeNextFromQueue();
      if (!foundItem) {
        setIsDialogOpen(false);
      }
    },
    [sendCurrentValidation, takeNextFromQueue]
  );

  useEffect(() => {
    if (currentValidation) {
      setIsDialogOpen(true);
    }
  }, [currentValidation]);

  const showValidationDialog = (validationRequest: {
    workspaceId: string;
    messageId: string;
    conversationId: string;
    action: MCPActionType;
    inputs: Record<string, unknown>;
    stake?: MCPToolStakeLevelType;
    metadata: MCPValidationMetadataType;
  }) => {
    addToQueue(validationRequest);
    setErrorMessage(null);
  };

  return (
    <ActionValidationContext.Provider value={{ showValidationDialog }}>
      {children}

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (open === false && !isProcessing) {
            if (currentValidation) {
              void handleSubmit("rejected");
            }
          }
        }}
      >
        <DialogContent isAlertDialog>
          <DialogHeader>
            <DialogTitle visual={<ActionPieChartIcon />}>
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
                      <span className="font-medium">Details</span>
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
                  {validationQueue.length} more requests
                  {validationQueue.length > 1 ? "s" : ""} in queue
                </div>
              )}

              {errorMessage && (
                <div className="mt-2 text-sm font-medium text-warning-800 dark:text-warning-800-night">
                  {errorMessage}
                </div>
              )}
            </div>
          </DialogContainer>
          <DialogFooter
            permanentValidation={
              currentValidation?.stake === "low"
                ? {
                    label: "Never ask again",
                    checked: neverAskAgain,
                    onChange: (check) => {
                      setNeverAskAgain(!!check);
                    },
                  }
                : undefined
            }
          >
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
              label="Approve"
              variant="primary"
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
